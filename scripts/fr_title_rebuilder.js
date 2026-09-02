/**
 * FR Title Rebuilder (2026-08-09)
 */

require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');

const TYPE_LABELS = {
  DEVOIR: 'Devoir',
  EXAM: 'Examen',
  EXERCISE: "Série d'exercices",
  COURSE: 'Cours',
  CORRECTION: 'Devoir Corrigé',
  RESUME: 'Résumé',
};

const SUBTYPE_LABELS = {
  controle: 'de Contrôle',
  synthese: 'de Synthèse',
};

function buildTitle(file, dryRun = true) {
  const { type, homeworkSubtype, homeworkNumber, year, trimester, class: cls, section, metadata } = file;
  const gs = metadata?.generalSubject;
  
  let typePart = TYPE_LABELS[type] || type;
  if (type === 'DEVOIR' && homeworkSubtype) {
    const subtype = SUBTYPE_LABELS[homeworkSubtype.toLowerCase()] || homeworkSubtype;
    typePart = `Devoir ${subtype}${homeworkNumber ? ' N°' + homeworkNumber : ''}`;
  }
  
  // Short class label (use the user-facing convention)
  let classPart = '';
  const slug = cls?.slug || '';
  if (slug === '1ere-secondaire') classPart = '1ère AS';
  else if (slug === '2eme-secondaire') classPart = '2ème AS';
  else if (slug === '3eme-secondaire') classPart = '3ème AS';
  else if (slug === '4eme-secondaire') classPart = 'Bac';
  else if (slug === '7eme') classPart = '7ème';
  else if (slug === '8eme') classPart = '8ème';
  else if (slug === '9eme') classPart = '9ème';
  else classPart = cls?.nameFr || '';
  
  let sectionPart = '';
  if (section?.nameFr) sectionPart = ` - Section ${section.nameFr}`;
  
  const yearPart = year ? ` (${year})` : '';
  // Only show trimester for collège (lycée uses semesters, no trimester)
  const isCollege = ['7eme', '8eme', '9eme'].includes(cls?.slug);
  const trimPart = (isCollege && trimester) ? ` Trim${trimester}` : '';
  const gsPart = gs ? ` : ${gs}` : '';
  
  let title = `${typePart} - Français - ${classPart}${trimPart}${sectionPart}${yearPart}${gsPart}`;
  title = title.replace(/\s+/g, ' ').trim();
  if (title.length > 200) title = title.substring(0, 197) + '...';
  return title;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');
  
  const p = new PrismaClient({ log: ['error'] });
  const files = await p.resource.findMany({
    where: { 
      status: 'PUBLISHED', 
      subject: { slug: 'francais' },
      class: { level: { slug: 'lycee' } },
    },
    select: { 
      id: true, numericId: true, title: true, type: true, 
      homeworkSubtype: true, homeworkNumber: true,
      year: true, trimester: true, schoolType: true,
      class: { select: { nameFr: true, slug: true } },
      section: { select: { nameFr: true, slug: true } },
      metadata: { select: { generalSubject: true } },
    },
  });
  console.log(`Rebuilding ${files.length} titles... (${dryRun ? 'DRY RUN' : 'APPLY'})`);
  
  let updated = 0;
  let skipped = 0;
  const changes = [];
  for (const f of files) {
    const newTitle = buildTitle(f);
    if (newTitle !== f.title) {
      if (dryRun) {
        changes.push({ numericId: f.numericId, old: f.title, new: newTitle });
        if (changes.length <= 5) {
          console.log(`\n#${f.numericId}:`);
          console.log(`  OLD: ${f.title}`);
          console.log(`  NEW: ${newTitle}`);
        }
      } else {
        await p.resource.update({ where: { id: f.id }, data: { title: newTitle } });
      }
      updated++;
    } else {
      skipped++;
    }
  }
  console.log(`\nUpdated: ${updated}, Skipped: ${skipped}`);
  if (dryRun) {
    console.log(`\nRun with --apply to commit changes.`);
  }
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
