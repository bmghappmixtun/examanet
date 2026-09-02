import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const SEED = [
  // SUBJECTS (FR ↔ AR)
  {
    term: 'math',
    synonyms: ['mathematiques', 'mathématique', 'maths', 'رياضيات'],
    language: 'all',
    category: 'subject',
  },
  {
    term: 'phys',
    synonyms: ['physique', 'sciences physiques', 'فيزياء'],
    language: 'all',
    category: 'subject',
  },
  {
    term: 'svt',
    synonyms: ['sciences de la vie et de la terre', 'علوم الحياة والأرض', 'sciences naturelles'],
    language: 'all',
    category: 'subject',
  },
  {
    term: 'fr',
    synonyms: ['francais', 'français', 'الفرنسية'],
    language: 'all',
    category: 'subject',
  },
  { term: 'ar', synonyms: ['arabe', 'العربية'], language: 'all', category: 'subject' },
  {
    term: 'en',
    synonyms: ['anglais', 'الإنجليزية', 'english'],
    language: 'all',
    category: 'subject',
  },
  {
    term: 'info',
    synonyms: ['informatique', 'الاعلامية', 'computer science'],
    language: 'all',
    category: 'subject',
  },
  { term: 'philo', synonyms: ['philosophie', 'فلسفة'], language: 'all', category: 'subject' },
  { term: 'histo', synonyms: ['histoire', 'تاريخ'], language: 'all', category: 'subject' },
  { term: 'geo', synonyms: ['géographie', 'جغرافيا'], language: 'all', category: 'subject' },

  // TYPES
  { term: 'devoir', synonyms: ['devoirs', 'tâche', 'homework'], language: 'all', category: 'type' },
  {
    term: 'corrige',
    synonyms: ['correction', 'corrigés', 'corrigée', 'solution', 'corriges'],
    language: 'all',
    category: 'type',
  },
  {
    term: 'exercice',
    synonyms: ['exercices', 'série', 'td', 'exos'],
    language: 'all',
    category: 'type',
  },
  {
    term: 'resume',
    synonyms: ['résumé', 'résumés', 'synthèse', 'summaries'],
    language: 'all',
    category: 'type',
  },
  {
    term: 'examen',
    synonyms: ['examens', 'épreuve', 'bac blanc'],
    language: 'all',
    category: 'type',
  },
  {
    term: 'controle',
    synonyms: ['contrôle', 'controles', 'DS'],
    language: 'all',
    category: 'type',
  },
  {
    term: 'synthese',
    synonyms: ['synthèse', 'examen final', 'partiel'],
    language: 'all',
    category: 'type',
  },

  // CLASSES
  {
    term: 'bac',
    synonyms: ['baccalaureat', 'baccalauréat', 'الباكالوريا'],
    language: 'all',
    category: 'class',
  },
  {
    term: '1as',
    synonyms: ['1ere année secondaire', '1ère année secondaire', 'première année', 'الأولى ثانوي'],
    language: 'ar',
    category: 'class',
  },
  {
    term: '2as',
    synonyms: ['2eme année secondaire', '2ème année secondaire', 'deuxième année', 'الثانية ثانوي'],
    language: 'ar',
    category: 'class',
  },
  {
    term: '3as',
    synonyms: [
      '3eme année secondaire',
      '3ème année secondaire',
      'troisième année',
      'الثالثة ثانوي',
    ],
    language: 'ar',
    category: 'class',
  },
  {
    term: '4as',
    synonyms: [
      '4eme année secondaire',
      '4ème année secondaire',
      'quatrième année',
      'الرابعة ثانوي',
    ],
    language: 'ar',
    category: 'class',
  },
  {
    term: '7eme',
    synonyms: ['7ème année', 'septième année de base', 'السابعة أساسي'],
    language: 'ar',
    category: 'class',
  },
  {
    term: '8eme',
    synonyms: ['8ème année', 'huitième année de base', 'الثامنة أساسي'],
    language: 'ar',
    category: 'class',
  },
  {
    term: '9eme',
    synonyms: ['9ème année', 'neuvième année de base', 'التاسعة أساسي'],
    language: 'ar',
    category: 'class',
  },

  // SECTIONS
  {
    term: 'sciences',
    synonyms: ['science', 'exp', 'sciences exp'],
    language: 'fr',
    category: 'section',
  },
  {
    term: 'mathematiques',
    synonyms: ['math', 'رياضيات', 'maths'],
    language: 'fr',
    category: 'section',
  },
  {
    term: 'technique',
    synonyms: ['tech', 'sciences techniques'],
    language: 'fr',
    category: 'section',
  },
  {
    term: 'eco',
    synonyms: ['économie', 'gestion', 'eco-gestion'],
    language: 'fr',
    category: 'section',
  },
  { term: 'lettres', synonyms: ['lettre', 'اداب'], language: 'fr', category: 'section' },
  {
    term: 'sport',
    synonyms: ['sport', 'eps', 'éducation physique'],
    language: 'fr',
    category: 'section',
  },
  {
    term: 'info-ti',
    synonyms: ['informatique', 'TI', 'technologies informatique', 'sciences informatiques'],
    language: 'fr',
    category: 'section',
  },

  // COMMON MISSPELLINGS
  {
    term: 'mathematique',
    synonyms: ['mathématique', 'mathématiques', 'math'],
    language: 'fr',
    category: 'free',
  },
  { term: 'physique', synonyms: ['phys', 'physic', 'فيزياء'], language: 'fr', category: 'free' },
  {
    term: 'svt',
    synonyms: ['sciences de la vie et de la terre', 'biologie', 'علوم'],
    language: 'fr',
    category: 'free',
  },
];

let inserted = 0,
  updated = 0;
for (const s of SEED) {
  const result = await p.searchSynonym.upsert({
    where: {
      term_language_category: {
        term: s.term,
        language: s.language,
        category: s.category,
      },
    },
    update: { synonyms: s.synonyms },
    create: s,
  });
  if (result.createdAt.getTime() === result.updatedAt.getTime()) inserted++;
  else updated++;
}

console.log(`✓ Synonyms: ${inserted} created, ${updated} updated`);
console.log(`  Total: ${await p.searchSynonym.count()}`);

await p.$disconnect();
