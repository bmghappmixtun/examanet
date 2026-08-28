// @ts-nocheck
// 2026-08-28: Rewrote to use D1 directly — the old version imported
// getCurrentUser() which triggered prisma-compat and crashed in the
// OpenNext render pipeline. This minimal route does NO prisma work.

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function genId() {
  // Compact random ID (no crypto import to keep bundle small)
  return 'el_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export async function POST(req: NextRequest) {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;

    const body = await req.json().catch(() => ({}));
    const message = (body?.message ?? 'unknown').toString().slice(0, 2000);
    const source = (body?.source ?? 'CLIENT').toString().slice(0, 50);
    const level = (body?.severity ?? body?.level ?? 'error').toString().slice(0, 20);
    const url = (body?.url ?? '').toString().slice(0, 500);
    const stack = (body?.stack ?? '').toString().slice(0, 4000);
    const method = (body?.method ?? req.method ?? 'POST').toString().slice(0, 10);
    const context = JSON.stringify({
      userAgent: body?.userAgent ?? req.headers.get('user-agent') ?? null,
      referer: req.headers.get('referer') ?? null,
      ip: req.headers.get('x-forwarded-for') ?? null,
      breadcrumbs: body?.breadcrumbs ?? null,
    }).slice(0, 8000);

    await db.prepare(
      'INSERT INTO ErrorLog (id, source, level, message, stack, url, method, context, agentSeen, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)'
    ).bind(
      genId(),
      source,
      level,
      message,
      stack,
      url,
      method,
      context,
      Date.now()
    ).run();

    // Always return 200 — even if logging fails, don't spam the client with errors
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // Swallow — return 200 so the client doesn't retry forever
    return NextResponse.json({ ok: false, error: 'logger_failed' }, { status: 200 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'error-logger' });
}
