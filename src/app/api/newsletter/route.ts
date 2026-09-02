// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: 'Email requis' }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Email invalide' }, { status: 400 });
    }

    const db = await getD1();
    const normalizedEmail = email.toLowerCase();
    const existing = await db
      .prepare('SELECT id, isActive FROM Newsletter WHERE email = ? LIMIT 1')
      .bind(normalizedEmail)
      .first();

    if (existing) {
      if (!existing.isActive) {
        await db
          .prepare('UPDATE Newsletter SET isActive = 1, unsubscribedAt = NULL WHERE id = ?')
          .bind(existing.id)
          .run();
        return NextResponse.json({ success: true, message: 'Réabonnement confirmé !' });
      }
      return NextResponse.json({ error: 'Déjà inscrit' }, { status: 409 });
    }

    await db
      .prepare(
        'INSERT INTO Newsletter (id, email, isActive, subscribedAt) VALUES (?, ?, 1, ?)',
      )
      .bind(
        crypto.randomUUID().replace(/-/g, '').slice(0, 25),
        normalizedEmail,
        Date.now(),
      )
      .run();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
