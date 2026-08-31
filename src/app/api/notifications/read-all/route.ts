// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getRequestOrigin } from '@/lib/origin';

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const db = await getD1();
  await db
    .prepare(
      'UPDATE Notification SET isRead = 1 WHERE userId = ? AND isRead = 0',
    )
    .bind(user.id)
    .run();

  return NextResponse.redirect(new URL('/mon-compte/notifications', getRequestOrigin(req)));
}
