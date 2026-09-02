// @ts-nocheck
/**
 * POST /api/admin/update-3l-metadata
 * Bulk update AI metadata for 3ème Langue files (Allemand, Italien, Espagnol).
 *
 * Auth: ADMIN role OR SEED_TOKEN (header x-seed-token, query ?token=, or cookie)
 *
 * Accepts two modes:
 *   1) Single update: { resourceId, generalSubject, keyPoints, shortKeyPoints, summary, summaryOriginal, modelUsed }
 *   2) Bulk update:   { items: [{ resourceId, generalSubject, keyPoints, ... }, ...] }
 *
 * Writes to:
 *   - ResourceMetadata (generalSubject, keyPoints, shortKeyPoints, topics, modelUsed)
 *   - ResourceSummary (summary in target language)
 *   - Resource.description (short French summary, optional)
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface SingleUpdate {
  resourceId: string;
  generalSubject?: string;
  keyPoints?: string[];
  shortKeyPoints?: string[];
  topics?: string[];
  summary?: string; // Short description (1-2 lines, French)
  summaryOriginal?: string; // Short description in original language (de/it/es)
  modelUsed?: string;
}

interface BulkPayload {
  items: SingleUpdate[];
}

async function checkAuth(req: NextRequest) {
  const seedToken =
    req.nextUrl.searchParams.get('seedToken') ||
    req.nextUrl.searchParams.get('token') ||
    req.headers.get('x-seed-token') ||
    req.cookies.get('seed-token')?.value;
  if (seedToken && seedToken === process.env.SEED_TOKEN) return { isAuth: true, isSeed: true };
  return { isAuth: false, isSeed: false };
}

function sanitizeArray(arr: any, max = 50): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x) => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim().slice(0, 200))
    .slice(0, max);
}

async function applyOne(item: SingleUpdate) {
  const { resourceId, generalSubject, keyPoints, shortKeyPoints, topics, summary, summaryOriginal, modelUsed } = item;

  if (!resourceId) {
    return { resourceId, ok: false, error: 'resourceId requis' };
  }

  // Check resource exists
  const resource = await prisma.resource.findUnique({
    where: { id: resourceId },
    select: { id: true, language: true, title: true },
  });
  if (!resource) {
    return { resourceId, ok: false, error: 'Resource non trouvée' };
  }

  // CRITICAL: only update fields that are EXPLICITLY provided in the payload.
  // Otherwise we'd nuke existing data when caller only sends a subset (e.g. backfill tags).
  // We detect "provided" by checking the key exists on the object (not just truthy).
  const hasGS = 'generalSubject' in item;
  const hasKP = 'keyPoints' in item;
  const hasSKP = 'shortKeyPoints' in item;
  const hasTopics = 'topics' in item;

  if (hasGS || hasKP || hasSKP || hasTopics) {
    // Fetch current metadata to merge correctly
    const current = await prisma.resourceMetadata.findUnique({
      where: { resourceId },
      select: { generalSubject: true, keyPoints: true, shortKeyPoints: true, topics: true, modelUsed: true },
    });

    const merged = {
      generalSubject: hasGS ? (generalSubject || null) : (current?.generalSubject ?? null),
      keyPoints: hasKP ? sanitizeArray(keyPoints, 10) : (current?.keyPoints ?? []),
      shortKeyPoints: hasSKP ? sanitizeArray(shortKeyPoints, 10) : (current?.shortKeyPoints ?? []),
      topics: hasTopics ? sanitizeArray(topics, 20) : (current?.topics ?? []),
      modelUsed: modelUsed || current?.modelUsed || 'mavis-manual',
    };

    await prisma.resourceMetadata.upsert({
      where: { resourceId },
      create: { resourceId, ...merged },
      update: { ...merged, extractedAt: new Date() },
    });
  }

  // Upsert ResourceSummary (FR in `summary`, original lang in `summaryOriginal`).
  // If only one is provided, we still set both fields — the second stays null.
  if ((summary && summary.trim().length > 0) || (summaryOriginal && summaryOriginal.trim().length > 0)) {
    const frSummary = (summary && summary.trim().length > 0) ? summary.trim().slice(0, 5000) : null;
    const origSummary = (summaryOriginal && summaryOriginal.trim().length > 0) ? summaryOriginal.trim().slice(0, 5000) : null;
    await prisma.resourceSummary.upsert({
      where: { resourceId },
      create: {
        resourceId,
        summary: frSummary || origSummary || '',
        summaryOriginal: origSummary,
        modelUsed: modelUsed || 'mavis-manual',
      },
      update: {
        // Only update each field if explicitly provided (same "merge" pattern as metadata)
        ...(frSummary !== null ? { summary: frSummary } : {}),
        ...(origSummary !== null ? { summaryOriginal: origSummary } : {}),
        extractedAt: new Date(),
        modelUsed: modelUsed || 'mavis-manual',
      },
    });
  }

  // Update Resource fields: tags (CSV) + summary (short 1-2 line, used for cards)
  const updateData: any = {};
  if (summary && summary.trim().length > 0) {
    updateData.summary = summary.trim().slice(0, 500);
    updateData.descriptionGeneratedAt = new Date();
    updateData.descriptionSource = modelUsed || 'mavis-manual';
  }
  // Write tags to Resource.tags (CSV) for UI display
  // Source priority: shortKeyPoints (from payload or current DB) > topics
  let tagsForUI: string[] = [];
  if (hasSKP) {
    tagsForUI = sanitizeArray(shortKeyPoints, 10);
  } else {
    // Read current shortKeyPoints from DB
    const cur = await prisma.resourceMetadata.findUnique({
      where: { resourceId },
      select: { shortKeyPoints: true, topics: true },
    });
    tagsForUI = (cur?.shortKeyPoints && cur.shortKeyPoints.length > 0)
      ? cur.shortKeyPoints
      : (cur?.topics || []);
  }
  if (tagsForUI.length > 0) {
    updateData.tags = tagsForUI.join(',');
  }
  if (Object.keys(updateData).length > 0) {
    await prisma.resource.update({
      where: { id: resourceId },
      data: updateData,
    });
  }

  return { resourceId, ok: true, title: resource.title };
}

export async function POST(req: NextRequest) {
  // Auth
  const auth = await checkAuth(req);
  if (!auth.isAuth) {
    return NextResponse.json({ error: 'Admin ou SEED_TOKEN requis' }, { status: 401 });
  }

  let body: SingleUpdate | BulkPayload;
  try {
    body = await req.json();
  } catch (e: any) {
    return NextResponse.json({ error: 'JSON invalide', details: e.message }, { status: 400 });
  }

  // Detect bulk vs single
  const items: SingleUpdate[] = 'items' in body && Array.isArray(body.items)
    ? body.items
    : [body as SingleUpdate];

  if (items.length === 0) {
    return NextResponse.json({ error: 'Aucun item fourni' }, { status: 400 });
  }

  // Limit bulk size for safety
  if (items.length > 200) {
    return NextResponse.json(
      { error: `Trop d'items (${items.length}). Maximum 200 par appel.` },
      { status: 400 }
    );
  }

  const results = [];
  let success = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const r = await applyOne(item);
      if (r.ok) success++;
      else failed++;
      results.push(r);
    } catch (e: any) {
      failed++;
      results.push({ resourceId: item.resourceId, ok: false, error: e.message });
    }
  }

  return NextResponse.json({
    status: 'ok',
    total: items.length,
    success,
    failed,
    results,
  });
}

/**
 * GET endpoint to check current metadata for a resource (or list of IDs).
 * Query: ?ids=id1,id2,id3
 */
export async function GET(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuth) {
    return NextResponse.json({ error: 'Admin ou SEED_TOKEN requis' }, { status: 401 });
  }

  const idsParam = req.nextUrl.searchParams.get('ids') || '';
  const ids = idsParam.split(',').filter(Boolean);

  if (ids.length === 0) {
    return NextResponse.json({ error: 'Param ids=id1,id2,... requis' }, { status: 400 });
  }

  const metadata = await prisma.resourceMetadata.findMany({
    where: { resourceId: { in: ids } },
    select: {
      resourceId: true,
      generalSubject: true,
      keyPoints: true,
      shortKeyPoints: true,
      topics: true,
      modelUsed: true,
      extractedAt: true,
    },
  });

  const summaries = await prisma.resourceSummary.findMany({
    where: { resourceId: { in: ids } },
    select: { resourceId: true, summary: true, modelUsed: true, extractedAt: true },
  });

  return NextResponse.json({
    total: ids.length,
    found: metadata.length,
    metadata,
    summaries,
  });
}
