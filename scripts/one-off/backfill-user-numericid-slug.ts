#!/usr/bin/env -S npx tsx
// Backfill User.numericId (1..N) and User.slug (firstname-lastname or email local part)
//
// Run after adding the columns to the User model:
//   prisma db push --accept-data-loss
//
// Then:
//   npx tsx scripts/one-off/backfill-user-numericid-slug.ts

import { PrismaClient } from '@prisma/client';
import { properSlugify } from '../../src/lib/slugify';

const prisma = new PrismaClient();

function makeSlug(firstName: string | null, lastName: string | null, email: string, id: string): string {
  const first = (firstName || '').trim();
  const last = (lastName || '').trim();
  let base: string;
  if (first && last) {
    base = `${first}-${last}`;
  } else if (last) {
    base = last;
  } else if (first) {
    base = first;
  } else {
    // Fallback: email local part
    base = email.split('@')[0] || id;
  }
  return properSlugify(base) || id;
}

async function main() {
  console.log('🔍 Loading all users...');
  const users = await prisma.user.findMany({
    select: { id: true, email: true, firstName: true, lastName: true, numericId: true, slug: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`   ${users.length} users found`);
  console.log(`   ${users.filter(u => u.numericId).length} already have numericId (skipping)`);
  console.log('');

  // Assign slug to users that don't have one
  const needsUpdate = users.filter(u => !u.slug);
  console.log(`📝 Assigning slug to ${needsUpdate.length} users (numericId already populated)...`);

  let updated = 0;
  for (let i = 0; i < needsUpdate.length; i++) {
    const u = needsUpdate[i];
    const slug = makeSlug(u.firstName, u.lastName, u.email, u.id);
    await prisma.user.update({
      where: { id: u.id },
      data: { slug },
    });
    updated++;
    if (updated % 100 === 0) {
      process.stdout.write(`  ${updated}/${needsUpdate.length}\r`);
    }
  }
  console.log(`✅ Updated ${updated} users`);

  // Now make slug NOT NULL
  console.log('\n📌 Making slug NOT NULL...');
  try {
    await prisma.$executeRaw`ALTER TABLE "User" ALTER COLUMN "slug" SET NOT NULL`;
    console.log('✅ slug is now NOT NULL');
  } catch (e: any) {
    console.warn(`⚠️ Could not set slug NOT NULL: ${e.message.slice(0, 100)}`);
  }

  // Verify
  const totalWithNumericId = await prisma.user.count({ where: { numericId: { not: null } } });
  const totalWithSlug = await prisma.user.count({ where: { slug: { not: null } } });
  console.log(`\n📊 Final state:`);
  console.log(`   Users with numericId: ${totalWithNumericId}`);
  console.log(`   Users with slug:     ${totalWithSlug}`);

  // Show first 5 + last 3
  const samples = await prisma.user.findMany({
    where: { numericId: { not: null } },
    orderBy: { numericId: 'asc' },
    take: 5,
    select: { numericId: true, slug: true, firstName: true, lastName: true, email: true },
  });
  console.log('\nFirst 5:');
  for (const s of samples) {
    console.log(`  #${s.numericId}  /${s.slug}  |  ${s.firstName} ${s.lastName}  |  ${s.email}`);
  }

  const last3 = await prisma.user.findMany({
    where: { numericId: { not: null } },
    orderBy: { numericId: 'desc' },
    take: 3,
    select: { numericId: true, slug: true, firstName: true, lastName: true, email: true },
  });
  console.log('\nLast 3:');
  for (const s of last3) {
    console.log(`  #${s.numericId}  /${s.slug}  |  ${s.firstName} ${s.lastName}  |  ${s.email}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error('💥', e); prisma.$disconnect(); process.exit(1); });
