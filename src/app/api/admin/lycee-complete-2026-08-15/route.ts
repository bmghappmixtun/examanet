import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { properSlugify } from '@/lib/slugify';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const SEED_TOKEN = process.env.SEED_TOKEN || '';

// ============================================================================
// Generic AI completion + title fix for ALL subjects (not just anglais)
// ============================================================================
// For each file:
//   - Extracts generalSubject (subject-specific prompt)
//   - Generates 9 tags
//   - Appends " : {GS}" to title
//   - Regenerates slug
// ============================================================================

const MAX_TITLE_LENGTH = 200;

const SUBJECT_PROMPTS: Record<string, { name: string; system: string; topicField: string }> = {
  francais: {
    name: 'Français',
    topicField: 'type',
    system: `Tu es un expert du système éducatif tunisien (français lycée).

À partir d'un titre + key points + AI summary d'un document de FRANÇAIS lycée tunisien, tu dois générer:
1. **generalSubject** (3-8 mots) : le sujet spécifique du document, en FRANÇAIS. INTERDIT les valeurs génériques seules ("Lecture", "Compréhension de texte", "Étude de texte"). Le GS doit TOUJOURS contenir le sujet précis : nom de l'œuvre, auteur, thème littéraire, mouvement, figure de style, etc.
   Exemples valides:
   - "Apollinaire - Alcools - Calligrammes"
   - "Voltaire - Candide - satire du XVIIIe siècle"
   - "Hugo - Les Misérables - lutte sociale"
   - "La poésie engagée - engagement et résistance"
   - "Le théâtre absurde - Ionesco"
   - "Compréhension de texte - biographie de Molière"
   - "Argumentation - thèse et arguments"
2. **topics** (EXACTEMENT 9 tags, 1-2 mots max) : catégorisent le document
   - Type (poésie, roman, théâtre, dissertation, commentaire, argumentation)
   - Thème (amour, mort, liberté, guerre, identité, nature, etc.)
   - Auteur/œuvre
   - Mouvement (réalisme, surréalisme, romantisme, classicisme)
   - Niveau (2AS, 3AS, 4AS, bac)

FORMAT JSON: { "generalSubject": "...", "topics": ["tag1", ..., "tag9"] }`,
  },
  histoire: {
    name: 'Histoire',
    topicField: 'type',
    system: `Tu es un expert du système éducatif tunisien (histoire lycée).

À partir d'un titre + key points + AI summary d'un document d'HISTOIRE lycée tunisien, tu dois générer:
1. **generalSubject** (3-8 mots) : le sujet historique spécifique, en FRANÇAIS. INTERDIT les valeurs génériques seules. Doit contenir: période, événement, personnage, concept.
   Exemples:
   - "Révolution française de 1789"
   - "Décolonisation de l'Afrique - XXe siècle"
   - "Première Guerre mondiale - causes et conséquences"
   - "Mouvement national tunisien - Bourguiba"
   - "Guerre froide - bipolarisation du monde"
2. **topics** (9 tags, 1-2 mots) : période, événement, personnage, mouvement, géographie

FORMAT JSON: { "generalSubject": "...", "topics": [...] }`,
  },
  geographie: {
    name: 'Géographie',
    topicField: 'type',
    system: `Tu es un expert du système éducatif tunisien (géographie lycée).

À partir d'un titre + key points + AI summary d'un document de GÉOGRAPHIE lycée tunisien, tu dois générer:
1. **generalSubject** (3-8 mots) : le sujet géographique spécifique, en FRANÇAIS. INTERDIT les valeurs génériques seules. Doit contenir: phénomène, région, concept.
   Exemples:
   - "Migrations internationales - XXe siècle"
   - "Développement durable - enjeux"
   - "Ressources en eau en Tunisie"
   - "Urbanisation - pays du Nord"
   - "Climat méditerranéen"
2. **topics** (9 tags) : région, phénomène, concept, niveau

FORMAT JSON: { "generalSubject": "...", "topics": [...] }`,
  },
  arabe: {
    name: 'Arabe',
    topicField: 'type',
    system: `Tu es un expert du système éducatif tunisien (arabe lycée).

À partir d'un titre + key points + AI summary d'un document d'ARABE lycée tunisien, tu dois générer:
1. **generalSubject** (3-8 mots) : le sujet spécifique, en ARABE (translittéré en FRANÇAIS pour uniformité). Doit contenir: auteur, œuvre, thème, mouvement littéraire.
   Exemples:
   - "أبو القاسم الشابي - إحياء وفاء"
   - "محمود درويش - الشعر الوطني"
   - "أبو العلاء المعري - اللزوميات"
   - "النثر الحديث - طه حسين"
   - "Mohamed Al-Arabi Al-Wartilani - poésie religieuse"
2. **topics** (9 tags) : auteur, œuvre, mouvement, thème, niveau

FORMAT JSON: { "generalSubject": "...", "topics": [...] }`,
  },
  'pensee-islamique': {
    name: 'Pensée Islamique',
    topicField: 'type',
    system: `Tu es un expert du système éducatif tunisien (pensée islamique lycée).

À partir d'un titre + key points + AI summary d'un document de PENSÉE ISLAMIQUE lycée tunisien, tu dois générer:
1. **generalSubject** (3-8 mots) : le sujet spécifique, en FRANÇAIS. INTERDIT les valeurs génériques. Doit contenir: penseur, concept, période.
   Exemples:
   - "Ibn Khaldoun - Al-Muqaddima"
   - "Coran - sourate Al-Baqara"
   - "Hadith - sciences du hadith"
   - "Fiqh islamique - jurisprudence"
   - "Akhlaq - éthique islamique"
2. **topics** (9 tags) : penseur, œuvre, concept, niveau

FORMAT JSON: { "generalSubject": "...", "topics": [...] }`,
  },
  'education-islamique': {
    name: 'Éducation Islamique',
    topicField: 'type',
    system: `Tu es un expert du système éducatif tunisien (éducation islamique).

À partir d'un titre + key points + AI summary d'un document d'ÉDUCATION ISLAMIQUE lycée tunisien, tu dois générer:
1. **generalSubject** (3-8 mots) : le sujet spécifique, en FRANÇAIS.
2. **topics** (9 tags) : concept, niveau

FORMAT JSON: { "generalSubject": "...", "topics": [...] }`,
  },
  'education-civique': {
    name: 'Éducation Civique',
    topicField: 'type',
    system: `Tu es un expert du système éducatif tunisien (éducation civique).

À partir d'un titre + key points + AI summary d'un document d'ÉDUCATION CIVIQUE lycée tunisien, tu dois générer:
1. **generalSubject** (3-8 mots) : le sujet spécifique, en FRANÇAIS.
2. **topics** (9 tags) : concept, niveau

FORMAT JSON: { "generalSubject": "...", "topics": [...] }`,
  },
  '3eme-langue-allemand': {
    name: '3ème Langue Allemand',
    topicField: 'type',
    system: `Tu es un expert du système éducatif tunisien (allemand LV3).

À partir d'un titre + key points + AI summary d'un document d'ALLEMAND LV3 lycée tunisien, tu dois générer:
1. **generalSubject** (3-8 mots) : le sujet spécifique, en ALLEMAND ou FRANÇAIS selon le contexte.
2. **topics** (9 tags) : thème, compétence, niveau

FORMAT JSON: { "generalSubject": "...", "topics": [...] }`,
  },
  '3eme-langue-italien': {
    name: '3ème Langue Italien',
    topicField: 'type',
    system: `Tu es un expert du système éducatif tunisien (italien LV3). Même format que allemand.

FORMAT JSON: { "generalSubject": "...", "topics": [...] }`,
  },
  '3eme-langue-espagnol': {
    name: '3ème Langue Espagnol',
    topicField: 'type',
    system: `Tu es un expert du système éducatif tunisien (espagnol LV3). Même format que allemand.

FORMAT JSON: { "generalSubject": "...", "topics": [...] }`,
  },
  philosophie: {
    name: 'Philosophie',
    topicField: 'type',
    system: `Tu es un expert du système éducatif tunisien (philosophie lycée).

À partir d'un titre + key points + AI summary d'un document de PHILOSOPHIE lycée tunisien, tu dois générer:
1. **generalSubject** (3-8 mots) : le sujet philosophique spécifique, en FRANÇAIS ou ARABE selon le contexte. Doit contenir: concept, auteur, œuvre.
   Exemples:
   - "Platon - La République - justice"
   - "Descartes - cogito et doute méthodique"
   - "Sartre - liberté et engagement"
   - "La conscience - phénoménologie"
   - "الحقيقة في الفلسفة - نسبية المعرفة"
2. **topics** (9 tags) : concept, philosophe, courant, niveau

FORMAT JSON: { "generalSubject": "...", "topics": [...] }`,
  },
  physique: {
    name: 'Physique',
    topicField: 'type',
    system: `Tu es un expert du système éducatif tunisien (physique-chimie lycée).

À partir d'un titre + key points + AI summary d'un document de PHYSIQUE lycée tunisien, tu dois générer:
1. **generalSubject** (3-8 mots) : le sujet spécifique, en FRANÇAIS. INTERDIT les valeurs génériques. Doit contenir: phénomène, concept, branche.
   Exemples:
   - "Mécanique - chute libre"
   - "Électricité - circuit RC"
   - "Optique géométrique - lentilles"
   - "Chimie organique - alcanes"
   - "Réactions acido-basiques - pH"
2. **topics** (9 tags) : branche (mécanique, électricité, optique, chimie, thermodynamique), phénomène, concept, niveau

FORMAT JSON: { "generalSubject": "...", "topics": [...] }`,
  },
  informatique: {
    name: 'Informatique',
    topicField: 'type',
    system: `Tu es un expert du système éducatif tunisien (informatique lycée).

À partir d'un titre + key points + AI summary d'un document d'INFORMATIQUE lycée tunisien, tu dois générer:
1. **generalSubject** (3-8 mots) : le sujet spécifique, en FRANÇAIS. Doit contenir: concept, algorithme, structure.
   Exemples:
   - "Algorithmes de tri - complexité"
   - "Bases de données - SQL"
   - "Programmation Python - structures de contrôle"
   - "Réseaux - modèle OSI"
2. **topics** (9 tags) : concept, algorithme, structure, niveau

FORMAT JSON: { "generalSubject": "...", "topics": [...] }`,
  },
  technologie: {
    name: 'Technologie',
    topicField: 'type',
    system: `Tu es un expert du système éducatif tunisien (technologie lycée).

À partir d'un titre + key points + AI summary d'un document de TECHNOLOGIE lycée tunisien, tu dois générer:
1. **generalSubject** (3-8 mots) : le sujet spécifique, en FRANÇAIS. Doit contenir: système technique, fonction.
2. **topics** (9 tags) : système, fonction, niveau

FORMAT JSON: { "generalSubject": "...", "topics": [...] }`,
  },
  economie: {
    name: 'Économie',
    topicField: 'type',
    system: `Tu es un expert du système éducatif tunisien (économie lycée).

À partir d'un titre + key points + AI summary d'un document d'ÉCONOMIE lycée tunisien, tu dois générer:
1. **generalSubject** (3-8 mots) : le sujet spécifique, en FRANÇAIS. Doit contenir: concept économique, période, théorie.
2. **topics** (9 tags) : concept, période, niveau

FORMAT JSON: { "generalSubject": "...", "topics": [...] }`,
  },
  gestion: {
    name: 'Gestion',
    topicField: 'type',
    system: `Tu es un expert du système éducatif tunisien (gestion lycée).

À partir d'un titre + key points + AI summary d'un document de GESTION lycée tunisien, tu dois générer:
1. **generalSubject** (3-8 mots) : le sujet spécifique, en FRANÇAIS. Doit contenir: concept, méthode.
2. **topics** (9 tags) : concept, méthode, niveau

FORMAT JSON: { "generalSubject": "...", "topics": [...] }`,
  },
  mathematiques: {
    name: 'Mathématiques',
    topicField: 'type',
    system: `Tu es un expert du système éducatif tunisien (mathématiques lycée).

À partir d'un titre + key points + AI summary d'un document de MATHÉMATIQUES lycée tunisien, tu dois générer:
1. **generalSubject** (3-8 mots) : le sujet spécifique, en FRANÇAIS. INTERDIT "Mathématiques" seul. Doit contenir: notion, théorème, méthode.
   Exemples:
   - "Suites numériques - convergence"
   - "Fonctions logarithmes"
   - "Nombres complexes - forme algébrique"
   - "Probabilités conditionnelles"
   - "Géométrie dans l'espace"
2. **topics** (9 tags) : notion, méthode, niveau

FORMAT JSON: { "generalSubject": "...", "topics": [...] }`,
  },
  svt: {
    name: 'SVT',
    topicField: 'type',
    system: `Tu es un expert du système éducatif tunisien (SVT lycée).

À partir d'un titre + key points + AI summary d'un document de SVT lycée tunisien, tu dois générer:
1. **generalSubject** (3-8 mots) : le sujet spécifique, en FRANÇAIS. Doit contenir: thème biologique, processus.
2. **topics** (9 tags) : thème, processus, niveau

FORMAT JSON: { "generalSubject": "...", "topics": [...] }`,
  },
};

const GENERIC_PROMPT = `Tu es un expert du système éducatif tunisien.

À partir d'un titre + key points + AI summary d'un document scolaire tunisien, tu dois générer:
1. **generalSubject** (3-8 mots) : le sujet spécifique du document, en FRANÇAIS (ou dans la langue appropriée). INTERDIT les valeurs trop génériques seules. Le GS doit TOUJOURS contenir le sujet précis (auteur, époque, concept, phénomène, etc.).
2. **topics** (EXACTEMENT 9 tags, 1-2 mots max) : type de document + thème + niveau + autres aspects

FORMAT JSON: { "generalSubject": "...", "topics": ["tag1", ..., "tag9"] }`;

async function callOpenAI(prompt: string, systemPrompt: string, maxTokens = 300): Promise<any> {
  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: maxTokens,
  });
  const content = response.choices[0].message.content;
  if (!content) throw new Error('Empty OpenAI response');
  return JSON.parse(content);
}

export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  const prisma = new PrismaClient();
  const token = req.headers.get('authorization')?.replace('Bearer ', '') ||
                req.nextUrl.searchParams.get('token');
  if (token !== SEED_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const onlyIds = body.ids
      ? (Array.isArray(body.ids) ? body.ids : String(body.ids).split(',').map(Number)).filter(Boolean)
      : undefined;
    const onlySubjects = body.subjects
      ? (Array.isArray(body.subjects) ? body.subjects : String(body.subjects).split(','))
      : undefined;
    const onlyUnpublished = body.unpublished === true;
    const updateTitle = body.updateTitle !== false; // default true
    const onlyMissingTopic = body.missingTopic === true;

    const whereClause: any = {};
    if (onlyIds && onlyIds.length > 0) {
      whereClause.numericId = { in: onlyIds };
    } else {
      // Only lycée + collège 2AS-4AS
      const classes = await prisma.class.findMany({
        where: { slug: { in: ['1ere-secondaire', '2eme-secondaire', '3eme-secondaire', '4eme-secondaire', '7eme', '8eme', '9eme'] } },
      });
      whereClause.classId = { in: classes.map((c) => c.id) };
      if (onlyUnpublished) {
        whereClause.publishedAt = null;
      } else {
        whereClause.publishedAt = { not: null };
      }
      if (onlySubjects && onlySubjects.length > 0) {
        const subjects = await prisma.subject.findMany({ where: { slug: { in: onlySubjects } } });
        whereClause.subjectId = { in: subjects.map((s) => s.id) };
      }
    }

    const all = await prisma.resource.findMany({
      where: whereClause,
      include: {
        class: { select: { nameFr: true } },
        subject: { select: { nameFr: true, slug: true } },
        section: { select: { nameFr: true } },
        metadata: { select: { id: true, topics: true, generalSubject: true, keyPoints: true } },
        aiSummary: { select: { summary: true } },
      },
      orderBy: { numericId: 'asc' },
    });

    // If onlyMissingTopic, filter
    const files = onlyMissingTopic
      ? all.filter((r) => !r.title.includes(':'))
      : all;

    let updated = 0, aiOk = 0, titleOk = 0, errors = 0;
    const results: any[] = [];

    for (const f of files) {
      try {
        const subjectSlug = f.subject.slug;
        const prompt = SUBJECT_PROMPTS[subjectSlug]?.system || GENERIC_PROMPT;
        const userPrompt = `Document ${f.subject.nameFr} ${f.class?.nameFr || 'N/A'}:
Type: ${f.type}
Section: ${f.section?.nameFr || 'N/A'}
Titre: ${f.title}
KeyPoints: ${(f.metadata?.keyPoints || []).join(' | ')}
AI Summary: ${f.aiSummary?.summary?.slice(0, 500) || 'N/A'}
GeneralSubject actuel: ${f.metadata?.generalSubject || 'N/A'}
Tags actuels: ${(f.metadata?.topics || []).join(', ') || 'N/A'}

Génère generalSubject (avec sujet spécifique) + 9 tags variés.`;

        const data = await callOpenAI(userPrompt, prompt, 300);
        aiOk++;

        const newGS = data.generalSubject;
        const newTopics = data.topics;

        // Save metadata
        const updateData: any = {};
        if (newGS && (!f.metadata?.generalSubject || f.metadata.generalSubject.length < 5)) {
          updateData.generalSubject = newGS;
        }
        if (newTopics && Array.isArray(newTopics) && newTopics.length >= 9) {
          updateData.topics = newTopics.slice(0, 12);
        }

        if (Object.keys(updateData).length > 0) {
          if (f.metadata && !dryRun) {
            await prisma.resourceMetadata.update({
              where: { id: f.metadata.id },
              data: updateData,
            });
          } else if (!f.metadata && !dryRun) {
            await prisma.resourceMetadata.create({
              data: { resourceId: f.id, ...updateData },
            });
          }
        }

        // Update title if needed
        let newTitle = f.title;
        if (updateTitle && newGS && !f.title.includes(':')) {
          newTitle = f.title.trim() + ' : ' + newGS;
          if (newTitle.length > MAX_TITLE_LENGTH) {
            const basePart = newTitle.split(':').slice(0, -1).join(':').trim();
            const maxTopicLen = MAX_TITLE_LENGTH - basePart.length - 3;
            if (maxTopicLen > 20) {
              const truncatedTopic = newGS.length > maxTopicLen
                ? newGS.substring(0, maxTopicLen - 1).trim() + '…'
                : newGS;
              newTitle = basePart + ' : ' + truncatedTopic;
            } else {
              newTitle = newTitle.substring(0, MAX_TITLE_LENGTH - 1).trim() + '…';
            }
          }
          const newSlug = properSlugify(newTitle, 80);
          if (!dryRun) {
            await prisma.resource.update({
              where: { id: f.id },
              data: { title: newTitle, slug: newSlug },
            });
            titleOk++;
            try {
              revalidatePath(`/fr/ressources/${f.numericId}/${f.slug}-${f.numericId}`);
              revalidatePath(`/ar/ressources/${f.numericId}/${f.slug}-${f.numericId}`);
            } catch {}
          }
        }
        updated++;
        results.push({
          numericId: f.numericId,
          status: 'updated',
          subject: f.subject.slug,
          oldTitle: f.title,
          newTitle,
          newGS,
        });
      } catch (e) {
        errors++;
        results.push({
          numericId: f.numericId,
          status: 'error',
          error: String(e).slice(0, 100),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      summary: {
        total: files.length,
        updated,
        aiOk,
        titleOk,
        errors,
      },
      results: results.slice(0, 50),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
