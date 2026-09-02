#!/usr/bin/env -S npx tsx
// Deduplicate Resource rows by merging stats from copies to the oldest.
//
// A "duplicate group" is defined as: same teacherId + same title + same fileSize.
// For each group:
//   1. Keep the ORIGINAL = oldest resource (by createdAt)
//   2. MIGRATE stats from each copy to the original:
//        views/downloads/favorites/comments/ratingCount: simple addition
//        avgRating: weighted average by ratingCount
//   3. SOFT-DELETE copies: status = 'ARCHIVED'
//   4. OPTIONALLY delete blobs from Vercel Blob with --delete-blobs
//
// SAFETY: dry-run by default. --apply required to actually modify.
//
// USAGE:
//   npx tsx scripts/one-off/dedup-resources.ts                  # dry-run all
//   npx tsx scripts/one-off/dedup-resources.ts --apply          # do it
//   npx tsx scripts/one-off/dedup-resources.ts --apply --delete-blobs
//   npx tsx scripts/one-off/dedup-resources.ts "Chaouki"        # dry-run one teacher
//   npx tsx scripts/one-off/dedup-resources.ts --apply "Chaouki"

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const DELETE_BLOBS = process.argv.includes('--delete-blobs');
const nameFilter = process.argv.slice(2).find(a => !a.startsWith('--'));

interface Group {
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  title: string;
  fileSize: number;
  original: any;
  copies: any[];
  statsToMigrate: {
    views: number;
    downloads: number;
    favorites: number;
    comments: number;
    ratingCount: number;
    ratingPoints: number;  // sum of (avgRating * ratingCount)
  };
}

function computeStatsToMigrate(original: any, copies: any[]): Group['statsToMigrate'] {
  let views = 0, downloads = 0, favorites = 0, comments = 0, ratingCount = 0, ratingPoints = 0;
  for (const c of copies) {
    views += c.viewsCount || 0;
    downloads += c.downloadsCount || 0;
    favorites += c.favoritesCount || 0;
    comments += c.commentsCount || 0;
    ratingCount += c.ratingCount || 0;
    ratingPoints += (c.avgRating || 0) * (c.ratingCount || 0);
  }
  return { views, downloads, favorites, comments, ratingCount, ratingPoints };
}

async function findGroups(): Promise<Group[]> {
  // Get all resources, joined with teacher info
  const resources = await prisma.resource.findMany({
    select: {
      id: true, numericId: true, title: true, fileSize: true, fileUrl: true,
      status: true, teacherId: true, createdAt: true,
      viewsCount: true, downloadsCount: true, favoritesCount: true,
      commentsCount: true, avgRating: true, ratingCount: true,
    },
  });

  // Filter by name if provided
  let filtered = resources;
  if (nameFilter) {
    // Need to load teacher info to filter
    const teacherIds = new Set(resources.map(r => r.teacherId).filter(Boolean));
    const teachers = await prisma.user.findMany({
      where: { id: { in: [...teacherIds] } },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    const teacherMap = new Map(teachers.map(t => [t.id, t]));
    const lowerFilter = nameFilter.toLowerCase();
    const matchingTeacherIds = new Set(
      teachers
        .filter(t =>
          (t.firstName + ' ' + t.lastName + ' ' + t.email).toLowerCase().includes(lowerFilter)
        )
        .map(t => t.id)
    );
    filtered = resources.filter(r => r.teacherId && matchingTeacherIds.has(r.teacherId));
  }

  // Group by (teacherId, title, fileSize), excluding already archived
  const live = filtered.filter(r => r.status !== 'ARCHIVED');
  const byKey = new Map<string, any[]>();
  for (const r of live) {
    if (!r.teacherId) continue;
    const key = `${r.teacherId}|${r.title}|${r.fileSize || 0}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(r);
  }

  // Load all teachers once
  const allTeacherIds = new Set(live.map(r => r.teacherId!).filter(Boolean));
  const teachers = await prisma.user.findMany({
    where: { id: { in: [...allTeacherIds] } },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  const teacherMap = new Map(teachers.map(t => [t.id, t]));

  const groups: Group[] = [];
  for (const [key, items] of byKey) {
    if (items.length < 2) continue;
    // Sort by createdAt ascending → first is oldest = original
    items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const original = items[0];
    const copies = items.slice(1);
    const teacher = teacherMap.get(original.teacherId!);
    if (!teacher) continue;
    groups.push({
      teacherId: original.teacherId!,
      teacherName: `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim(),
      teacherEmail: teacher.email,
      title: original.title,
      fileSize: original.fileSize || 0,
      original,
      copies,
      statsToMigrate: computeStatsToMigrate(original, copies),
    });
  }

  return groups.sort((a, b) => b.copies.length - a.copies.length);
}

async function deleteBlob(fileUrl: string) {
  if (!fileUrl || !fileUrl.includes('vercel-storage.com')) return false;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.warn('  ⚠️  BLOB_READ_WRITE_TOKEN not set, skipping blob deletion');
    return false;
  }
  try {
    // Vercel Blob delete API: POST to the URL with x-vercel-blob-delete-token header
    const res = await fetch(fileUrl, {
      method: 'DELETE',
      headers: { 'authorization': `Bearer ${token}` },
    });
    return res.ok;
  } catch (e: any) {
    console.warn(`  ⚠️  Failed to delete blob: ${e.message.slice(0, 80)}`);
    return false;
  }
}

async function main() {
  console.log('🔍 Finding duplicate groups...\n');
  const groups = await findGroups();

  if (groups.length === 0) {
    console.log('✅ No duplicate groups found.');
    return;
  }

  const totalCopies = groups.reduce((s, g) => s + g.copies.length, 0);
  const totalViewsMigrated = groups.reduce((s, g) => s + g.statsToMigrate.views, 0);
  const totalDownloadsMigrated = groups.reduce((s, g) => s + g.statsToMigrate.downloads, 0);
  const totalFavoritesMigrated = groups.reduce((s, g) => s + g.statsToMigrate.favorites, 0);

  console.log(`📊 Summary:`);
  console.log(`   Duplicate groups:     ${groups.length}`);
  console.log(`   Copies to remove:    ${totalCopies}`);
  console.log(`   Views to migrate:    ${totalViewsMigrated.toLocaleString('fr-FR')}`);
  console.log(`   Downloads to migrate:${totalDownloadsMigrated.toLocaleString('fr-FR')}`);
  console.log(`   Favorites to migrate:${totalFavoritesMigrated.toLocaleString('fr-FR')}`);
  console.log('');

  // Show top 10 worst offenders
  console.log('═'.repeat(80));
  console.log('Top 15 worst offenders:');
  console.log('─'.repeat(80));
  for (const g of groups.slice(0, 15)) {
    console.log(`  ${g.copies.length}x copies  |  ${g.teacherName.padEnd(30)}  |  ${g.title.slice(0, 50)}`);
    console.log(`     → views +${g.statsToMigrate.views}, downloads +${g.statsToMigrate.downloads}, favorites +${g.statsToMigrate.favorites}, comments +${g.statsToMigrate.comments}`);
  }
  console.log('');

  if (!APPLY) {
    console.log('💡 This is a DRY-RUN. No changes made.');
    console.log('   Run with --apply to actually merge stats and soft-delete copies.');
    if (DELETE_BLOBS) console.log('   --delete-blobs detected: will also delete from Vercel Blob storage.');
    return;
  }

  // APPLY MODE
  console.log('⚠️  APPLYING CHANGES (stats migration + soft-delete copies)...\n');

  // Backup before
  const backup = {
    timestamp: new Date().toISOString(),
    groups: groups.map(g => ({
      teacherId: g.teacherId,
      title: g.title,
      fileSize: g.fileSize,
      originalId: g.original.id,
      originalNumericId: g.original.numericId,
      copyIds: g.copies.map(c => c.id),
      statsMigrated: g.statsToMigrate,
    })),
  };
  const backupFile = `/tmp/dedup-backup-${Date.now()}.json`;
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  console.log(`💾 Backup saved: ${backupFile}\n`);

  let groupsProcessed = 0;
  let copiesArchived = 0;
  let blobsDeleted = 0;
  let blobsFailed = 0;

  for (const g of groups) {
    const newRatingCount = g.original.ratingCount + g.statsToMigrate.ratingCount;
    const newRatingPoints = g.original.avgRating * g.original.ratingCount + g.statsToMigrate.ratingPoints;
    const newAvgRating = newRatingCount > 0 ? newRatingPoints / newRatingCount : 0;

    // Update the original with migrated stats
    await prisma.resource.update({
      where: { id: g.original.id },
      data: {
        viewsCount: g.original.viewsCount + g.statsToMigrate.views,
        downloadsCount: g.original.downloadsCount + g.statsToMigrate.downloads,
        favoritesCount: g.original.favoritesCount + g.statsToMigrate.favorites,
        commentsCount: g.original.commentsCount + g.statsToMigrate.comments,
        ratingCount: newRatingCount,
        avgRating: newAvgRating,
      },
    });

    // Soft-delete copies
    for (const c of g.copies) {
      await prisma.resource.update({
        where: { id: c.id },
        data: { status: 'ARCHIVED' },
      });
      copiesArchived++;

      // Optionally delete blob
      if (DELETE_BLOBS && c.fileUrl) {
        const ok = await deleteBlob(c.fileUrl);
        if (ok) blobsDeleted++;
        else blobsFailed++;
      }
    }

    groupsProcessed++;
    if (groupsProcessed % 50 === 0) {
      process.stdout.write(`  ${groupsProcessed}/${groups.length} groups processed...\r`);
    }
  }

  console.log(`\n\n✅ DONE!`);
  console.log(`   Groups processed:     ${groupsProcessed}`);
  console.log(`   Copies archived:      ${copiesArchived}`);
  if (DELETE_BLOBS) {
    console.log(`   Blobs deleted:        ${blobsDeleted}`);
    console.log(`   Blobs failed:         ${blobsFailed}`);
  }
  console.log(`   Stats migrated:       +${totalViewsMigrated.toLocaleString('fr-FR')} views, +${totalDownloadsMigrated.toLocaleString('fr-FR')} downloads, +${totalFavoritesMigrated.toLocaleString('fr-FR')} favorites`);
  console.log(`   Backup:               ${backupFile}`);
  console.log('');
  console.log('💡 Copies are soft-deleted (status=ARCHIVED). They will not appear in searches,');
  console.log('   but their data is preserved. To permanently delete, use:');
  console.log('   prisma.resource.deleteMany({ where: { status: "ARCHIVED" } })');
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error('💥', e); prisma.$disconnect(); process.exit(1); });
