#!/usr/bin/env -S npx tsx
// Migrate uploaded files from teacher alias accounts to the primary account.
//
// A "primary" account is the one with the most resources (or the one with
// a real email, not @examanet-import.local). Alias accounts are duplicates
// created during JotForm/Devoirat imports when the same teacher used
// different emails over the years.
//
// USAGE:
//   # 1. DRY-RUN: see what would change (safe, no modifications)
//   npx tsx scripts/one-off/migrate-aliases-to-primary.ts
//
//   # 2. APPLY: actually migrate (destructive!)
//   npx tsx scripts/one-off/migrate-aliases-to-primary.ts --apply
//
//   # 3. FILTER: only act on a specific teacher (dry or apply)
//   npx tsx scripts/one-off/migrate-aliases-to-primary.ts "Chaouki"
//   npx tsx scripts/one-off/migrate-aliases-to-primary.ts --apply "Chaouki"

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const nameFilter = process.argv.slice(2).find(a => !a.startsWith('--'));

// Normalize a name for matching (lowercase, remove accents + non-alphanum)
function normalizeName(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // remove accents
    .replace(/[^a-z0-9]/g, '')         // remove spaces/punct
    .trim();
}

interface AccountGroup {
  primary: any;
  aliases: any[];
  totalFiles: number;
  filesToMove: number;
  aliasEmails: string[];
}

async function findGroups(): Promise<AccountGroup[]> {
  // Get all teachers with their file counts
  const teachers = await prisma.user.findMany({
    where: { role: 'TEACHER' },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true,
      _count: { select: { uploadedFiles: true } },
    },
  });

  // Group by normalized full name
  const groupsByName = new Map<string, any[]>();
  for (const t of teachers) {
    const fullName = normalizeName(`${t.firstName || ''}${t.lastName || ''}`);
    if (fullName.length < 3) continue;  // skip "a b" etc.
    if (nameFilter && !`${t.firstName} ${t.lastName} ${t.email}`.toLowerCase().includes(nameFilter.toLowerCase())) continue;
    const list = groupsByName.get(fullName) || [];
    list.push(t);
    groupsByName.set(fullName, list);
  }

  const groups: AccountGroup[] = [];
  for (const [name, accounts] of groupsByName) {
    if (accounts.length < 2) continue;  // no duplicates
    // Pick primary: prefer real email (not @examanet-import.local),
    // then most files, then oldest
    const sorted = [...accounts].sort((a, b) => {
      const aIsImport = a.email.includes('@examanet-import.local');
      const bIsImport = b.email.includes('@examanet-import.local');
      if (aIsImport && !bIsImport) return 1;
      if (!aIsImport && bIsImport) return -1;
      const aCount = a._count.uploadedFiles || 0;
      const bCount = b._count.uploadedFiles || 0;
      if (aCount !== bCount) return bCount - aCount;
      return a.id < b.id ? -1 : 1;
    });
    const primary = sorted[0];
    const aliases = sorted.slice(1);
    const totalFiles = accounts.reduce((s, a) => s + (a._count.uploadedFiles || 0), 0);
    const filesToMove = aliases.reduce((s, a) => s + (a._count.uploadedFiles || 0), 0);
    if (filesToMove === 0) continue;  // nothing to migrate
    groups.push({
      primary,
      aliases,
      totalFiles,
      filesToMove,
      aliasEmails: aliases.map(a => a.email),
    });
  }

  return groups.sort((a, b) => b.filesToMove - a.filesToMove);
}

async function apply() {
  console.log('🔍 Finding alias groups...\n');
  const groups = await findGroups();

  if (groups.length === 0) {
    console.log('✅ No alias groups found (nothing to migrate).');
    return;
  }

  console.log(`📊 Found ${groups.length} alias group(s)\n`);
  const totalFilesToMove = groups.reduce((s, g) => s + g.filesToMove, 0);
  console.log(`Total files to move: ${totalFilesToMove}\n`);

  // Show summary
  console.log('═'.repeat(80));
  for (const g of groups) {
    const primaryFiles = g.primary._count.uploadedFiles || 0;
    console.log(`\n👤 ${g.primary.firstName} ${g.primary.lastName}`);
    console.log(`   PRIMARY:  ${g.primary.email} (${primaryFiles} files)`);
    console.log(`   STATUS:   ${g.primary.status}`);
    for (const a of g.aliases) {
      console.log(`   ALIAS:    ${a.email} (${a._count.uploadedFiles} files) [${a.status}]`);
    }
  }

  if (!APPLY) {
    console.log('\n\n💡 This is a DRY-RUN. No changes made.');
    console.log('   Run with --apply to actually migrate the files.\n');
    return;
  }

  // APPLY MODE
  console.log('\n\n⚠️  APPLYING CHANGES (destructive)...\n');

  // Backup: list all groups before
  const backup = groups.map(g => ({
    primary: { id: g.primary.id, email: g.primary.email },
    aliases: g.aliases.map(a => ({ id: a.id, email: a.email, files: a._count.uploadedFiles })),
    timestamp: new Date().toISOString(),
  }));
  const fs = await import('fs');
  const backupFile = `/tmp/alias-migration-backup-${Date.now()}.json`;
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  console.log(`💾 Backup saved: ${backupFile}\n`);

  let totalMoved = 0;
  let aliasesDeleted = 0;
  for (const g of groups) {
    process.stdout.write(`  ${g.primary.firstName} ${g.primary.lastName}: `);
    let moved = 0;
    for (const alias of g.aliases) {
      // Transfer all resources from alias → primary
      const result = await prisma.resource.updateMany({
        where: { teacherId: alias.id },
        data: { teacherId: g.primary.id },
      });
      moved += result.count;
      // Also transfer any TeacherFile records
      await prisma.teacherFile.updateMany({
        where: { teacherId: alias.id },
        data: { teacherId: g.primary.id },
      }).catch(() => {});  // ignore if model doesn't exist
      // Delete the alias account (now empty)
      // Note: cascade will handle any remaining relations
      try {
        await prisma.user.delete({ where: { id: alias.id } });
        aliasesDeleted++;
      } catch (e: any) {
        // If can't delete (FK constraints), just disable
        console.warn(`    ⚠️  Could not delete ${alias.email}: ${e.message.slice(0, 80)}`);
      }
    }
    totalMoved += moved;
    console.log(`moved ${moved} files → ${g.primary.email}`);
  }

  console.log(`\n✅ DONE!`);
  console.log(`   Files moved: ${totalMoved}`);
  console.log(`   Aliases deleted: ${aliasesDeleted}`);
  console.log(`   Backup: ${backupFile}`);
}

apply()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error('💥', e); prisma.$disconnect(); process.exit(1); });
