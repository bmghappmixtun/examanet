#!/usr/bin/env node
/**
 * Rebuild Technologie lycée titles to Examanet standard format:
 *   {Type} N°X - Technologie: {generalSubject} - {Classe} - {Section} ({Année})
 *
 * Examples:
 *   "Devoir de Contrôle N°1 - Technologie: Dispositif de serrage - 1AS - (2024-2025)"
 *   "Devoir de Contrôle N°1 - Technologie: Vé réglable en hauteur - 2AS Sciences - (2022-2023)"
 *   "Devoir de Contrôle N°1 - Technologie: Poste automatique d'alésage - 4AS Technique - (2024-2025)"
 *   "Cours - Technologie: Modélisation d'un système technique - 2AS Sciences - (2012-2013)"
 *   "Série d'exercices - Technologie: Moteur asynchrone - 4AS Technique - (2025-2026)"
 *
 * Steps:
 * 1. For each file, build new title + new slug
 * 2. Update DB
 * 3. Validate coherence title ↔ generalSubject ↔ systemName ↔ exerciseInsights
 * 4. Old slugs auto-redirect via existing 308 code
 */
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import fs from 'fs';

config({ path: '/workspace/edutunisie/.env.local' });

const p = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

// Class short form mapping
const CLASS_SHORT = {
  '1ere-secondaire': '1AS',
  '2eme-secondaire': '2AS',
  '3eme-secondaire': '3AS',
  '4eme-secondaire': '4AS',
};

const TYPE_MAP = {
  DEVOIR: {
    'CONTROL': 'Devoir de Contrôle',
    'SYNTHESIS': 'Devoir de Synthèse',
    'HOUSEWORK': 'Devoir de Maison',
  },
  EXERCISE: 'Série d\'exercices',
  COURSE: 'Cours',
};

// Extract N°X from title
function extractNumero(title) {
  // "Devoir de Contrôle N°1" or "Devoir de contrôle N°1" → 1
  // "Devoir de Synthèse N°3" → 3
  // "Devoir N°1" → 1
  const m = title.match(/N°\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  // "Devoir de contrôle 1" (no °)
  const m2 = title.match(/(?:Devoir|Cours|Serie|Série|Contrôle|Synth[eè]se)\s+(?:de\s+)?(?:Contrôle|Synth[eè]se|Maison)?\s*(\d+)\b/i);
  if (m2) return parseInt(m2[1], 10);
  return 1;
}

// Extract type (Devoir Contrôle / Devoir Synthèse / Cours / Série d'exercices)
function extractType(title) {
  const lower = title.toLowerCase();
  if (lower.includes('synthèse') || lower.includes('synthese')) {
    return { kind: 'DEVOIR', subtype: 'SYNTHESIS', label: 'Devoir de Synthèse' };
  }
  if (lower.includes('contrôle') || lower.includes('controle')) {
    return { kind: 'DEVOIR', subtype: 'CONTROL', label: 'Devoir de Contrôle' };
  }
  if (lower.includes('maison')) {
    return { kind: 'DEVOIR', subtype: 'HOUSEWORK', label: 'Devoir de Maison' };
  }
  if (lower.includes('série') || lower.includes('serie')) {
    return { kind: 'EXERCISE', subtype: null, label: 'Série d\'exercices' };
  }
  if (lower.includes('cours')) {
    return { kind: 'COURSE', subtype: null, label: 'Cours' };
  }
  return { kind: 'DEVOIR', subtype: 'CONTROL', label: 'Devoir de Contrôle' };
}

// Build slug
function slugify(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/['']/g, '')  // apostrophes
    .replace(/['']/g, '')
    .replace(/[^\w\s-]/g, '') // special chars
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 200);
}

function buildNewTitle(r) {
  const { title, type, year, generalSubject, classSlug, sectionSlug, className, sectionName } = r;
  if (!generalSubject) return null;

  const typeInfo = extractType(title);
  const numero = extractNumero(title);
  const classShort = CLASS_SHORT[classSlug] || className;
  const sectionShort = sectionSlug ? sectionName : '';

  let newTitle;
  if (typeInfo.kind === 'COURSE') {
    // "Cours - Technologie: {generalSubject} - {Classe} - {Section} ({Année})"
    const sectionPart = sectionShort ? ` ${sectionShort}` : '';
    newTitle = `Cours - Technologie: ${generalSubject} - ${classShort}${sectionPart} (${year})`;
  } else if (typeInfo.kind === 'EXERCISE') {
    // "Série d'exercices - Technologie: {generalSubject} - {Classe} - {Section} ({Année})"
    const sectionPart = sectionShort ? ` ${sectionShort}` : '';
    newTitle = `Série d'exercices - Technologie: ${generalSubject} - ${classShort}${sectionPart} (${year})`;
  } else {
    // "Devoir de Contrôle N°X - Technologie: {generalSubject} - {Classe} - {Section} ({Année})"
    const sectionPart = sectionShort ? ` ${sectionShort}` : '';
    newTitle = `${typeInfo.label} N°${numero} - Technologie: ${generalSubject} - ${classShort}${sectionPart} (${year})`;
  }

  return newTitle;
}

function buildNewSlug(newTitle, numericId) {
  // Strip the year parens and the numericId suffix
  let slug = slugify(newTitle);
  // Append numericId for uniqueness
  slug = `${slug}-${numericId}`;
  if (slug.length > 240) slug = slug.slice(0, 240);
  return slug;
}

async function main() {
  const all = await p.$queryRaw`
    SELECT r.id, r."numericId", r.title, r.type, r.year,
           m."generalSubject", m."systemName", m."courseSubject",
           m."exerciseInsights" IS NOT NULL as has_ei,
           c."nameFr" as class_name, s."nameFr" as section_name,
           c.slug as class_slug, s.slug as section_slug
    FROM "Resource" r
    JOIN "Subject" sub ON sub.id = r."subjectId"
    JOIN "Class" c ON c.id = r."classId"
    LEFT JOIN "Section" s ON s.id = r."sectionId"
    LEFT JOIN "ResourceMetadata" m ON m."resourceId" = r.id
    WHERE sub.slug = 'technologie'
      AND c.slug IN ('1ere-secondaire', '2eme-secondaire', '3eme-secondaire', '4eme-secondaire')
      AND r.status = 'PUBLISHED'
      AND m."generalSubject" IS NOT NULL
    ORDER BY r."numericId"
  `;
  console.log('Total to process:', all.length);

  const STATS = { updated: 0, unchanged: 0, errors: 0, coherence_ok: 0, coherence_warn: 0 };
  const errors = [];
  const changes = []; // for git/csv log

  for (const r of all) {
    try {
      // Map to expected field names
      const mapped = {
        title: r.title,
        type: r.type,
        year: r.year,
        generalSubject: r.generalSubject,
        classSlug: r.class_slug,
        className: r.class_name,
        sectionSlug: r.section_slug,
        sectionName: r.section_name,
      };

      const newTitle = buildNewTitle(mapped);
      if (!newTitle) {
        STATS.errors++;
        continue;
      }

      const newSlug = buildNewSlug(newTitle, r.numericId);

      // Coherence check
      let coherence = 'ok';
      if (r.has_ei && r.exerciseInsights) {
        const firstInsight = (r.exerciseInsights || [])[0] || '';
        if (r.systemName && !firstInsight.toLowerCase().includes(r.systemName.toLowerCase().slice(0, 8))) {
          coherence = 'warn';
        }
      }

      // Update only if changed
      if (r.title === newTitle && r.slug === newSlug) {
        STATS.unchanged++;
        STATS.coherence_ok++;
        continue;
      }

      // Also update homeworkSubtype from extracted type
      const typeInfo = extractType(r.title);
      const newSubtype = typeInfo.subtype;

      await p.resource.update({
        where: { id: r.id },
        data: {
          title: newTitle,
          slug: newSlug,
          ...(newSubtype && { homeworkSubtype: newSubtype }),
        },
      });

      STATS.updated++;
      if (coherence === 'ok') STATS.coherence_ok++;
      else STATS.coherence_warn++;
      changes.push({ from: r.title, to: newTitle, fromSlug: r.slug, toSlug: newSlug, coherence });

      if (STATS.updated <= 5) {
        console.log(`  ✓ #${r.numericId}: ${r.title.slice(0, 60)}...`);
        console.log(`      → ${newTitle}`);
        console.log(`      slug: ${newSlug}`);
      }
    } catch (e) {
      STATS.errors++;
      errors.push({ id: r.numericId, error: e.message });
    }
  }

  console.log('\n=== Summary ===');
  console.log(JSON.stringify(STATS, null, 2));
  if (errors.length > 0) {
    console.log(`\n${errors.length} ERRORS:`);
    errors.slice(0, 5).forEach(e => console.log(`  #${e.id}: ${e.error}`));
  }

  // Save the changes log
  fs.writeFileSync('/tmp/title_changes.json', JSON.stringify(changes, null, 2));
  console.log(`\nSaved ${changes.length} changes to /tmp/title_changes.json`);

  await p.$disconnect();
}

main().catch(console.error);
