#!/usr/bin/env node
/**
 * Pipeline multi-matières lycée (2026-08-19) — v1
 *
 * Pour les matières ARABE / PHILOSOPHIE / HISTOIRE / GEOGRAPHIE / PENSEE-ISLAMIQUE
 * Enseignées en ARABE dans le système éducatif tunisien.
 *
 * Pour chaque fichier:
 *   1. Lit le fullText depuis ResourceContent (déjà extrait en DB)
 *   2. Appelle GPT-4o-mini pour générer les attributs AI
 *      - subject-specific prompt
 *      - 100% ARABE (override file.language)
 *   3. Update ResourceMetadata (le reste de Resource est déjà OK)
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... node process-multi.mjs --subject=philosophie [--ids=1,2,3] [--dry-run]
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY manquant');
  process.exit(1);
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ONLY_MISSING = args.includes('--only-missing');
const FORCE = args.includes('--force'); // re-process even if exists
const idArg = args.find(a => a.startsWith('--ids='));
const IDS = idArg ? idArg.slice(6).split(',').map(Number) : null;
const limitArg = args.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.slice(8)) : null;
const subjectArg = args.find(a => a.startsWith('--subject='));
const SUBJECT = subjectArg ? subjectArg.slice(10) : null;

if (!SUBJECT) {
  console.error('❌ --subject=X required (X = arabe|philosophie|histoire|geographie|pensee-islamique|histoire-geographie)');
  process.exit(1);
}

const VALID_SUBJECTS = ['arabe', 'philosophie', 'histoire', 'geographie', 'pensee-islamique', 'histoire-geographie'];
if (!VALID_SUBJECTS.includes(SUBJECT)) {
  console.error(`❌ Subject invalide. Valides: ${VALID_SUBJECTS.join(', ')}`);
  process.exit(1);
}

console.log(`🧠 Pipeline MULTI-Matières lycée (2026-08-19) v1 — 100% ARABE`);
console.log(`   Subject: ${SUBJECT}`);
console.log(`   Mode: ${DRY_RUN ? 'DRY-RUN' : 'COMMIT'}${ONLY_MISSING ? ' (only-missing)' : ''}${FORCE ? ' (force)' : ''}${IDS ? ` (IDs: ${IDS.join(',')})` : ''}${LIMIT ? ` (limit: ${LIMIT})` : ''}`);

// =============================================================================
// Subject-specific prompts (tous en ARABE — système éducatif tunisien)
// =============================================================================

const SUBJECT_PROMPTS = {
  // ----------------- ARABE -----------------
  arabe: `Tu es un expert du système éducatif tunisien, spécialisé en LANGUE ARABE au LYCÉE (1AS, 2AS, 3AS, 4AS).

**PROGRAMME TUNISIEN ARABE LYCÉE :**

* **1AS, 2AS, 3AS, 4AS** : La langue arabe est enseignée à TOUTES les sections (Math, Sciences, Lettres, Éco-Gestion, Technique, Sciences Info, Sport).
  - L'arabe au lycée se concentre sur : **Étude de texte** (نصوص أدبية, نقدية, إسلامية, سياسية, علمية, اجتماعية), **Grammaire** (النحو والصرف), **Expression écrite** (الإنشاء, التعبير الكتابي), **Communication orale** (التعبير الشفهي).

* **Programme commun** : La langue arabe est commune à toutes les sections lycée en Tunisie (système unifié).

**RÈGLE LINGUISTIQUE ABSOLUE** : Cette matière est enseignée en ARABE dans le système éducatif tunisien. **TOUS les attributs AI doivent être en ARABE**, même si le fullText du PDF contient des extraits en français ou traductions.

**ATTENDUS :**

* **class** : "1AS" | "2AS" | "3AS" | "4AS" (1ère, 2ème, 3ème, 4ème année secondaire)
* **section** : "Sciences Info" | "Math" | "Lettres" | "Eco-Gestion" | "Technique" | "Sciences Exp" | "Sciences Tech" | "Sport" | "Tronc commun" (si non précisé)
* **type** : "DEVOIR_CONTROLE" | "DEVOIR_SYNTHESE" | "EXERCICE" | "COURS" | "RESUME" | "AUTRE"
* **hasCorrection** : true si le PDF contient un corrigé
* **pilote** : "PILOTE" si lycée pilote, "PUBLIC" sinon
* **profNames** : noms des profs (en arabe si dispo)
* **year** : ex "2023-2024"

**ATTRIBUTS AI (TOUS EN ARABE) :**

* **generalSubject** : SOIS SPÉCIFIQUE. PAS de "Étude de texte" ou "Grammaire". Exemples précis : "النحو - الجملة الاسمية", "العروض - بحر الطويل", "نص أدبي - شعر المتنبي", "الإنشاء - كتابة رسالة", "نص ديني - السيرة النبوية". Max 8 mots.
* **topics** : exactement 9 tags, **UN SEUL MOT CHACUN en arabe** (ex: 'نحو', 'صرف', 'شعر', 'نثر', 'عروض', 'بلاغة', 'قصة', 'رواية', 'مقال', 'نقد', 'فكر'). Varie : 2-3 sur la compétence, 2-3 sur le thème, 1-2 sur le type, 1-2 sur le niveau.
* **shortKeyPoints** : 3-5 points TRÈS COURTS en arabe (2-5 mots max).
* **longKeyPoints** : 3-5 points LONGS en arabe (1 phrase complète, 8-15 mots).
* **exerciseInsights** : UNIQUEMENT si type ∈ [DEVOIR_CONTROLE, DEVOIR_SYNTHESE, EXERCICE, DEVOIR_MAISON]. Format : "التمرين 1: موضوع - ملخص قصير" (1 ligne par exercice, max 10 lignes). Si pas applicable → [].
* **difficulty** : "سهل" (facile) | "متوسط" (moyen) | "صعب" (difficile)
* **duration** : durée estimée en minutes (40-120 typique pour lycée)
* **prerequisites** : en arabe, liste courte des prérequis.`,

  // ----------------- PHILOSOPHIE -----------------
  philosophie: `Tu es un expert du système éducatif tunisien, spécialisé en PHILOSOPHIE au LYCÉE (3AS, 4AS uniquement).

**PROGRAMME TUNISIEN PHILOSOPHIE LYCÉE :**

* **3AS (3ème année)** : Philosophie enseignée à TOUTES les sections (Math, Sciences Exp, Lettres, Éco-Gestion, Sciences Tech, Sciences Info, Sport). Thèmes : Les valeurs, La connaissance, La raison, La liberté, Le langage, La religion, L'art, La politique, Le bonheur, La morale.

* **4AS (4ème année - Bac)** : Philosophie (toutes sections). Thèmes : L'existence, Le sujet, La conscience, L'inconscient, Le désir, Le devoir, L'État, La justice, La vérité, La technique, La science, La société, La culture.

**RÈGLE LINGUISTIQUE ABSOLUE** : Cette matière est enseignée en ARABE dans le système éducatif tunisien. **TOUS les attributs AI doivent être en ARABE**.

**ATTENDUS :**

* **class** : "3AS" | "4AS" uniquement (pas de philo en 1AS/2AS)
* **section** : "Sciences Info" | "Math" | "Lettres" | "Eco-Gestion" | "Sciences Exp" | "Sciences Tech" | "Sport" (toutes)
* **type** : "DEVOIR_CONTROLE" | "DEVOIR_SYNTHESE" | "EXERCICE" | "COURS" | "RESUME" | "AUTRE"
* **hasCorrection** : true si corrigé présent

**ATTRIBUTS AI (TOUS EN ARABE) :**

* **generalSubject** : SOIS PRÉCIS. PAS de "Philosophie générale". Exemples : "الفلسفة اليونانية - سقراط", "نظرية المعرفة - كانط", "الأخلاق والواجب", "الوجودية - سارتر". Max 8 mots.
* **topics** : 9 tags, 1 MOT en arabe (ex: 'أخلاق', 'منطق', 'وجودية', 'مثالية', 'عقل', 'حرية', 'عدالة', 'معرفة', 'وعي', 'لغة', 'فن', 'سياسة').
* **shortKeyPoints** : 3-5 points COURTS en arabe.
* **longKeyPoints** : 3-5 points LONGS en arabe (8-15 mots).
* **exerciseInsights** : "التمرين 1: موضوع - ملخص" en arabe.
* **difficulty** : "سهل" | "متوسط" | "صعب"
* **duration** : en minutes (60-180)
* **prerequisites** : en arabe.`,

  // ----------------- HISTOIRE -----------------
  histoire: `Tu es un expert du système éducatif tunisien, spécialisé en HISTOIRE au LYCÉE (1AS, 2AS, 3AS, 4AS).

**PROGRAMME TUNISIEN HISTOIRE LYCÉE :**

* **1AS** : Histoire (toutes sections sauf Sciences où c'est "Histoire-Géographie" combinée). Thèmes : La Méditerranée au Moyen Âge, L'Islam et le monde musulman, L'Europe médiévale, La Renaissance, Les grandes découvertes.

* **2AS** : Histoire (toutes sections). Thèmes : Le monde à l'époque moderne (XVIe-XVIIIe), L'Empire ottoman, La colonisation, Les indépendances arabes.

* **3AS** : Histoire (toutes sections). Thèmes : Le monde contemporain (XIXe-XXe), Guerres mondiales, Décolonisation, Le monde arabe contemporain, La Tunisie moderne.

* **4AS** : Histoire (toutes sections). Thèmes : Le monde après 1945, La Guerre froide, Le Tiers-Monde, La mondialisation, La Tunisie indépendante, Construction de l'État moderne.

**RÈGLE LINGUISTIQUE ABSOLUE** : Cette matière est enseignée en ARABE dans le système éducatif tunisien. **TOUS les attributs AI doivent être en ARABE**.

**ATTENDUS :**

* **class** : "1AS" | "2AS" | "3AS" | "4AS"
* **section** : "Sciences Info" | "Math" | "Lettres" | "Eco-Gestion" | "Technique" | "Sciences Exp" | "Sciences Tech" | "Sport"
* **type** : "DEVOIR_CONTROLE" | "DEVOIR_SYNTHESE" | "EXERCICE" | "COURS" | "RESUME" | "AUTRE"
* **hasCorrection** : true si corrigé présent

**ATTRIBUTS AI (TOUS EN ARABE) :**

* **generalSubject** : SOIS PRÉCIS. Exemples : "الحرب العالمية الثانية", "الثورة الفرنسية", "الاستعمار الفرنسي لتونس", "الحرب الباردة", "الحضارة الإسلامية - الأندلس". Max 8 mots.
* **topics** : 9 tags, 1 MOT en arabe (ex: 'إسلام', 'استعمار', 'حرب', 'ثورة', 'استقلال', 'حضارة', 'قرون_وسطى', 'عثمانيون', 'قرن_19', 'قرن_20', 'تونس', 'حرب_عالمية').
* **shortKeyPoints** : 3-5 points COURTS en arabe.
* **longKeyPoints** : 3-5 points LONGS en arabe.
* **exerciseInsights** : "التمرين 1: موضوع - ملخص" en arabe.
* **difficulty** : "سهل" | "متوسط" | "صعب"
* **duration** : en minutes
* **prerequisites** : en arabe.`,

  // ----------------- GEOGRAPHIE -----------------
  geographie: `Tu es un expert du système éducatif tunisien, spécialisé en GÉOGRAPHIE au LYCÉE (1AS, 2AS, 3AS, 4AS).

**PROGRAMME TUNISIEN GÉOGRAPHIE LYCÉE :**

* **1AS** : Géographie (toutes sections sauf Sciences où combinée avec Histoire). Thèmes : Lecture de cartes, Climats, Reliefs, Mers et océans, Les grands ensembles régionaux.

* **2AS** : Géographie (toutes sections). Thèmes : La population mondiale, Les grandes puissances économiques, L'Union Européenne, Le Japon, Les USA, La Chine, Les BRICS.

* **3AS** : Géographie (toutes sections). Thèmes : Le Maghreb, Le Moyen-Orient, L'Afrique, Le développement durable, La mondialisation.

* **4AS** : Géographie (toutes sections). Thèmes : La Tunisie, Le Maghreb, L'Union européenne, Les pôles et les grands ensembles économiques.

**RÈGLE LINGUISTIQUE ABSOLUE** : Cette matière est enseignée en ARABE dans le système éducatif tunisien. **TOUS les attributs AI doivent être en ARABE**.

**ATTENDUS :**

* **class** : "1AS" | "2AS" | "3AS" | "4AS"
* **section** : "Sciences Info" | "Math" | "Lettres" | "Eco-Gestion" | "Technique" | "Sciences Exp" | "Sciences Tech" | "Sport"
* **type** : "DEVOIR_CONTROLE" | "DEVOIR_SYNTHESE" | "EXERCICE" | "COURS" | "RESUME" | "AUTRE"
* **hasCorrection** : true si corrigé présent

**ATTRIBUTS AI (TOUS EN ARABE) :**

* **generalSubject** : SOIS PRÉCIS. Exemples : "الجغرافيا السياسية للعالم العربي", "التنمية المستدامة", "الاتحاد الأوروبي", "السكان في العالم", "المناخات العالمية". Max 8 mots.
* **topics** : 9 tags, 1 MOT en arabe (ex: 'سكان', 'مناخ', 'تخطيط', 'مدن', 'فلاحة', 'صناعة', 'تجارة', 'سياحة', 'تنمية', 'تخلف', 'عالم_ثالث', 'تونس', 'مغرب_عربي').
* **shortKeyPoints** : 3-5 points COURTS en arabe.
* **longKeyPoints** : 3-5 points LONGS en arabe.
* **exerciseInsights** : "التمرين 1: موضوع - ملخص" en arabe.
* **difficulty** : "سهل" | "متوسط" | "صعب"
* **duration** : en minutes
* **prerequisites** : en arabe.`,

  // ----------------- PENSÉE ISLAMIQUE -----------------
  'pensee-islamique': `Tu es un expert du système éducatif tunisien, spécialisé en PENSÉE ISLAMIQUE (الفكر الإسلامي) au LYCÉE (1AS, 2AS, 3AS, 4AS).

**PROGRAMME TUNISIEN PENSÉE ISLAMIQUE LYCÉE :**

* **1AS, 2AS, 3AS, 4AS** : La pensée islamique est enseignée à TOUTES les sections du lycée (commun). C'est une matière religieuse basée sur le Coran et la Sunna.

Thèmes principaux :
- La raison et la révélation (العقل والوحي)
- La foi et les valeurs (الإيمان والقيم)
- L'éthique islamique (الأخلاق الإسلامية)
- L'Islam et la société moderne (الإسلام والمجتمع المعاصر)
- Les défis contemporains (التحديات المعاصرة)
- Le dialogue des civilisations (حوار الحضارات)
- La pensée islamique et la science (الفكر الإسلامي والعلم)
- L'humanisme en Islam (الإنسانية في الإسلام)
- La liberté et la responsabilité (الحرية والمسؤولية)
- Le travail dans l'Islam (العمل في الإسلام)

**RÈGLE LINGUISTIQUE ABSOLUE** : Cette matière est enseignée en ARABE dans le système éducatif tunisien. **TOUS les attributs AI doivent être en ARABE**.

**ATTENDUS :**

* **class** : "1AS" | "2AS" | "3AS" | "4AS"
* **section** : "Sciences Info" | "Math" | "Lettres" | "Eco-Gestion" | "Technique" | "Sciences Exp" | "Sciences Tech" | "Sport"
* **type** : "DEVOIR_CONTROLE" | "DEVOIR_SYNTHESE" | "EXERCICE" | "COURS" | "RESUME" | "AUTRE"
* **hasCorrection** : true si corrigé présent

**ATTRIBUTS AI (TOUS EN ARABE) :**

* **generalSubject** : SOIS PRÉCIS. Exemples : "الإيمان والعلم في الإسلام", "الأخلاق الإسلامية - الصدق", "حوار الحضارات", "الإسلام والقيم الإنسانية", "التكافل الاجتماعي في الإسلام". Max 8 mots.
* **topics** : 9 tags, 1 MOT en arabe (ex: 'إيمان', 'عقيدة', 'أخلاق', 'عبادات', 'معاملات', 'فقه', 'سيرة', 'قرآن', 'سنة', 'عقل', 'وحي', 'قيم', 'مجتمع', 'عدالة', 'حرية', 'علم').
* **shortKeyPoints** : 3-5 points COURTS en arabe (2-5 mots).
* **longKeyPoints** : 3-5 points LONGS en arabe.
* **exerciseInsights** : "التمرين 1: موضوع - ملخص" en arabe.
* **difficulty** : "سهل" | "متوسط" | "صعب"
* **duration** : en minutes
* **prerequisites** : en arabe.`,

  // ----------------- HISTOIRE-GÉOGRAPHIE -----------------
  'histoire-geographie': `Tu es un expert du système éducatif tunisien, spécialisé en HISTOIRE-GÉOGRAPHIE combinée au LYCÉE (1AS Sciences).

**PROGRAMME TUNISIEN HISTOIRE-GÉOGRAPHIE LYCÉE :**

* **1AS Sciences uniquement** : Combinaison d'Histoire et Géographie (matière unique "histoire-géographie"). Thèmes : Civilisations anciennes, Méditerranée, Monde musulman, Découvertes, Climats, Populations.

**RÈGLE LINGUISTIQUE ABSOLUE** : Cette matière est enseignée en ARABE. **TOUS les attributs AI doivent être en ARABE**.

**ATTENDUS :**

* **class** : "1AS" uniquement
* **section** : "Sciences" (parfois "Sciences Exp" ou similaire)
* **type** : "DEVOIR_CONTROLE" | "DEVOIR_SYNTHESE" | "EXERCICE" | "COURS" | "RESUME" | "AUTRE"
* **hasCorrection** : true si corrigé présent

**ATTRIBUTS AI (TOUS EN ARABE) :**

* **generalSubject** : SOIS PRÉCIS. Exemples : "الحضارات القديمة - مصر", "الجغرافيا المناخية", "الحضارة الإسلامية". Max 8 mots.
* **topics** : 9 tags, 1 MOT en arabe (ex: 'تاريخ', 'جغرافيا', 'حضارة', 'حرب', 'استعمار', 'مناخ', 'سكان', 'مدن', 'تنمية').
* **shortKeyPoints** : 3-5 points COURTS en arabe.
* **longKeyPoints** : 3-5 points LONGS en arabe.
* **exerciseInsights** : "التمرين 1: موضوع - ملخص" en arabe.
* **difficulty** : "سهل" | "متوسط" | "صعب"
* **duration** : en minutes
* **prerequisites** : en arabe.`,
};

// =============================================================================
// Subject reclassification (in case AI detects the wrong subject)
// =============================================================================
const SUBJECT_RECLASSIFY = {
  arabe: 'arabe',
  philosophie: 'philosophie',
  histoire: 'histoire',
  geographie: 'geographie',
  'pensee-islamique': 'pensee-islamique',
  'histoire-geographie': 'histoire-geographie',
};

const SECTION_SLUGS = {
  'Sciences Info': 'sciences-informatique',
  'Sciences Informatique': 'sciences-informatique',
  'SI': 'sciences-informatique',
  'Math': 'maths',
  'Mathématiques': 'maths',
  'Lettres': 'lettres',
  'Eco-Gestion': 'eco-gestion',
  'Économie-Gestion': 'eco-gestion',
  'Eco et services': 'eco-services',
  'Technique': 'technique',
  'Sciences Exp': 'sciences-experimentales',
  'Sciences Tech': 'sciences-techniques',
  'Sport': 'sport',
  'Tronc commun': null,
};

const CLASS_SLUGS = {
  '1AS': '1ere-secondaire',
  '2AS': '2eme-secondaire',
  '3AS': '3eme-secondaire',
  '4AS': '4eme-secondaire',
  '1ère année': '1ere-secondaire',
  '2ème année': '2eme-secondaire',
  '3ème année': '3eme-secondaire',
  '4ème année': '4eme-secondaire',
};

const TYPE_MAP = {
  DEVOIR_CONTROLE: 'HOMEWORK',
  DEVOIR_SYNTHESE: 'HOMEWORK',
  EXERCICE: 'EXERCISE',
  COURS: 'COURSE',
  RESUME: 'SUMMARY',
  AUTRE: 'OTHER',
};

// =============================================================================
// GPT-4o-mini extraction
// =============================================================================
const SYSTEM_PROMPT = SUBJECT_PROMPTS[SUBJECT];

const USER_PROMPT_TEMPLATE = (fullText) => `Analyse ce texte extrait d'un PDF scolaire tunisien et génère les métadonnées + attributs AI.

**TEXTE EXTRAIT :**
\`\`\`
${fullText.substring(0, 8000)}
\`\`\`

**RÉPONSE ATTENDUE (JSON strict) :**
{
  "class": "1AS|2AS|3AS|4AS",
  "section": "Sciences Info|Math|Lettres|Eco-Gestion|Technique|Sciences Exp|Sciences Tech|Sport|Tronc commun",
  "type": "DEVOIR_CONTROLE|DEVOIR_SYNTHESE|EXERCICE|COURS|RESUME|AUTRE",
  "homeworkSubtype": "CONTROL|SYNTHESIS|HOUSEWORK|null",
  "homeworkNumber": 1|2|3|...,
  "year": "2023-2024" | null,
  "schoolName": "اسم المدرسة" | null,
  "schoolType": "PILOTE|PUBLIC",
  "hasCorrection": true|false,
  "profNames": ["اسم الأستاذ"] | [],

  "generalSubject": "موضوع محدد بالعربية",
  "topics": ["كلمة1", "كلمة2", ..., "كلمة9"],
  "shortKeyPoints": ["نقطة 1", "نقطة 2", ...],
  "longKeyPoints": ["شرح مفصل 1", "شرح مفصل 2", ...],
  "exerciseInsights": ["التمرين 1: وصف", ...] | [],
  "difficulty": "سهل|متوسط|صعب",
  "duration": 60,
  "prerequisites": ["متطلب 1", ...]
}

**RAPPELS** :
- TOUS les textes doivent être en ARABE (la matière est enseignée en arabe en Tunisie)
- topics : 9 mots exactement, 1 mot chacun, en arabe
- shortKeyPoints : 3-5 points COURTS en arabe
- longKeyPoints : 3-5 points LONGS en arabe
- exerciseInsights : seulement si type ∈ [DEVOIR_CONTROLE, DEVOIR_SYNTHESE, EXERCICE, DEVOIR_MAISON]
- duration : en minutes, réaliste pour le niveau

Réponds UNIQUEMENT avec le JSON, sans texte avant/après.`;

async function callGPT(fullText, title) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: USER_PROMPT_TEMPLATE(fullText) },
      ],
      max_tokens: 1500,
      temperature: 0.3,
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${err.substring(0, 200)}`);
  }
  const data = await response.json();
  const content = data.choices[0].message.content.trim();
  // Strip markdown code fences if present
  const jsonStr = content.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  return JSON.parse(jsonStr);
}

// =============================================================================
// Main
// =============================================================================
async function main() {
  const where = {
    subject: { slug: SUBJECT },
    // Filter to LYCÉE only (1AS-4AS) — collège files (7eme/8eme/9eme) are out of scope
    class: { slug: { in: ['1ere-secondaire', '2eme-secondaire', '3eme-secondaire', '4eme-secondaire'] } },
  };
  if (IDS) where.numericId = { in: IDS };
  if (ONLY_MISSING && !FORCE) {
    where.OR = [
      { metadata: null },
      { metadata: { generalSubject: null } },
    ];
  }

  const resources = await prisma.resource.findMany({
    where,
    include: {
      subject: true,
      class: { include: { level: true } },
      metadata: true,
      content: true,
      section: true,
    },
    orderBy: { numericId: 'asc' },
    take: LIMIT || undefined,
    skip: 0,
  });
  console.log(`📦 ${resources.length} fichiers à traiter`);

  // Prefetch sections per class for reclassification
  const sectionsByClass = {};
  for (const r of resources) {
    if (r.classId && !sectionsByClass[r.classId]) {
      const secs = await prisma.section.findMany({ where: { classId: r.classId } });
      sectionsByClass[r.classId] = secs;
    }
  }

  let success = 0, errors = 0, skipped = 0, reclassified = 0;
  const errorDetails = [];
  const reclassificationLog = [];

  for (let i = 0; i < resources.length; i++) {
    const r = resources[i];
    const progress = `[${i + 1}/${resources.length}]`;
    console.log(`\n${progress} #${r.numericId} ${r.title.substring(0, 60)}`);

    if (!r.content?.fullText || r.content.fullText.length < 30) {
      console.log(`   ⏭️  Skipped (no fullText, len=${r.content?.fullText?.length || 0})`);
      skipped++;
      continue;
    }

    try {
      const ai = await callGPT(r.content.fullText, r.title);
      console.log(`   🤖 AI: class=${ai.class} type=${ai.type} GS="${(ai.generalSubject || '').substring(0, 40)}"`);
      console.log(`      Tags: ${ai.topics?.length || 0}/9 | SKP: ${ai.shortKeyPoints?.length || 0} | LKP: ${ai.longKeyPoints?.length || 0} | EI: ${ai.exerciseInsights?.length || 0}`);

      if (DRY_RUN) {
        success++;
        continue;
      }

      // Update headerData on Resource
      await prisma.resource.update({
        where: { id: r.id },
        data: { headerData: ai },
      });

      // Update or create ResourceMetadata
      const metaData = {
        generalSubject: ai.generalSubject || null,
        topics: ai.topics || [],
        shortKeyPoints: ai.shortKeyPoints || [],
        keyPoints: ai.longKeyPoints || [],
        exerciseInsights: ai.exerciseInsights || [],
        difficulty: ai.difficulty || null,
        duration: ai.duration != null ? String(ai.duration) : null,
        prerequisites: ai.prerequisites || [],
        schoolName: ai.schoolName || null,
        profNames: ai.profNames || [],
        year: ai.year || null,
        type: ai.type || null,
        subject: SUBJECT,
        modelUsed: 'gpt-4o-mini-v1-ar-multi',
      };

      if (r.metadata) {
        await prisma.resourceMetadata.update({
          where: { resourceId: r.id },
          data: { ...metaData, extractedAt: new Date() },
        });
      } else {
        await prisma.resourceMetadata.create({
          data: { resourceId: r.id, ...metaData },
        });
      }

      // Reclassify class/section
      if (ai.class) {
        const newClassSlug = CLASS_SLUGS[ai.class];
        if (newClassSlug && r.class?.slug !== newClassSlug) {
          const newClass = await prisma.class.findUnique({ where: { slug: newClassSlug } });
          if (newClass && !DRY_RUN) {
            await prisma.resource.update({
              where: { id: r.id },
              data: { classId: newClass.id },
            });
            reclassificationLog.push({ id: r.numericId, from: r.class.slug, to: newClassSlug, type: 'class' });
            reclassified++;
          }
        }
      }

      if (ai.section) {
        const newSectionSlug = SECTION_SLUGS[ai.section];
        const lookupClassId = r.classId;
        if (newSectionSlug && lookupClassId) {
          const secs = sectionsByClass[lookupClassId] || (await prisma.section.findMany({ where: { classId: lookupClassId } }));
          sectionsByClass[lookupClassId] = secs;
          const newSec = secs.find(s => s.slug === newSectionSlug);
          if (newSec && newSec.id !== r.sectionId) {
            await prisma.resource.update({
              where: { id: r.id },
              data: { sectionId: newSec.id },
            });
            reclassificationLog.push({ id: r.numericId, from: r.section?.slug || 'none', to: newSectionSlug, type: 'section' });
            reclassified++;
          }
        }
      }

      // Reclassify type
      if (ai.type) {
        const dbType = TYPE_MAP[ai.type];
        if (dbType && r.type !== dbType) {
          await prisma.resource.update({
            where: { id: r.id },
            data: { type: dbType },
          });
          reclassificationLog.push({ id: r.numericId, from: r.type, to: dbType, type: 'type' });
          reclassified++;
        }
      }

      success++;
      console.log(`   ✅ Done`);
    } catch (e) {
      errors++;
      errorDetails.push({ id: r.numericId, error: e.message });
      console.log(`   ❌ ${e.message.substring(0, 200)}`);
    }

    // Rate limit (gpt-4o-mini: 500 RPM)
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n📊 RÉSUMÉ:`);
  console.log(`   ✅ Success: ${success}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   🔀 Reclassified: ${reclassified}`);

  if (reclassificationLog.length > 0) {
    console.log(`\n📋 RECLASSIFICATIONS:`);
    for (const r of reclassificationLog.slice(0, 50)) {
      console.log(`   #${r.id} ${r.type || '?'}: ${r.from} → ${r.to}`);
    }
  }
  if (errorDetails.length > 0) {
    console.log(`\n📋 ERREURS:`);
    for (const e of errorDetails) {
      console.log(`   #${e.id}: ${e.error.substring(0, 100)}`);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => {
    console.error('💥 Fatal:', e);
    prisma.$disconnect();
    process.exit(1);
  });
