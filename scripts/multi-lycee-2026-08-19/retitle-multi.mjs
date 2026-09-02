#!/usr/bin/env node
/**
 * Reformateur de titres multi-matières lycée (2026-08-19)
 *
 * Pour chaque fichier (arabe, philosophie, pensee-islamique, histoire, geographie, histoire-geographie):
 *   - Construit le nouveau titre au format Examanet:
 *     {Type} - {Sujet} - {Classe} - {Section} ({Year}) : {generalSubject}
 *   - Langue: AR si le sujet est une matière AR du système tunisien, FR sinon
 *   - Slug: regenerated (properSlugify + numericId suffix)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL }
  }
});

const ARABIC_SUBJECTS = new Set(['arabe', 'philosophie', 'pensee-islamique', 'histoire', 'geographie', 'histoire-geographie']);

const SUBJECTS = {
  arabe: 'Arabe',
  philosophie: 'Philosophie',
  'pensee-islamique': 'Pensée Islamique',
  histoire: 'Histoire',
  geographie: 'Géographie',
  'histoire-geographie': 'Histoire-Géographie',
};

const SUBJECTS_AR = {
  arabe: 'العربية',
  philosophie: 'الفلسفة',
  'pensee-islamique': 'التفكير الإسلامي',
  histoire: 'التاريخ',
  geographie: 'الجغرافيا',
  'histoire-geographie': 'التاريخ والجغرافيا',
};

const TYPE_LABELS_FR = {
  COURSE: 'Cours',
  HOMEWORK: 'Devoir',
  EXERCISE: "Série d'exercices",
  SUMMARY: 'Résumé',
  EXAM: 'Examen',
  REVISION: 'Révision',
  OTHER: 'Document',
};

const TYPE_LABELS_AR = {
  COURSE: 'درس',
  HOMEWORK: 'فرض',
  EXERCISE: 'سلسلة تمارين',
  SUMMARY: 'ملخص',
  EXAM: 'امتحان',
  REVISION: 'مراجعة',
  OTHER: 'وثيقة',
};

const TYPE_PREFIXES_FR = {
  DEVOIR_CONTROLE: 'Devoir de Contrôle',
  DEVOIR_SYNTHESE: 'Devoir de Synthèse',
  DEVOIR_MAISON: 'Devoir de Maison',
  SERIE_EXERCICES: "Série d'exercices",
  COURS: 'Cours',
  RESUME: 'Résumé',
  FICHE: 'Fiche',
  EXAMEN: 'Examen',
  AUTRE: 'Document',
};

const TYPE_PREFIXES_AR = {
  DEVOIR_CONTROLE: 'فرض مراقبة',
  DEVOIR_SYNTHESE: 'فرض تأليفي',
  DEVOIR_MAISON: 'واجب منزلي',
  SERIE_EXERCICES: 'سلسلة تمارين',
  COURS: 'درس',
  RESUME: 'ملخص',
  FICHE: 'بطاقة',
  EXAMEN: 'اختبار كتابي',
  AUTRE: 'وثيقة',
};

const CLASS_LABELS_FR = {
  '1ere-secondaire': '1AS',
  '2eme-secondaire': '2AS',
  '3eme-secondaire': '3AS',
  '4eme-secondaire': '4AS',
};

const CLASS_LABELS_AR = {
  '1ere-secondaire': 'الأولى ثانوي',
  '2eme-secondaire': 'الثانية ثانوي',
  '3eme-secondaire': 'الثالثة ثانوي',
  '4eme-secondaire': 'الرابعة ثانوي',
};

const SECTION_LABELS_FR = {
  'sciences-informatique': 'Sciences de l\'informatique',
  maths: 'Mathématiques',
  lettres: 'Lettres',
  'eco-gestion': 'Économie-Gestion',
  technique: 'Technique',
  'sciences-experimentales': 'Sciences Expérimentales',
  'sciences-techniques': 'Sciences Techniques',
  sport: 'Sport',
};

const SECTION_LABELS_AR = {
  'sciences-informatique': 'علوم الإعلامية',
  'technologies-informatique': 'علوم الإعلامية',
  maths: 'الرياضيات',
  lettres: 'الآداب',
  'eco-gestion': 'الاقتصاد والتصرف',
  'eco-services': 'الاقتصاد والخدمات',
  technique: 'التقنية',
  sciences: 'العلوم',
  'sciences-experimentales': 'العلوم التجريبية',
  'sciences-techniques': 'العلوم التقنية',
  sport: 'الرياضة',
};

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const subjectArg = args.find(a => a.startsWith('--subject='));
const SUBJECT_FILTER = subjectArg ? subjectArg.slice(10) : null;

console.log(`📝 Reformateur de titres MULTI-matières lycée (2026-08-19)`);
console.log(`   Mode: ${DRY_RUN ? 'DRY-RUN' : 'COMMIT'}${SUBJECT_FILTER ? ` (subject: ${SUBJECT_FILTER})` : ''}`);

function properSlugify(text, maxLen) {
  // Arabic → ASCII transliteration
  const arabicMap = {
    'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a',
    'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh',
    'د': 'd', 'ذ': 'th', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
    'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh',
    'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
    'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'h',
  };
  let s = text;
  // Transliterate Arabic
  s = s.replace(/[\u0600-\u06FF]/g, c => arabicMap[c] || '');
  // Keep Latin accented chars
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // strip combining marks
  // Replace anything not alphanumeric with -
  s = s.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
  s = s.replace(/^-+|-+$/g, '');
  if (maxLen && s.length > maxLen) s = s.slice(0, maxLen).replace(/-+$/, '');
  return s;
}

function buildNewTitle(r, subject, isAr) {
  const typePrefixes = isAr ? TYPE_PREFIXES_AR : TYPE_PREFIXES_FR;
  const typeLabels = isAr ? TYPE_LABELS_AR : TYPE_LABELS_FR;
  const classLabels = isAr ? CLASS_LABELS_AR : CLASS_LABELS_FR;
  const sectionLabels = isAr ? SECTION_LABELS_AR : SECTION_LABELS_FR;
  const subjectLabel = isAr ? SUBJECTS_AR[subject] : SUBJECTS[subject];

  // Type: use headerData.type if available, else Resource.type
  const aiType = r.headerData?.type || r.headerData?.homeworkSubtype;
  let typeStr;
  if (isAr) {
    if (aiType === 'DEVOIR_CONTROLE') typeStr = 'فرض مراقبة';
    else if (aiType === 'DEVOIR_SYNTHESE') typeStr = 'فرض تأليفي';
    else if (aiType === 'DEVOIR_MAISON') typeStr = 'واجب منزلي';
    else if (aiType === 'EXERCICE') typeStr = 'سلسلة تمارين';
    else if (aiType === 'COURS') typeStr = 'درس';
    else if (aiType === 'RESUME') typeStr = 'ملخص';
    else if (aiType === 'AUTRE') typeStr = 'وثيقة';
    else typeStr = typeLabels[r.type] || 'وثيقة';
  } else {
    if (aiType === 'DEVOIR_CONTROLE') typeStr = 'Devoir de Contrôle';
    else if (aiType === 'DEVOIR_SYNTHESE') typeStr = 'Devoir de Synthèse';
    else if (aiType === 'DEVOIR_MAISON') typeStr = 'Devoir de Maison';
    else if (aiType === 'EXERCICE') typeStr = "Série d'exercices";
    else if (aiType === 'COURS') typeStr = 'Cours';
    else if (aiType === 'RESUME') typeStr = 'Résumé';
    else if (aiType === 'AUTRE') typeStr = 'Document';
    else typeStr = typeLabels[r.type] || 'Document';
  }

  // Homework number
  // 2026-08-19: 'N°' in Latin was leaking into 100% AR titles.
  // Use 'عدد' (adad = number) in AR titles per user rule 'tous les titres
  // en arabe lycée doivent etre 100% arabe'.
  const hwNum = r.homeworkNumber;
  let typeWithNum = typeStr;
  if (hwNum && r.type === 'HOMEWORK') {
    const numSep = isAr ? ' عدد ' : ' N°';
    typeWithNum = `${typeStr}${numSep}${hwNum}`;
  }

  // Class
  const classLabel = classLabels[r.class?.slug] || r.class?.slug || '';

  // Section
  const sectionLabel = r.section ? (sectionLabels[r.section.slug] || r.section.slug) : '';

  // Year
  const year = r.year ? `(${r.year})` : '';

  // GeneralSubject
  const gs = r.metadata?.generalSubject;
  let topic = '';
  if (gs) {
    topic = isAr ? gs : gs;
  }

  // Build title
  // 2026-08-19: format = "{Type} - {Sujet} - {Classe} - [شعبة | Section]
  //   {Section} ({Year}) : {Topic}". Per user rule: 'on doit mettre des
  //   tirets "-" entre type et matière et classe et section' and
  //   'on doit mettre le mot section en arabe "شعبة" avant la section'.
  let parts = [typeWithNum];
  parts.push(subjectLabel);
  if (classLabel) parts.push(classLabel);
  if (sectionLabel) {
    parts.push(isAr ? `شعبة ${sectionLabel}` : `Section ${sectionLabel}`);
  }
  let title = parts.join(' - ');
  if (year) title += ` ${year}`;
  if (topic) title += ` : ${topic}`;
  return title;
}

async function main() {
  const where = {
    class: { slug: { in: ['1ere-secondaire', '2eme-secondaire', '3eme-secondaire', '4eme-secondaire'] } },
  };
  if (SUBJECT_FILTER) {
    where.subject = { slug: SUBJECT_FILTER };
  } else {
    where.subject = { slug: { in: Array.from(ARABIC_SUBJECTS) } };
  }

  const resources = await prisma.resource.findMany({
    where,
    include: {
      subject: true,
      class: true,
      section: true,
      metadata: true,
    },
    orderBy: { numericId: 'asc' },
  });
  console.log(`📦 ${resources.length} fichiers à re-titrer`);

  let updated = 0, skipped = 0;
  for (const r of resources) {
    const subject = r.subject.slug;
    const isAr = ARABIC_SUBJECTS.has(subject);
    const newTitle = buildNewTitle(r, subject, isAr);
    if (!newTitle) {
      skipped++;
      continue;
    }
    const newSlug = properSlugify(newTitle, 80) + '-' + r.numericId;

    if (DRY_RUN) {
      console.log(`  [DRY] #${r.numericId}: "${r.title}" → "${newTitle}"`);
      console.log(`         slug: "${newSlug}"`);
      updated++;
    } else {
      await prisma.resource.update({
        where: { id: r.id },
        data: { title: newTitle, slug: newSlug },
      });
      updated++;
    }
  }

  console.log(`\n📊 RÉSUMÉ:`);
  console.log(`   ✅ ${DRY_RUN ? 'Would update' : 'Updated'}: ${updated}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => {
    console.error('💥 Fatal:', e);
    prisma.$disconnect();
    process.exit(1);
  });
