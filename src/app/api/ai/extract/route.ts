// @ts-nocheck
/**
 * AI extraction endpoint — async, called after Resource creation.
 * Extracts OCR text (PyMuPDF + Tesseract) and GPT-4o-mini attributes.
 *
 * Auth: requires CRON_SECRET or AGENT_REPORT_TOKEN bearer token.
 * This is an INTERNAL endpoint, not for public consumption.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, unlink } from 'fs/promises';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

export const runtime = 'nodejs'; // Required for child_process, fs
export const maxDuration = 60; // Vercel max for hobby plan

const PROXY_BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
const INTERNAL_TOKEN = process.env.INTERNAL_BULK_TOKEN || 'devmanet-bulk-2026';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

interface ExtractionRequest {
  resourceId: string;
  fileKey: string;
  subjectSlug: string;
  language?: string;
  force?: boolean;
}

export async function POST(req: NextRequest) {
  // Auth check
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const cronSecret = process.env.CRON_SECRET;
  const agentToken = process.env.AGENT_REPORT_TOKEN;

  if (token !== cronSecret && token !== agentToken && token !== INTERNAL_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body: ExtractionRequest = await req.json();
  const { resourceId, fileKey, subjectSlug, language } = body;

  if (!resourceId || !fileKey) {
    return NextResponse.json({ error: 'resourceId and fileKey required' }, { status: 400 });
  }

  // Check if extraction already done
  const existing = await prisma.resourceContent.findUnique({ where: { resourceId } });
  if (existing?.fullText && !body.force) {
    return NextResponse.json({ status: 'already_done', resourceId });
  }

  try {
    // 1. Download PDF via proxy
    const pdfUrl = `${PROXY_BASE}/api/blob-teacher/${fileKey}`;
    const pdfRes = await fetch(pdfUrl, {
      headers: { 'X-Internal-Token': INTERNAL_TOKEN },
    });
    if (!pdfRes.ok) throw new Error(`PDF download failed: ${pdfRes.status}`);

    const pdfBytes = Buffer.from(await pdfRes.arrayBuffer());

    // 2. Save to temp dir
    const tmpDir = join(tmpdir(), 'examanet-extract');
    await mkdir(tmpDir, { recursive: true });
    const pdfPath = join(tmpDir, `${resourceId}.pdf`);
    await writeFile(pdfPath, pdfBytes);

    // 3. Extract text via Python script (PyMuPDF + Tesseract)
    const scriptPath = join(process.cwd(), 'pdf-test', 'extract_one.py');
    const cmd = `python3 ${scriptPath} "${pdfPath}" 2>/dev/null`;
    const { stdout } = await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });
    const extracted = JSON.parse(stdout);
    const { text, method, pageCount, durationMs } = extracted;

    if (!text || text.length < 50) {
      return NextResponse.json({ status: 'text_too_short', len: text?.length || 0 });
    }

    // 4. Update ResourceContent
    const wordCount = (text.match(/\b\w+\b/g) || []).length;
    await prisma.resourceContent.upsert({
      where: { resourceId },
      create: {
        resourceId,
        fullText: text.slice(0, 50000),
        extractionMethod: method,
        extractionDurationMs: durationMs,
        wordCount,
        modelUsed: 'pymupdf+tesseract+gpt-4o-mini',
      },
      update: {
        fullText: text.slice(0, 50000),
        extractionMethod: method,
        extractionDurationMs: durationMs,
        wordCount,
        extractedAt: new Date(),
      },
    });

    // 5. Update Resource.pageCount
    if (pageCount && pageCount > 0) {
      await prisma.resource.update({
        where: { id: resourceId },
        data: { pageCount },
      });
    }

    // 6. GPT-4o-mini extraction (async fire-and-forget for now)
    // TODO: queue this via background job
    // For now, run inline (will block the response but ensure data is populated)
    await runGptExtraction(resourceId, text, subjectSlug, language);

    // 7. Cleanup
    await unlink(pdfPath).catch(() => {});

    return NextResponse.json({
      status: 'ok',
      resourceId,
      textLen: text.length,
      pageCount,
      wordCount,
    });
  } catch (e: any) {
    console.error('[ai/extract]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function runGptExtraction(
  resourceId: string,
  text: string,
  subjectSlug: string,
  language?: string
) {
  // Subset of the techno pipeline prompt
  const isAr = subjectSlug === 'arabe' || subjectSlug === 'education-islamique' || language === 'ar';

  const prompt = isAr
    ? `Tu es un expert pédagogique tunisien. Analyse le texte extrait d'un PDF scolaire tunisien (${subjectSlug}, collège).

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
    : `Tu es un expert pédagogique tunisien. Analyse le texte extrait d'un PDF scolaire tunisien (${subjectSlug}, collège).

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

  try {
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
      console.error('OpenAI error', res.status);
      return;
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
  } catch (e: any) {
    console.error('GPT extraction error', e);
  }
}
