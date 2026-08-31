// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getCurrentUser } from '@/lib/auth';

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  try {
    const { newEmail, password } = await req.json();
    if (!newEmail || !password) {
      return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return NextResponse.json({ error: 'Email invalide' }, { status: 400 });
    }

    const db = await getD1();
    const fullUser = await db
      .prepare('SELECT id, passwordHash FROM User WHERE id = ? LIMIT 1')
      .bind(user.id)
      .first();

    if (!fullUser?.passwordHash) {
      return NextResponse.json({ error: 'Compte sans mot de passe' }, { status: 400 });
    }
    const valid = await bcrypt.compare(password, fullUser.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: 'Mot de passe incorrect' }, { status: 400 });
    }

    const normalizedEmail = newEmail.toLowerCase();
    const existing = await db
      .prepare('SELECT id FROM User WHERE email = ? LIMIT 1')
      .bind(normalizedEmail)
      .first();
    if (existing && existing.id !== user.id) {
      return NextResponse.json({ error: 'Cet email est déjà utilisé' }, { status: 400 });
    }

    await db
      .prepare(
        'UPDATE User SET email = ?, emailVerifiedAt = NULL, updatedAt = ? WHERE id = ?',
      )
      .bind(normalizedEmail, Date.now(), user.id)
      .run();

    return NextResponse.json({
      success: true,
      message: 'Email changé. Vérifiez votre nouvelle adresse.',
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
