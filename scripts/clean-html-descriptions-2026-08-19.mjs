#!/usr/bin/env node
/**
 * Strip HTML tags from Resource.description (2026-08-19)
 *
 * User feedback 2026-08-19: 'corrige les cards resumé ia des fichiers collège'
 *
 * The AI pipeline for collège files generated descriptions with HTML
 * tags (<strong>, <br>, <em>) that were rendered as raw text in the
 * UI, making the description card look broken.
 *
 * This script strips HTML tags from all Resource.description fields
 * in the DB. ~3758 resources had HTML in their descriptions.
 *
 * Approach:
 * - Replace <tags> with spaces
 * - Collapse multiple spaces
 * - Trim
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});

const stripHtml = (s) =>
  s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

async function main() {
  const BATCH = 200;
  let offset = 0;
  let total = 0;
  let updated = 0;
  while (true) {
    const batch = await p.resource.findMany({
      where: {
        status: 'PUBLISHED',
        description: { contains: '<' }
      },
      select: { id: true, description: true },
      take: BATCH,
      skip: offset,
    });
    if (batch.length === 0) break;
    total += batch.length;
    for (const r of batch) {
      if (!r.description) continue;
      const cleaned = stripHtml(r.description);
      if (cleaned !== r.description) {
        await p.resource.update({ where: { id: r.id }, data: { description: cleaned } });
        updated++;
      }
    }
    if (batch.length < BATCH) break;
    offset += BATCH;
  }
  console.log(`Scanned: ${total} | Updated: ${updated}`);
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });

// 2026-08-19 update: ran in batches, cleaned 3758 → 1 (remaining 1
// is #7442 with a math expression '2<n≤50' — not real HTML, kept
// as-is to avoid breaking math content).
