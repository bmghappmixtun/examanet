#!/usr/bin/env -S npx tsx
/**
 * Rename all JotForm-imported resources to the format:
 *   "Devoir de Synthèse N°3 - Math DEVOIR - 9ème (2025-2026) Mr GHARBI RIDHA"
 *   "Devoir de Contrôle N°1 - Math DEVOIR - 7ème (2024-2025) Mr GHARBI RIDHA"
 * 
 * Parses the original filename to extract:
 *   - type (Synthèse/Contrôle)
 *   - number
 *   - class (7ème, 8ème, 9ème)
 *   - year (2025-2026)
 *   - subject (Math = default for Tunisiecollege.net 9ème)
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();
const TEACHER_ID = 'cmqj8v8c90002hqfuq6knpy3k';
const TEACHER_NAME = 'Mr GHARBI RIDHA';
const LOG = '/tmp/jotform-rename.log';

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

interface ParsedFilename {
  type: 'Synthèse' | 'Contrôle' | null;
  number: number | null;
  classLevel: string | null;  // "7ème", "8ème", "9ème"
  year: string | null;        // "2025-2026"
  subject: string;            // default "Math"
  resourceType: string;       // default "DEVOIR"
}

function parseFilename(filename: string): ParsedFilename {
  const result: ParsedFilename = {
    type: null, number: null, classLevel: null, year: null,
    subject: 'Math', resourceType: 'DEVOIR'
  };

  // Normalize: remove extension, lowercase for matching
  const f = filename.replace(/\.[^.]+$/, '').trim();

  // Detect type
  // Arabic
  if (/تأليفي/i.test(f)) result.type = 'Synthèse';
  else if (/مراقبة/i.test(f)) result.type = 'Contrôle';
  // French
  else if (/synth[èe]se/i.test(f)) result.type = 'Synthèse';
  else if (/contr[ôo]le/i.test(f)) result.type = 'Contrôle';
  else if (/examen|bac/i.test(f)) result.type = null;

  // Detect number
  // Arabic: عدد3 or عدد 3
  const arNumMatch = f.match(/عدد\s*(\d+)/);
  // French: N°3, N° 3, numero 3
  const frNumMatch = f.match(/N[°o°]\s*(\d+)/i) || f.match(/\bn[°o°]?\s*(\d+)/i);
  if (arNumMatch) result.number = parseInt(arNumMatch[1]);
  else if (frNumMatch) result.number = parseInt(frNumMatch[1]);

  // Detect class level
  // Arabic: 7 أ, 8 أ, 9 أ
  const arClassMatch = f.match(/(\d+)\s*أ/);
  // French: 7ème, 8ème, 9ème
  const frClassMatch = f.match(/(\d+)\s*[èe]me/i);
  if (arClassMatch) {
    const n = arClassMatch[1];
    result.classLevel = `${n}ème`;
  } else if (frClassMatch) {
    const n = frClassMatch[1];
    result.classLevel = `${n}ème`;
  }

  // Detect year (format YYYY-YYYY or YYYY-YY)
  const yearMatch = f.match(/(\d{4})[-\/](\d{2,4})/);
  if (yearMatch) {
    let y1 = yearMatch[1];
    let y2Raw = yearMatch[2];
    // If Y2 is 2 digits, prepend y1's century
    let y2 = y2Raw.length === 2 ? y1.slice(0, 2) + y2Raw : y2Raw;
    // Always put the earlier year first (Tunisian school year: Sept -> June)
    if (parseInt(y1) > parseInt(y2)) [y1, y2] = [y2, y1];
    result.year = `${y1}-${y2}`;
  }

  // Detect subject (only if explicit in filename)
  if (/physique|فيزياء/i.test(f)) result.subject = 'Physique';
  else if (/svt|علوم/i.test(f)) result.subject = 'SVT';
  else if (/arabe|عربية/i.test(f)) result.subject = 'Arabe';
  else if (/fran[çc]ais/i.test(f)) result.subject = 'Français';
  else if (/anglais|انكليزية/i.test(f)) result.subject = 'Anglais';
  else if (/math|رياضيات/i.test(f)) result.subject = 'Math';
  else if (/algo/i.test(f)) result.subject = 'Algo';
  else if (/informatique/i.test(f)) result.subject = 'Informatique';

  return result;
}

function buildTitle(parsed: ParsedFilename): string {
  const parts: string[] = [];
  if (parsed.type) parts.push(`Devoir de ${parsed.type}`);
  if (parsed.number !== null) parts.push(`N°${parsed.number}`);
  parts.push('-');
  parts.push(parsed.subject);
  parts.push(parsed.resourceType);
  parts.push('-');
  if (parsed.classLevel) parts.push(parsed.classLevel);
  if (parsed.year) parts.push(`(${parsed.year})`);
  parts.push(TEACHER_NAME);
  return parts.join(' ');
}

async function main() {
  log('=== Rename JotForm resources ===');
  const resources = await prisma.resource.findMany({
    where: {
      teacherId: TEACHER_ID,
      libraryFile: { notes: { contains: 'JotForm' } }
    },
    include: { libraryFile: true },
    orderBy: { createdAt: 'asc' }
  });
  log(`Found ${resources.length} resources to rename`);

  let success = 0, skipped = 0;
  for (const r of resources) {
    const originalName = r.libraryFile?.fileName || '';
    const parsed = parseFilename(originalName);
    const newTitle = buildTitle(parsed);

    // Skip if already in the expected format
    if (r.title === newTitle) {
      skipped++;
      continue;
    }

    await prisma.resource.update({
      where: { id: r.id },
      data: { title: newTitle }
    });
    success++;
    if (success <= 5) log(`  "${originalName.slice(0, 60)}" → "${newTitle}"`);
  }

  log(`=== Done: ${success} renamed, ${skipped} already correct ===`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
