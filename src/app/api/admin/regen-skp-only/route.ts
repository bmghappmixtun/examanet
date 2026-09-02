import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const SYSTEM_PROMPT = `Tu es un expert en TECHNOLOGIE du système éducatif tunisien (lycée, Génie Mécanique / Génie Électrique).

À partir d'un titre de devoir ou de cours de Technologie, tu dois générer 3 SHORT key points (shortKeyPoints) en FRANÇAIS:
- TERMES techniques courts, 2-3 mots maximum chacun
- Pas des phrases, juste des TERMES
- 3 exactement

FORMAT DE RÉPONSE (JSON strict):
{"shortKeyPoints":["Terme 1","Terme 2","Terme 3"]}`;

async function extractSKPForFile(file: any): Promise<any> {
  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const userPrompt = `Sujet: ${file.title}
Matière: Technologie
Classe: ${file.className}

Génère UNIQUEMENT les 3 shortKeyPoints (termes 2-3 mots) en français.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 200,
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

    const allFiles: any[] = await prisma.resource.findMany({
      where: {
        class: { level: { slug: 'lycee' } },
        subject: { slug: 'technologie' },
        status: 'PUBLISHED',
      },
      include: { metadata: true, class: true },
      orderBy: { numericId: 'asc' },
    });

    // Process files with KP but no SKP
    const targetFiles = allFiles.filter((f: any) => {
      if (!f.metadata) return false;
      if (!f.metadata.keyPoints || f.metadata.keyPoints.length === 0) return false;
      return !f.metadata.shortKeyPoints || f.metadata.shortKeyPoints.length === 0;
    });

    const total = targetFiles.length;
    const batch = targetFiles.slice(startIndex, startIndex + batchSize);

    const results: any[] = [];
    for (const f of batch) {
      try {
        const extracted = await extractSKPForFile({
          title: f.title,
          className: f.class?.nameFr || '',
        });
        results.push({
          numericId: f.numericId,
          status: 'extracted',
          shortKeyPoints: extracted.shortKeyPoints,
        });

        if (!dryRun && f.metadata) {
          await prisma.resourceMetadata.update({
            where: { id: f.metadata.id },
            data: {
              shortKeyPoints: extracted.shortKeyPoints || [],
            },
          });
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
