#!/usr/bin/env -S npx tsx
/**
 * Delete the 75 pre-existing resources (NOT from JotForm migration)
 * for teacher Ridha Gharbi, keeping only the 91 imported ones.
 *
 * All related records (comments, ratings, favorites, views, downloads,
 * shares) cascade-delete automatically via the schema.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TEACHER_ID = 'cmqj8v8c90002hqfuq6knpy3k';
const LOG = '/tmp/delete-old-resources.log';

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  require('fs').appendFileSync(LOG, line + '\n');
}

async function main() {
  log('=== Deleting 75 pre-existing resources ===');

  const before = await prisma.resource.count({ where: { teacherId: TEACHER_ID } });
  log(`Before: ${before} resources for teacher`);

  // Count what will be cascade-deleted
  const oldResources = await prisma.resource.findMany({
    where: { teacherId: TEACHER_ID, libraryFileId: null },
    select: { id: true }
  });
  const ids = oldResources.map(r => r.id);
  const willDelete = {
    resources: ids.length,
    views: await prisma.view.count({ where: { resourceId: { in: ids } } }),
    downloads: await prisma.download.count({ where: { resourceId: { in: ids } } }),
    comments: await prisma.comment.count({ where: { resourceId: { in: ids } } }),
    ratings: await prisma.rating.count({ where: { resourceId: { in: ids } } }),
    favorites: await prisma.favorite.count({ where: { resourceId: { in: ids } } }),
  };
  log('Will delete (cascade):');
  for (const [k, v] of Object.entries(willDelete)) log(`  ${k}: ${v}`);

  // Delete the old resources (cascade handles deps)
  const result = await prisma.resource.deleteMany({
    where: { teacherId: TEACHER_ID, libraryFileId: null }
  });
  log(`Deleted ${result.count} resources`);

  // Verify
  const after = await prisma.resource.count({ where: { teacherId: TEACHER_ID } });
  const remaining = await prisma.resource.findMany({
    where: { teacherId: TEACHER_ID },
    select: { id: true, title: true, libraryFileId: true, createdAt: true }
  });
  log(`After: ${after} resources for teacher`);
  log('Breakdown:');
  const fromJotForm = remaining.filter(r => r.libraryFileId);
  log(`  From JotForm: ${fromJotForm.length}`);
  log(`  Manual: ${remaining.length - fromJotForm.length}`);

  // Final sanity: any orphan TeacherFiles?
  const orphans = await prisma.teacherFile.findMany({
    where: { teacherId: TEACHER_ID, resourceId: null }
  });
  log(`Orphan TeacherFiles (no resource link): ${orphans.length}`);

  log('=== Done ===');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
