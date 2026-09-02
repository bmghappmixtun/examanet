// @ts-nocheck
/**
 * AI extraction endpoint — accepts pre-extracted text (from local PyMuPDF+Tesseract)
 * and runs GPT-4o-mini to extract metadata.
 *
 * Auth: requires CRON_SECRET or AGENT_REPORT_TOKEN bearer token.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const maxDuration = 60;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

interface ExtractRequest {
  resourceId: string;
  text: string;
  subjectSlug: string;
  language?: string;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const cronSecret = process.env.CRON_SECRET;
  const agentToken = process.env.AGENT_REPORT_TOKEN;

  if (token !== cronSecret && token !== agentToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body: ExtractRequest = await req.json();
  const { resourceId, text, subjectSlug, language } = body;

  if (!resourceId || !text || text.length < 50) {
    return NextResponse.json({ error: 'resourceId and text (min 50 chars) required' }, { status: 400 });
  }

  try {
    // GPT-4o-mini extraction
    const isAr = subjectSlug === 'arabe' || subjectSlug === 'education-islamique' || language === 'ar';

    const prompt = isAr
      ? `Tu es un expert pédagogique tunisien. Analyse le texte extrait d'un PDF scolaire tunisien (${subjectSlug}).

**LANGUE OBLIGATOIRE : tous les champs texte en ARABE**.

Retourne UNIQUEMENT ce JSON:
{
  "school_name_ar": "...",
  "profNames": [{"name_ar": "..."}],
  "file_type": "DEVOIR_SYNTHESE|DEVOIR_CONTROLE|DEVOIR_MAISON|COURS|EXERCICE|REVISION|EXAMEN|AUTRE",
  "year": "2018-2019",
  "general_subject": "3-6 mots EN ARABE",
  "summary": "3 lignes (\\n) EN ARABE, 30-50 mots"
}

TEXTE: ${text.slice(0, 3500)}`
      : `Tu es un expert pédagogique tunisien. Analyse le texte extrait d'un PDF scolaire tunisien (${subjectSlug}).

Retourne UNIQUEMENT ce JSON:
{
  "school_name": "...",
  "profNames": ["Mr. X"],
  "file_type": "DEVOIR_SYNTHESE|DEVOIR_CONTROLE|DEVOIR_MAISON|COURS|EXERCICE|REVISION|EXAMEN|AUTRE",
  "year": "2018-2019",
  "general_subject": "3-6 mots",
  "summary": "3 lignes (\\n), 30-50 mots"
}

TEXTE: ${text.slice(0, 3500)}`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Tu réponds uniquement en JSON valide.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 700,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `OpenAI error: ${res.status}`, details: errText }, { status: 500 });
    }

    const data = await res.json();
    let content = data.choices?.[0]?.message?.content?.trim() || '{}';
    if (content.startsWith('```')) {
      content = content.split('```')[1];
      if (content.startsWith('json')) content = content[4];
      content = content.trim();
    }
    const attrs = JSON.parse(content);

    // Update ResourceMetadata
    const profNames = (attrs.profNames || []).map((p: any) =>
      typeof p === 'string' ? p : p.name_ar || p.name_fr || p.name || ''
    ).filter(Boolean);

    await prisma.resourceMetadata.upsert({
      where: { resourceId },
      create: {
        resourceId,
        profNames,
        schoolName: attrs.school_name_ar || attrs.school_name || null,
        year: attrs.year || null,
        type: attrs.file_type || null,
        generalSubject: attrs.general_subject || null,
        modelUsed: 'gpt-4o-mini-auto',
      },
      update: {
        profNames,
        schoolName: attrs.school_name_ar || attrs.school_name || null,
        year: attrs.year || null,
        type: attrs.file_type || null,
        generalSubject: attrs.general_subject || null,
        extractedAt: new Date(),
        modelUsed: 'gpt-4o-mini-auto',
      },
    });

    // Update ResourceSummary
    if (attrs.summary) {
      await prisma.resourceSummary.upsert({
        where: { resourceId },
        create: {
          resourceId,
          summary: attrs.summary,
          modelUsed: 'gpt-4o-mini-auto',
        },
        update: {
          summary: attrs.summary,
          extractedAt: new Date(),
          modelUsed: 'gpt-4o-mini-auto',
        },
      });
    }

    return NextResponse.json({
      status: 'ok',
      resourceId,
      general_subject: attrs.general_subject,
      summary: attrs.summary?.slice(0, 100),
      profNames,
    });
  } catch (e: any) {
    console.error('[ai/extract-with-text]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
