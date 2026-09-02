import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const SYSTEM_PROMPT = `Tu es un expert en TECHNOLOGIE du système éducatif tunisien (lycée, Génie Mécanique / Génie Électrique).

À partir d'un titre de devoir ou de cours de Technologie, tu dois générer les éléments pédagogiques suivants en FRANÇAIS:

1. 3 SHORT key points (shortKeyPoints): concepts clés très courts, 2-3 mots maximum chacun. Ce sont des TERMES techniques, pas des phrases.
2. 3 LONG key points (keyPoints): phrases complètes de 4-6 mots chacune. Ce sont des CONCEPTS résumés, pas des descriptions complètes.
3. 9 tags (topics): 1 mot chacun, en minuscule, qui catégorisent le sujet.

RÈGLES IMPORTANTES:
- TOUT en FRANÇAIS uniquement
- Pas d'arabe, pas d'anglais
- Les SHORT KP sont des TERMES techniques (noun phrases)
- Les LONG KP sont des PHRASES courtes et résumées
- Les TAGS sont 1 mot chacun (catégorie technique)
- Le nombre est STRICT: 3 short + 3 long + 9 tags

FORMAT DE RÉPONSE (JSON strict):
{"shortKeyPoints":["Terme 1","Terme 2","Terme 3"],"keyPoints":["Phrase 1","Phrase 2","Phrase 3"],"topics":["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8","tag9"]}`;

async function extractKPForFile(file: any): Promise<any> {
  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const userPrompt = `Sujet: ${file.title}
Matière: Technologie
Classe: ${file.className}

Génère les 3 shortKeyPoints (termes 2-3 mots), 3 keyPoints (phrases 4-6 mots), et 9 topics (1 mot) en français.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 600,
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error('Empty response from OpenAI');
  return JSON.parse(content);
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '') ||
                req.nextUrl.searchParams.get('token');
  if (token !== process.env.SEED_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = body.batchSize || 5;
    const startIndex = body.startIndex || 0;
    const dryRun = body.dryRun === true;
    const teacherEmail = body.teacherEmail; // optional: process only specific teacher files

    const allFiles: any[] = await prisma.resource.findMany({
      where: {
        ...(teacherEmail ? { teacher: { email: teacherEmail } } : {
          class: { level: { slug: 'lycee' } },
          subject: { slug: 'technologie' },
        }),
        status: 'PUBLISHED',
      },
      include: { metadata: true, class: true, teacher: true },
      orderBy: { numericId: 'asc' },
    });

    // Process files with empty KP (this is the new behavior - regen for ALL empty KP, not just AR)
    const targetFiles = allFiles.filter((f: any) => {
      if (!f.metadata) return true; // no metadata at all
      if (!f.metadata.keyPoints || f.metadata.keyPoints.length === 0) return true; // empty keyPoints
      if (!f.metadata.topics || f.metadata.topics.length === 0) return true; // empty topics
      return false;
    });

    const total = targetFiles.length;
    const batch = targetFiles.slice(startIndex, startIndex + batchSize);

    const results: any[] = [];
    for (const f of batch) {
      try {
        const extracted = await extractKPForFile({
          title: f.title,
          className: f.class?.nameFr || '',
        });
        results.push({
          numericId: f.numericId,
          title: f.title.substring(0, 60),
          teacher: f.teacher?.name,
          status: 'extracted',
          shortKeyPoints: extracted.shortKeyPoints,
          keyPoints: extracted.keyPoints,
          topics: extracted.topics,
        });

        if (!dryRun) {
          if (f.metadata) {
            await prisma.resourceMetadata.update({
              where: { id: f.metadata.id },
              data: {
                keyPoints: extracted.keyPoints || [],
                shortKeyPoints: extracted.shortKeyPoints || [],
                topics: extracted.topics || [],
              },
            });
          } else {
            await prisma.resourceMetadata.create({
              data: {
                resourceId: f.id,
                keyPoints: extracted.keyPoints || [],
                shortKeyPoints: extracted.shortKeyPoints || [],
                topics: extracted.topics || [],
              },
            });
          }
          revalidatePath(`/ressources/${f.numericId}/${f.slug}`);
          revalidatePath(`/fr/ressources/${f.numericId}/${f.slug}`);
          revalidatePath(`/ar/ressources/${f.numericId}/${f.slug}`);
        }
      } catch (e: any) {
        results.push({
          numericId: f.numericId,
          title: f.title.substring(0, 60),
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
      teacherEmail: teacherEmail || null,
      results,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 });
  }
}
