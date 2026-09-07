// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await getCurrentUser();
    if (!me || me.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const now = Date.now();

    if (action !== 'reply' && action !== 'archive' && action !== 'unarchive' && action !== 'delete') {
      return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
    }

    const db = await getD1();
    if (!db) {
      return NextResponse.json({ error: 'DB indisponible' }, { status: 503 });
    }

    // Verify exists
    const msg = await db.prepare(
      'SELECT id, status, email, name, subject FROM ContactMessage WHERE id = ?'
    ).bind(id).first();

    if (!msg) {
      return NextResponse.json({ error: 'Message introuvable' }, { status: 404 });
    }

    if (action === 'delete') {
      await db.prepare('DELETE FROM ContactMessage WHERE id = ?').bind(id).run();
      return NextResponse.json({ success: true, action: 'deleted' });
    }

    if (action === 'reply') {
      await db.prepare(
        'UPDATE ContactMessage SET status = ?, repliedAt = ? WHERE id = ?'
      ).bind('REPLIED', now, id).run();
      return NextResponse.json({ success: true, action: 'replied' });
    }

    if (action === 'archive') {
      await db.prepare(
        'UPDATE ContactMessage SET status = ? WHERE id = ?'
      ).bind('ARCHIVED', id).run();
      return NextResponse.json({ success: true, action: 'archived' });
    }

    if (action === 'unarchive') {
      await db.prepare(
        'UPDATE ContactMessage SET status = ? WHERE id = ?'
      ).bind('PENDING', id).run();
      return NextResponse.json({ success: true, action: 'unarchived' });
    }
  } catch (e: any) {
    console.error('[admin/contact-messages] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
