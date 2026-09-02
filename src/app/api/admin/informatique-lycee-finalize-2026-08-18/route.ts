import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { properSlugify } from '@/lib/slugify';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

// ============================================================================
// Finalize Informatique lycée — 2 leftover files (2026-08-18)
// ============================================================================
// After the reclassify of 12 misclassified Informatique files, only 2
// legitimate Informatique files remain without AI metadata:
//   - #7414: Devoir de Contrôle N°1 - Informatique - 2ème Informatique
//   - #7441: Devoir de Contrôle N°1 - Informatique - 3ème Sciences Informatique
//
// These are short (2p each) but legitimate Informatique files. This
// endpoint processes them with the same pipeline as the generic
// lycee-complete endpoint, but for these specific IDs only.
//
// No auth (one-off endpoint for the 2 files). The user asked to
// finalize the Informatique subject.
// ============================================================================

const TARGET_IDS = [7414, 7441];
const MAX_TITLE_LENGTH = 200;

async function callOpenAI(systemPrompt: string, userMessage: string): Promise<any> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 800,
      temperature: 0.2,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI error: ${response.status} ${errorText}`);
  }
  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}

const INFORMATIQUE_SYSTEM = `Tu es un expert du système éducatif tunisien (Informatique lycée).

À partir du titre d'un document d'INFORMATIQUE lycée tunisien, tu dois générer UNIQUEMENT:
- "generalSubject": le sujet général/spécifique du document, en français (max 6 mots)
  Format: "[Type compétence] - [sujet spécifique]"
  Exemples: "Algorithmes de tri", "Bases de données - SQL", "Réseaux - Modèle OSI", "Programmation Python", "Architecture ordinateur"
- "tags": exactement 9 tags courts (1-3 mots chacun), variés et complémentaires
  Distribution: 2-3 sur la compétence/thème, 2-3 sur le sujet/spécificité, 1-2 sur le type, 1-2 sur le niveau
- "shortKeyPoints": 3-5 points clés courts (2-5 mots chacun) pour affichage compact

Réponds UNIQUEMENT en JSON: {"generalSubject": "...", "tags": [...], "shortKeyPoints": [...]}`;

export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  const prisma = new PrismaClient();

  try {
    const url = new URL(req.url);
    const commit = url.searchParams.get('commit') === 'true';

    // Load resources
    const resources = await prisma.resource.findMany({
      where: { numericId: { in: TARGET_IDS } },
      include: {
        subject: true,
        class: true,
        teacher: true,
        metadata: true,
      },
    });

    if (resources.length === 0) {
      return NextResponse.json({ ok: false, error: 'No resources found' }, { status: 404 });
    }

    const results: Array<any> = [];

    for (const r of resources) {
      // Skip if already has metadata
      if (r.metadata) {
        results.push({
          numericId: r.numericId,
          status: 'skipped',
          reason: 'Déjà AI-processed',
        });
        continue;
      }

      const userMessage = `Titre: "${r.title}"
Classe: ${r.class?.nameFr || 'inconnue'}
Matière: ${r.subject.nameFr}`;

      try {
        const aiResult = await callOpenAI(INFORMATIQUE_SYSTEM, userMessage);
        const { generalSubject, tags, shortKeyPoints } = aiResult;

        if (!generalSubject || !Array.isArray(tags) || !Array.isArray(shortKeyPoints)) {
          throw new Error(`Invalid AI response: ${JSON.stringify(aiResult)}`);
        }

        // Build new title with " : {Topic}" suffix
        const currentTitle = r.title.trim();
        let newTitle = currentTitle;
        if (!currentTitle.endsWith(`: ${generalSubject}`)) {
          newTitle = `${currentTitle} : ${generalSubject}`;
        }
        // Truncate if too long
        if (newTitle.length > MAX_TITLE_LENGTH) {
          newTitle = newTitle.slice(0, MAX_TITLE_LENGTH - 1) + '…';
        }

        // Regenerate slug
        const newSlug = properSlugify(newTitle, 80) + '-' + r.numericId;

        results.push({
          numericId: r.numericId,
          status: commit ? 'success' : 'preview',
          currentTitle: r.title,
          newTitle,
          generalSubject,
          tags,
          shortKeyPoints,
          newSlug,
        });

        if (commit) {
          // Update resource title + slug
          await prisma.resource.update({
            where: { id: r.id },
            data: { title: newTitle, slug: newSlug },
          });

          // Create metadata
          await prisma.resourceMetadata.create({
            data: {
              resourceId: r.id,
              generalSubject,
              topics: tags,
              shortKeyPoints,
              modelUsed: 'gpt-4o-mini-v1',
            },
          });

          // Revalidate the resource page
          try {
            revalidatePath(`/fr/ressources/${r.numericId}`);
            revalidatePath(`/ar/ressources/${r.numericId}`);
          } catch (e) {
            // ignore
          }
        }
      } catch (e: any) {
        results.push({
          numericId: r.numericId,
          status: 'error',
          error: e?.message || String(e),
          title: r.title,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      mode: commit ? 'commit' : 'preview',
      summary: {
        total: resources.length,
        processed: results.filter((r) => r.status === 'success' || r.status === 'preview').length,
        errors: results.filter((r) => r.status === 'error').length,
        skipped: results.filter((r) => r.status === 'skipped').length,
      },
      results,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
