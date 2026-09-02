/**
 * lowercase-arabic-slugs.mjs
 *
 * Lowercase all Arabic slugs that have Latin characters in caps.
 * (Result of an earlier buggy fix that didn't call .toLowerCase())
 */

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const all = await p.resource.findMany({
  where: { slug: { contains: '-' } },
  select: { id: true, slug: true },
});

const toFix = all.filter(r => /[A-Z]/.test(r.slug));
console.log(`Found ${toFix.length} slugs with uppercase Latin chars`);

let fixed = 0;
for (const r of toFix) {
  const newSlug = r.slug.toLowerCase();
  if (newSlug === r.slug) continue;
  try {
    await p.resource.update({
      where: { id: r.id },
      data: { slug: newSlug }
    });
    fixed++;
    if (fixed <= 5) {
      console.log(`  ✅ ${r.id}`);
      console.log(`     ${r.slug} → ${newSlug}`);
    }
  } catch (e) {
    console.error(`  ❌ ${r.id}: ${e.message}`);
  }
}

console.log(`\nFixed: ${fixed}`);
await p.$disconnect();
