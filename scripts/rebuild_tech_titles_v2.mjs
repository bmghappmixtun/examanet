#!/usr/bin/env node
/**
 * Rebuild Technologie lycée titles to Examanet standard format (v2):
 *   {Type} N°X - Technologie: {generalSubject} - {Classe} - Section {Section} ({Année}) [Lycée Pilote] (avec corrigé)
 *
 * Examples:
 *   "Devoir de Contrôle N°1 - Technologie: Dispositif De Serrage - 4AS - Section Technique (2024-2025)"
 *   "Devoir de Contrôle N°1 - Technologie: Liaison Mécanique - 4AS - Section Technique (2022-2023) [Lycée Pilote]"
 *   "Devoir de Synthèse N°1 - Technologie: Analyse Fonctionnelle - 3AS - Section Technique (2016-2017) (avec corrigé)"
 *
 * Steps:
 * 1. Build new title with all metadata (Section, Pilote, Corrigé)
 * 2. Update DB
 * 3. Old slugs auto-redirect via existing 308 code
 */
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import fs from 'fs';

config({ path: '/workspace/edutunisie/.env.local' });

const p = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

const CLASS_SHORT = {
  '1ere-secondaire': '1AS',
  '2eme-secondaire': '2AS',
  '3eme-secondaire': '3AS',
  '4eme-secondaire': '4AS',
};

function extractNumero(title) {
  const m = title.match(/N°\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  return 1;
}

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
    return { kind: 'EXERCISE', subtype: null, label: "Série d'exercices" };
  }
  if (lower.includes('cours')) {
    return { kind: 'COURSE', subtype: null, label: 'Cours' };
  }
  return { kind: 'DEVOIR', subtype: 'CONTROL', label: 'Devoir de Contrôle' };
}

function slugify(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['']/g, '')
    .replace(/['']/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 200);
}

function buildNewTitle(r) {
  const { title, generalSubject, classSlug, sectionSlug, className, sectionName, schoolType, hasCorrection } = r;
  if (!generalSubject) return null;

  const typeInfo = extractType(title);
  const numero = extractNumero(title);
  const classShort = CLASS_SHORT[classSlug] || className;
  const sectionShort = sectionSlug ? sectionName : '';

  // Build base title
  let baseTitle;
  if (typeInfo.kind === 'COURSE') {
    const sectionPart = sectionShort ? ` - Section ${sectionShort}` : '';
    baseTitle = `Cours - Technologie: ${generalSubject} - ${classShort}${sectionPart} (${r.year})`;
  } else if (typeInfo.kind === 'EXERCISE') {
    const sectionPart = sectionShort ? ` - Section ${sectionShort}` : '';
    baseTitle = `Série d'exercices - Technologie: ${generalSubject} - ${classShort}${sectionPart} (${r.year})`;
  } else {
    const sectionPart = sectionShort ? ` - Section ${sectionShort}` : '';
    baseTitle = `${typeInfo.label} N°${numero} - Technologie: ${generalSubject} - ${classShort}${sectionPart} (${r.year})`;
  }

  // Append metadata
  const tags = [];
  if (schoolType === 'PILOTE') tags.push('[Lycée Pilote]');
  if (hasCorrection) tags.push('(avec corrigé)');
  if (tags.length > 0) {
    baseTitle += ' ' + tags.join(' ');
  }

  return baseTitle;
}

function buildNewSlug(newTitle, numericId) {
  let slug = slugify(newTitle);
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
           c.slug as class_slug, s.slug as section_slug,
           r."schoolType", r."hasCorrection"
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

  const STATS = { updated: 0, unchanged: 0, errors: 0 };
  const errors = [];
  const changes = [];

  for (const r of all) {
    try {
      const mapped = {
        title: r.title,
        type: r.type,
        year: r.year,
        generalSubject: r.generalSubject,
        classSlug: r.class_slug,
        className: r.class_name,
        sectionSlug: r.section_slug,
        sectionName: r.section_name,
        schoolType: r.schoolType,
        hasCorrection: r.hasCorrection,
      };

      const newTitle = buildNewTitle(mapped);
      if (!newTitle) {
        STATS.errors++;
        continue;
      }

      const newSlug = buildNewSlug(newTitle, r.numericId);

      // Update only if changed
      if (r.title === newTitle && r.slug === newSlug) {
        STATS.unchanged++;
        continue;
      }

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
      changes.push({
        numericId: r.numericId,
        from: r.title,
        to: newTitle,
        section: r.section_name,
        pilote: r.schoolType === 'PILOTE',
        correction: r.hasCorrection,
      });

      if (STATS.updated <= 10) {
        console.log(`  ✓ #${r.numericId}: ${newTitle}`);
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

  // Stats by category
  const withPilote = changes.filter(c => c.pilote).length;
  const withCorrection = changes.filter(c => c.correction).length;
  const withSection = changes.filter(c => c.section).length;
  console.log(`\nChanges with Section: ${withSection}`);
  console.log(`Changes with [Lycée Pilote]: ${withPilote}`);
  console.log(`Changes with (avec corrigé): ${withCorrection}`);

  fs.writeFileSync('/tmp/title_changes_v2.json', JSON.stringify(changes, null, 2));
  console.log(`\nSaved ${changes.length} changes to /tmp/title_changes_v2.json`);

  await p.$disconnect();
}

main().catch(console.error);
