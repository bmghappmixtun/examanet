import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const SEED_TOKEN = process.env.SEED_TOKEN || '';

const SYSTEM_PROMPT = `Tu es un expert en ÉCONOMIE et GESTION du système éducatif tunisien (lycée : 1AS, 2AS, 3AS, 4AS).

À partir du titre, du type (DEVOIR/EXERCISE/COURSE) et de la classe d'un document d'économie ou de gestion tunisien, tu dois générer les éléments suivants en FRANÇAIS :

1. **shortKeyPoints** (3 entrées) : TERMES techniques courts, 2-3 mots maximum chacun. Pas des phrases, juste des TERMES.
   - Économie: "Utilité marginale", "Équilibre consommateur", "PIB nominal", "Comptabilité nationale", "Investissement productif", "Croissance économique", "Inflation", "Propension à consommer", "Circuit économique", "Commerce international", "Productivité", "Coût d'opportunité"
   - Gestion: "Cycle d'exploitation", "Bilan comptable", "BFR", "Fonds de roulement", "Trésorerie nette", "Amortissement", "Plan comptable", "Masse salariale", "Investissement", "Financement"

2. **keyPoints** (3 entrées) : phrases complètes de 4-6 mots chacune. Phrases courtes résumant les concepts.

3. **topics** (9 entrées) : 1 mot chacun, en minuscule, qui catégorisent le sujet (ex: "consommation", "épargne", "production", "investissement", "croissance", "inflation", "bilan", "trésorerie", "financement", "entreprise", "marché", "capital", "emprunt", "fiscalité", "exportation").

4. **generalSubject** (1 chaîne, 2-6 mots) : le sujet principal du document, en français. Utilisé dans le titre après ":". Doit être :
   - Concis (2-6 mots)
   - En français
   - Refléter le thème principal d'ÉCONOMIE (microéconomie, macroéconomie, comptabilité nationale, croissance, commerce international) ou de GESTION (cycle d'exploitation, fonction financière, bilan, financement, investissement, approche par les coûts, gestion des stocks, gestion de la trésorerie)
   - **IGNORE le nom de la section** (Math, Sciences, Lettres, Économie-Gestion, etc.) - c'est la classe, PAS le sujet
   - **IGNORE le nom du prof** et le lycée
   - Si le titre mentionne "Économie" ou "Gestion", c'est la MATIÈRE, pas le sujet précis
   - Le generalSubject doit être SPÉCIFIQUE au thème du document
   - Exemples Économie: "Comportement du consommateur", "Équilibre du producteur", "Croissance économique", "Comptabilité nationale", "Commerce international", "Système financier", "Consommation et épargne", "Politique économique", "Développement durable", "Inflation et chômage"
   - Exemples Gestion: "Cycle d'exploitation", "Cycle d'investissement", "Fonction financière", "Bilan comptable", "Gestion des stocks", "Trésorerie de l'entreprise", "Financement et amortissement", "Masse salariale", "Plan comptable", "Décisions d'investissement"

5. **exerciseInsights** (3-5 entrées) : aperçu structuré du document.
   - Pour DEVOIR/EXERCISE: aperçu exercice par exercice.
     Format STRICT : "Exercice N: sujet - résumé" où:
     - N est le numéro (1, 2, 3...)
     - sujet est court (3-8 mots)
     - résumé est 1 phrase concise (5-12 mots)
     - EXEMPLE: "Exercice 1: Utilité totale - Analyse de la satisfaction marginale du consommateur"
   - Pour COURSE: aperçu section par section.
     Format STRICT : "Titre: résumé" où:
     - Titre est court (3-8 mots)
     - résumé est 1 phrase concise (5-12 mots)
     - EXEMPLE: "Croissance économique: Définition et mesure à travers le PIB"
   - PAS de guillemets, PAS de préambule

RÈGLES IMPORTANTES:
- TOUT en FRANÇAIS (jamais d'arabe ou d'anglais)
- Le sujet doit être SPÉCIFIQUE et FACTUEL (pas vague comme "Économie" ou "Gestion")
- Le nombre est STRICT: 3 shortKeyPoints + 3 keyPoints + 9 topics + 1 generalSubject
- exerciseInsights: 3-5 entrées selon le type (DEVOIR/EXERCISE → exercices, COURSE → sections)

FORMAT DE RÉPONSE (JSON strict):
{
  "shortKeyPoints": ["Terme 1", "Terme 2", "Terme 3"],
  "keyPoints": ["Phrase 1", "Phrase 2", "Phrase 3"],
  "topics": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9"],
  "generalSubject": "Sujet principal concis",
  "exerciseInsights": ["Exercice 1: sujet - résumé", "Section 1: titre - résumé"]
}`;

async function processFile(file: any): Promise<any> {
  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const userPrompt = `Document Économie/Gestion lycée tunisien:
Matière: ${file.subjectSlug}
Type: ${file.type}
Classe: ${file.className}
Section: ${file.sectionName || 'N/A'}
Titre: ${file.title}
Année: ${file.year || 'N/A'}

Génère les 3 shortKeyPoints, 3 keyPoints, 9 topics, 1 generalSubject, ET exerciseInsights (aperçu structuré).`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 800,
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error('Empty OpenAI response');
  return JSON.parse(content);
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '') ||
                req.nextUrl.searchParams.get('token');
  if (token !== SEED_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = body.batchSize || 5;
    const startIndex = body.startIndex || 0;
    const dryRun = body.dryRun === true;
    const skipExisting = body.skipExisting !== false; // default true
    const onlyMissingGeneralSubject = body.onlyMissingGeneralSubject === true;
    const subjects: string[] = body.subjects || ['economie', 'gestion'];

    // All economie + gestion lycée files
    const allFiles: any[] = await prisma.resource.findMany({
      where: {
        class: { level: { slug: 'lycee' } },
        subject: { slug: { in: subjects } },
        status: 'PUBLISHED',
      },
      include: { metadata: true, class: true, section: true, subject: true },
      orderBy: { numericId: 'asc' },
    });

    // Process files that are missing any of: KP, SKP, topics, generalSubject, or exerciseInsights
    const targetFiles = allFiles.filter((f: any) => {
      if (onlyMissingGeneralSubject) {
        // onlyMissingGeneralSubject takes priority: process if GS is missing, regardless of KP/SKP state
        return !f.metadata?.generalSubject;
      }
      if (!f.metadata) return true;
      if (skipExisting && f.metadata.keyPoints?.length > 0) return false; // already has KP
      if (!f.metadata.keyPoints || f.metadata.keyPoints.length === 0) return true;
      if (!f.metadata.shortKeyPoints || f.metadata.shortKeyPoints.length === 0) return true;
      if (!f.metadata.topics || f.metadata.topics.length === 0) return true;
      if (!f.metadata.generalSubject) return true;
      if (!f.metadata.exerciseInsights || f.metadata.exerciseInsights.length === 0) return true;
      return false;
    });

    const total = targetFiles.length;
    const batch = targetFiles.slice(startIndex, startIndex + batchSize);

    const results: any[] = [];
    for (const f of batch) {
      try {
        const ai = await processFile({
          type: f.type,
          subjectSlug: f.subject?.slug,
          className: f.class?.nameFr || '',
          sectionName: f.section?.nameFr || '',
          title: f.title,
          year: f.year,
        });

        const isComplete = (
          (ai.shortKeyPoints?.length || 0) >= 3 &&
          (ai.keyPoints?.length || 0) >= 3 &&
          (ai.topics?.length || 0) >= 9 &&
          !!ai.generalSubject &&
          (ai.exerciseInsights?.length || 0) >= 3
        );

        results.push({
          numericId: f.numericId,
          subject: f.subject?.slug,
          type: f.type,
          title: f.title.substring(0, 50),
          status: 'ok',
          complete: isComplete,
          generalSubject: ai.generalSubject,
          kpCount: ai.keyPoints?.length || 0,
          skpCount: ai.shortKeyPoints?.length || 0,
          topicCount: ai.topics?.length || 0,
          insightCount: ai.exerciseInsights?.length || 0,
        });

        if (!dryRun) {
          const data: any = {
            keyPoints: ai.keyPoints || [],
            shortKeyPoints: ai.shortKeyPoints || [],
            topics: ai.topics || [],
            generalSubject: ai.generalSubject || null,
            exerciseInsights: ai.exerciseInsights || [],
            modelUsed: 'gpt-4o-mini-eco-gestion-v1',
          };

          if (f.metadata) {
            await prisma.resourceMetadata.update({
              where: { id: f.metadata.id },
              data,
            });
          } else {
            await prisma.resourceMetadata.create({
              data: { resourceId: f.id, ...data },
            });
          }
          revalidatePath(`/ressources/${f.numericId}/${f.slug}`);
          revalidatePath(`/fr/ressources/${f.numericId}/${f.slug}`);
          revalidatePath(`/ar/ressources/${f.numericId}/${f.slug}`);
        }
      } catch (e: any) {
        results.push({
          numericId: f.numericId,
          status: 'error',
          error: e.message,
        });
      }
    }

    const nextIndex = startIndex + batch.length;
    return NextResponse.json({
      success: true,
      total,
      processed: batch.length,
      startIndex,
      nextIndex,
      done: nextIndex >= total,
      dryRun,
      results,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 });
  }
}
