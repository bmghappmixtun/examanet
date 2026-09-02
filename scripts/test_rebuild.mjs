import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
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
  if (lower.includes('série') || lower.includes('serie')) {
    return { kind: 'EXERCISE', subtype: null, label: "Série d'exercices" };
  }
  if (lower.includes('cours')) {
    return { kind: 'COURSE', subtype: null, label: 'Cours' };
  }
  return { kind: 'DEVOIR', subtype: 'CONTROL', label: 'Devoir de Contrôle' };
}

function buildNewTitle(r) {
  const { title, type, year, generalSubject, classSlug, sectionSlug, className, sectionName } = r;
  if (!generalSubject) return null;
  const typeInfo = extractType(title);
  const numero = extractNumero(title);
  const classShort = CLASS_SHORT[classSlug] || className;
  const sectionShort = sectionSlug ? sectionName : '';

  if (typeInfo.kind === 'COURSE') {
    const sectionPart = sectionShort ? ' ' + sectionShort : '';
    return 'Cours - Technologie: ' + generalSubject + ' - ' + classShort + sectionPart + ' (' + year + ')';
  } else if (typeInfo.kind === 'EXERCISE') {
    const sectionPart = sectionShort ? ' ' + sectionShort : '';
    return "Série d'exercices - Technologie: " + generalSubject + ' - ' + classShort + sectionPart + ' (' + year + ')';
  } else {
    const sectionPart = sectionShort ? ' ' + sectionShort : '';
    return typeInfo.label + ' N°' + numero + ' - Technologie: ' + generalSubject + ' - ' + classShort + sectionPart + ' (' + year + ')';
  }
}

async function main() {
  const samples = await p.$queryRaw`
    SELECT r."numericId", r.title, r.type, r.year,
           m."generalSubject",
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
    ORDER BY r.type, random()
    LIMIT 30
  `;
  for (const r of samples) {
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
    console.log('\n#' + r.numericId + ':');
    console.log('  OLD: ' + r.title);
    console.log('  NEW: ' + newTitle);
  }
  await p.$disconnect();
}
main().catch(console.error);
