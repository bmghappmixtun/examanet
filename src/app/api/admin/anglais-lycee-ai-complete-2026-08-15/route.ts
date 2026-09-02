import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const SEED_TOKEN = process.env.SEED_TOKEN || '';

// ============================================================================
// Complete missing AI attributes for all ANGLAIS LYCÉE files
// ============================================================================
// Audit 2026-08-15:
//   - 270 published files (1AS, 2AS, 3AS, 4AS)
//   - 249 missing GeneralSubject (92%)
//   - 269 missing ExerciseInsights (99.6%)
//   - 74 missing ShortKeyPoints (27%)
//   - 15 NEW files (8125-8141) missing EVERYTHING
//
// Modes:
//   - 'gs'   : extract GeneralSubject from title + KP + AI summary (CHEAP)
//   - 'skp'  : extract ShortKeyPoints from KP + title (CHEAP)
//   - 'ei'   : generate ExerciseInsights from KP + AI summary (MEDIUM)
//   - 'new'  : full pipeline for new files (8125-8141) (EXPENSIVE)
//   - 'all'  : all of the above in priority order
// ============================================================================

interface ProcessResult {
  numericId: number;
  status: 'success' | 'skipped' | 'error';
  mode: string;
  message?: string;
  data?: any;
}

const PROMPT_GS = `Tu es un expert du système éducatif tunisien.

À partir d'un titre + key points + AI summary d'un document d'ANGLAIS lycée tunisien (1AS, 2AS, 3AS ou 4AS), tu dois générer UNIQUEMENT un "generalSubject" (3-8 mots) qui décrit le sujet principal du document.

🚨🚨🚨 RÈGLES STRICTES — À RESPECTER IMPÉRATIVEMENT 🚨🚨🚨

1. **INTERDIT — Ne JAMAIS générer un GS générique seul** :
   ❌ "Reading comprehension" SEUL
   ❌ "Listening comprehension" SEUL
   ❌ "Compréhension de texte" SEUL
   ❌ "Devoir de contrôle en anglais"
   ❌ "Cours d'anglais"
   ❌ "Anglais"
   ❌ "Written expression" / "Essay writing" / "Grammar" / "Vocabulary" SEULS

2. **OBLIGATOIRE — Toujours inclure le SUJET SPÉCIFIQUE** :
   Le GS doit TOUJOURS être au format « Type de compétence - sujet spécifique » (ou l'inverse).

3. **Source du sujet** : Extraire le sujet depuis l'AI summary (ou les key points). Le sujet est le THÈME principal du texte de compréhension, l'ÉVÉNEMENT, le PERSONNAGE, ou le CONCEPT travaillé.

4. **Langue** : En FRANÇAIS ou en ANGLAIS selon ce qui est le plus naturel. Le sujet peut être dans une langue et le type dans l'autre (ex: "Reading comprehension - don d'organes").

5. **Longueur** : 3-8 mots typiquement (peut aller jusqu'à 12 si le sujet l'exige).

6. **INTERDIT — Ignorer** : nom de la section (Lettres, Sciences, Eco, etc.), nom du prof, nom du lycée, type d'évaluation (Devoir, Contrôle, Synthèse).

EXEMPLES DE BONS GS (à imiter):
✅ "Reading comprehension - don d'organes et solidarité"
✅ "Reading comprehension - addiction aux jeux vidéo"
✅ "Reading comprehension - fuite des cerveaux en Grèce"
✅ "Reading comprehension - immersion culturelle au pair"
✅ "Reading comprehension - histoire d'Emily, insuffisance rénale"
✅ "Listening comprehension - multilinguisme et comportement en classe"
✅ "Listening comprehension - discours de Rosa Parks"
✅ "Listening comprehension - internet addiction"
✅ "Compréhension de texte - Antonios Chalkiopoulos et l'émigration grecque"
✅ "Compréhension écrite - voyage en famille en van"
✅ "Written expression - rédaction sur l'anxiété des étudiants"
✅ "Writing - essay sur l'environnement et le tourisme spatial"
✅ "Grammar - past simple vs present perfect"
✅ "Grammar - conditionals et wishes"
✅ "Grammar - passive voice (textile industry)"
✅ "Vocabulary - health and medicine"
✅ "Vocabulary - environment and pollution"
✅ "Essay writing - impact of technology on education"

FORMAT DE RÉPONSE (JSON strict):
{
  "generalSubject": "Type de compétence - sujet spécifique"
}`;

const PROMPT_TAGS = `Tu es un expert du système éducatif tunisien (ANGLAIS lycée tunisien 1AS/2AS/3AS/4AS).

À partir d'un titre + key points + AI summary d'un document d'ANGLAIS lycée tunisien, tu dois générer EXACTEMENT 9 tags (mots-clés) qui catégorisent le document.

🚨🚨🚨 RÈGLES STRICTES 🚨🚨🚨

1. **EXACTEMENT 9 tags** (pas plus, pas moins)
2. **UN MOT par tag** (1-2 mots max, JAMAIS de phrases)
3. **En minuscule** (sauf noms propres : "Rosa Parks", "Anousheh Ansari")
4. **En français** (par défaut) ou en anglais si le terme est technique (ex: "phishing", "listening", "speaking")
5. **Variés et spécifiques** — Mélanger :
   - **Type de compétence** (1-2 tags) : reading, listening, writing, grammar, vocabulary, speaking, comprehension, expression, phonetics
   - **Thème du contenu** (3-4 tags) : le sujet spécifique (ex: "émigration", "addiction", "environnement", "santé mentale", "fuite des cerveaux", "tourisme spatial", "internet", "dons d'organes", "handicap", "santé", "éducation", "environnement", "technologie", "multilinguisme", "écologie", "pollution", "voyage", "famille", "émotions", "adolescence", "pandémie", "réseaux sociaux")
   - **Type d'exercice** (1-2 tags) : qcm, true/false, essay, summary, matching, fill-in-blanks, multiple choice, comprehension, analysis, listening, reading
   - **Niveau/langue** (1-2 tags) : anglais, 1AS, 2AS, lycée, bac, expression écrite, expression orale, baccalauréat

6. **Pas de doublons** entre les tags
7. **Pas de tags trop génériques** (interdit: "cours", "exercice", "devoir", "contrôle", "synthèse", "évaluation", "élève", "education", "langue")
8. **Pas de tags redondants avec les tags existants** (mais peut les compléter)

EXEMPLES DE BONS TAGS:
- ["reading", "émigration", "fuite des cerveaux", "économie", "grammaire", "vocabulaire", "compréhension écrite", "4AS", "anglais"]
- ["listening", "addiction", "jeux vidéo", "santé mentale", "compréhension orale", "vocabulaire", "grammaire", "3AS", "anglais"]
- ["reading", "don d'organes", "santé", "solidarité", "compréhension écrite", "expression écrite", "grammaire", "lycée", "anglais"]
- ["writing", "environnement", "tourisme spatial", "pollution", "expression écrite", "essay", "vocabulaire", "3AS", "anglais"]
- ["listening", "multilinguisme", "comportement en classe", "compréhension orale", "phonétique", "grammaire", "vocabulaire", "1AS", "anglais"]
- ["grammar", "passive voice", "conditionals", "tenses", "vocabulaire", "exercices", "1AS", "lycée", "anglais"]

FORMAT DE RÉPONSE (JSON strict):
{
  "topics": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9"]
}`;

const PROMPT_SKP = `Tu es un expert du système éducatif tunisien.

À partir d'un titre + key points d'un document d'ANGLAIS lycée tunisien, tu dois générer UNIQUEMENT 3 shortKeyPoints (termes très courts, 2-3 mots max chacun).

RÈGLES:
- 3 entrées exactement
- TERMES techniques courts (2-3 mots max), PAS des phrases
- En FRANÇAIS ou en ANGLAIS selon le contexte
- Pas de virgules, pas de phrases complètes
- Pas de doublons avec les key points existants
- En minuscule (sauf noms propres)

Exemples valides:
- "Reading comprehension"
- "Written expression"
- "Grammar tenses"
- "Active passive"
- "British civilization"
- "Essay writing"
- "Modal verbs"
- "Phonetics"

FORMAT DE RÉPONSE (JSON strict):
{
  "shortKeyPoints": ["Terme 1", "Terme 2", "Terme 3"]
}`;

const PROMPT_EI = `Tu es un expert du système éducatif tunisien.

À partir d'un titre + key points + AI summary d'un document d'ANGLAIS lycée tunisien, tu dois générer UNIQUEMENT 3-5 exerciseInsights (aperçu structuré).

RÈGLES:
- 3-5 entrées exactement
- Pour DEVOIR/EXERCISE: aperçu exercice par exercice
  Format: "Exercice N: sujet - résumé" où:
  - N est le numéro (1, 2, 3...)
  - sujet est court (3-8 mots)
  - résumé est 1 phrase concise (5-12 mots)
  - EXEMPLE: "Exercice 1: Reading comprehension - Texte sur l'environnement et questions de compréhension"
  - EXEMPLE: "Exercice 2: Grammar - Past simple vs present perfect"
- Pour COURSE: aperçu section par section
  Format: "Section: titre - résumé"
  - EXEMPLE: "Section Grammar: Tenses overview - Present, past, future"
- En FRANÇAIS ou en ANGLAIS selon le contexte
- PAS de guillemets, PAS de préambule

FORMAT DE RÉPONSE (JSON strict):
{
  "exerciseInsights": ["Exercice 1: sujet - résumé", "Exercice 2: sujet - résumé"]
}`;

const PROMPT_NEW = `Tu es un expert en ANGLAIS du système éducatif tunisien (lycée : 1AS, 2AS, 3AS, 4AS/BAC).

À partir du titre et de la classe d'un document tunisien d'ANGLAIS, tu dois générer TOUS les attributs IA suivants en FRANÇAIS/ANGLAIS (selon ce qui est le plus naturel) :

1. **keyPoints** (3-5 entrées) : phrases complètes de 4-8 mots résumant les concepts. FACTUELLES et SPÉCIFIQUES.
2. **shortKeyPoints** (3 entrées) : TERMES techniques courts, 2-3 mots max. Pas des phrases.
3. **topics** (9 entrées) : 1 mot chacun, en minuscule, qui catégorisent le sujet
4. **generalSubject** (1 chaîne, 2-6 mots) : le sujet principal du document
5. **exerciseInsights** (3-5 entrées) : aperçu structuré
   - Pour DEVOIR/EXERCISE: "Exercice N: sujet - résumé"
   - Pour COURSE: "Section: titre - résumé"
6. **aiSummary** (1 chaîne, 2-3 phrases de 15-30 mots) : résumé factuel du contenu

RÈGLES IMPORTANTES:
- Le sujet doit être SPÉCIFIQUE et FACTUEL (pas vague comme "Anglais" ou "Cours d'anglais")
- IGNORER le nom de la section (Lettres, Sciences, etc.) - c'est la classe, PAS le sujet
- IGNORER le nom du prof et le lycée
- Tout en français/anglais selon le contexte naturel

FORMAT DE RÉPONSE (JSON strict):
{
  "keyPoints": ["phrase 1", "phrase 2", "phrase 3"],
  "shortKeyPoints": ["terme 1", "terme 2", "terme 3"],
  "topics": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9"],
  "generalSubject": "Sujet principal concis",
  "exerciseInsights": ["Exercice 1: sujet - résumé"],
  "aiSummary": "Résumé factuel du document en 2-3 phrases."
}`;

async function callOpenAI(prompt: string, systemPrompt: string, maxTokens = 400): Promise<any> {
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

async function getTargetFiles(mode: string, onlyIds?: number[]) {
  const anglais = await prisma.subject.findUnique({ where: { slug: 'anglais' } });
  if (!anglais) return [];
  const classes = await prisma.class.findMany({
    where: { slug: { in: ['1ere-secondaire', '2eme-secondaire', '3eme-secondaire', '4eme-secondaire'] } },
  });

  const whereClause: any = {
    subjectId: anglais.id,
    classId: { in: classes.map((c) => c.id) },
  };
  // Only require publishedAt when NOT filtering by specific IDs
  if (!onlyIds || onlyIds.length === 0) {
    whereClause.publishedAt = { not: null };
  }
  if (onlyIds && onlyIds.length > 0) {
    whereClause.numericId = { in: onlyIds };
  }

  const all = await prisma.resource.findMany({
    where: whereClause,
    include: {
      class: { select: { nameFr: true } },
      section: { select: { nameFr: true } },
      metadata: true,
      aiSummary: { select: { summary: true } },
    },
    orderBy: { numericId: 'asc' },
  });

  if (onlyIds && onlyIds.length > 0) {
    // When filtering by IDs, return all (don't apply mode filter)
    return all;
  }

  if (mode === 'new') {
    // Files with no metadata at all
    return all.filter((r) => !r.metadata);
  }
  if (mode === 'gs') {
    // For 'gs' mode, process ALL files (we want to upgrade existing GS too)
    return all;
  }
  if (mode === 'tags') {
    // Process files with < 9 tags
    return all.filter((r) => (r.metadata?.topics?.length || 0) < 9);
  }
  if (mode === 'skp') {
    return all.filter((r) => !r.metadata?.shortKeyPoints?.length);
  }
  if (mode === 'ei') {
    return all.filter((r) => !r.metadata?.exerciseInsights?.length);
  }
  return all;
}

async function processFile(
  file: any,
  mode: 'gs' | 'skp' | 'ei' | 'tags' | 'new',
  dryRun: boolean
): Promise<ProcessResult> {
  try {
    let data: any = {};
    let prompt: string;
    let systemPrompt: string;
    let maxTokens: number;

    if (mode === 'gs') {
      systemPrompt = PROMPT_GS;
      prompt = `Document ANGLAIS lycée tunisien:
Type: ${file.type}
Classe: ${file.class.nameFr}
Section: ${file.section?.nameFr || 'N/A'}
Titre: ${file.title}
KeyPoints: ${(file.metadata?.keyPoints || []).join(' | ')}
AI Summary: ${file.aiSummary?.summary?.slice(0, 500) || 'N/A'}
GeneralSubject actuel: ${file.metadata?.generalSubject || 'N/A'}

Génère UNIQUEMENT le generalSubject AMÉLIORÉ (avec sujet spécifique).`;
      maxTokens = 100;
      data = await callOpenAI(prompt, systemPrompt, maxTokens);
    } else if (mode === 'tags') {
      systemPrompt = PROMPT_TAGS;
      prompt = `Document ANGLAIS lycée tunisien:
Type: ${file.type}
Classe: ${file.class.nameFr}
Section: ${file.section?.nameFr || 'N/A'}
Titre: ${file.title}
GeneralSubject: ${file.metadata?.generalSubject || 'N/A'}
KeyPoints: ${(file.metadata?.keyPoints || []).join(' | ')}
AI Summary: ${file.aiSummary?.summary?.slice(0, 500) || 'N/A'}
Tags actuels: ${(file.metadata?.topics || []).join(', ') || 'N/A'}

Génère EXACTEMENT 9 tags varié et spécifiques (1-2 mots max chacun).`;
      maxTokens = 200;
      data = await callOpenAI(prompt, systemPrompt, maxTokens);
    } else if (mode === 'skp') {
      systemPrompt = PROMPT_SKP;
      prompt = `Document ANGLAIS lycée tunisien:
Type: ${file.type}
Titre: ${file.title}
KeyPoints: ${(file.metadata?.keyPoints || []).join(' | ')}
GeneralSubject: ${file.metadata?.generalSubject || 'N/A'}

Génère 3 shortKeyPoints.`;
      maxTokens = 100;
      data = await callOpenAI(prompt, systemPrompt, maxTokens);
    } else if (mode === 'ei') {
      systemPrompt = PROMPT_EI;
      prompt = `Document ANGLAIS lycée tunisien:
Type: ${file.type}
Titre: ${file.title}
GeneralSubject: ${file.metadata?.generalSubject || 'N/A'}
KeyPoints: ${(file.metadata?.keyPoints || []).join(' | ')}
AI Summary: ${file.aiSummary?.summary?.slice(0, 500) || 'N/A'}

Génère 3-5 exerciseInsights.`;
      maxTokens = 400;
      data = await callOpenAI(prompt, systemPrompt, maxTokens);
    } else if (mode === 'new') {
      systemPrompt = PROMPT_NEW;
      prompt = `Document ANGLAIS lycée tunisien:
Type: ${file.type}
Classe: ${file.class.nameFr}
Section: ${file.section?.nameFr || 'N/A'}
Titre: ${file.title}
Année: ${file.metadata?.year || 'N/A'}

Génère TOUS les attributs IA en JSON.`;
      maxTokens = 800;
      data = await callOpenAI(prompt, systemPrompt, maxTokens);
    } else {
      throw new Error(`Unknown mode: ${mode}`);
    }

    if (dryRun) {
      return { numericId: file.numericId, status: 'success', mode, data };
    }

    // Save to DB
    if (mode === 'gs') {
      const gs = data.generalSubject;
      if (gs && file.metadata) {
        await prisma.resourceMetadata.update({
          where: { id: file.metadata.id },
          data: { generalSubject: gs },
        });
      } else if (gs && !file.metadata) {
        await prisma.resourceMetadata.create({
          data: { resourceId: file.id, generalSubject: gs },
        });
      }
    } else if (mode === 'tags') {
      const topics = data.topics;
      if (topics && Array.isArray(topics) && topics.length > 0) {
        if (file.metadata) {
          await prisma.resourceMetadata.update({
            where: { id: file.metadata.id },
            data: { topics },
          });
        } else {
          await prisma.resourceMetadata.create({
            data: { resourceId: file.id, topics },
          });
        }
      }
    } else if (mode === 'skp') {
      const skp = data.shortKeyPoints;
      if (skp && Array.isArray(skp) && skp.length > 0) {
        if (file.metadata) {
          await prisma.resourceMetadata.update({
            where: { id: file.metadata.id },
            data: { shortKeyPoints: skp },
          });
        } else {
          await prisma.resourceMetadata.create({
            data: { resourceId: file.id, shortKeyPoints: skp },
          });
        }
      }
    } else if (mode === 'ei') {
      const ei = data.exerciseInsights;
      if (ei && Array.isArray(ei) && ei.length > 0) {
        if (file.metadata) {
          await prisma.resourceMetadata.update({
            where: { id: file.metadata.id },
            data: { exerciseInsights: ei },
          });
        } else {
          await prisma.resourceMetadata.create({
            data: { resourceId: file.id, exerciseInsights: ei },
          });
        }
      }
    } else if (mode === 'new') {
      // Create or update all fields
      const md = {
        generalSubject: data.generalSubject || null,
        keyPoints: Array.isArray(data.keyPoints) ? data.keyPoints : [],
        shortKeyPoints: Array.isArray(data.shortKeyPoints) ? data.shortKeyPoints : [],
        topics: Array.isArray(data.topics) ? data.topics : [],
        exerciseInsights: Array.isArray(data.exerciseInsights) ? data.exerciseInsights : [],
        modelUsed: 'gpt-4o-mini-v1',
      };
      if (file.metadata) {
        await prisma.resourceMetadata.update({
          where: { id: file.metadata.id },
          data: md,
        });
      } else {
        await prisma.resourceMetadata.create({
          data: { resourceId: file.id, ...md },
        });
      }
      // Create AI summary if not exists
      if (data.aiSummary && !file.aiSummary) {
        await prisma.resourceSummary.create({
          data: { resourceId: file.id, summary: data.aiSummary, modelUsed: 'gpt-4o-mini-v1' },
        });
      }
    }

    return { numericId: file.numericId, status: 'success', mode, data };
  } catch (e) {
    return {
      numericId: file.numericId,
      status: 'error',
      mode,
      message: String(e),
    };
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  const token =
    req.headers.get('authorization')?.replace('Bearer ', '') ||
    req.nextUrl.searchParams.get('token');
  if (token !== SEED_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const mode = (body.mode || req.nextUrl.searchParams.get('mode') || 'gs') as 'gs' | 'skp' | 'ei' | 'tags' | 'new' | 'all';
    const batchSize = body.batchSize || 15;
    const startIndex = body.startIndex || 0;
    const dryRun = body.dryRun === true;
    const onlyIds = body.ids
      ? (Array.isArray(body.ids) ? body.ids : String(body.ids).split(',').map(Number)).filter(Boolean)
      : undefined;

    let allFiles = await getTargetFiles(mode, onlyIds);

    // For 'all' mode, run in priority order: new → gs → skp → ei
    if (mode === 'all') {
      const results: any[] = [];
      for (const m of ['new', 'gs', 'tags', 'skp', 'ei'] as const) {
        const files = await getTargetFiles(m, onlyIds);
        const batch = files.slice(startIndex, startIndex + batchSize);
        for (const f of batch) {
          const r = await processFile(f, m, dryRun);
          results.push(r);
        }
      }
      return NextResponse.json({
        ok: true,
        mode: 'all',
        dryRun,
        summary: {
          processed: results.length,
          success: results.filter((r) => r.status === 'success').length,
          errors: results.filter((r) => r.status === 'error').length,
        },
        results: results.slice(0, 50),
      });
    }

    const total = allFiles.length;
    const batch = allFiles.slice(startIndex, startIndex + batchSize);
    const results: ProcessResult[] = [];
    for (const f of batch) {
      const r = await processFile(f, mode, dryRun);
      results.push(r);
    }

    return NextResponse.json({
      ok: true,
      mode,
      dryRun,
      total,
      startIndex,
      batchSize: batch.length,
      remaining: Math.max(0, total - startIndex - batchSize),
      summary: {
        processed: results.length,
        success: results.filter((r) => r.status === 'success').length,
        errors: results.filter((r) => r.status === 'error').length,
      },
      results,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
