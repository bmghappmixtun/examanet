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

/**
 * 2026-09-06: Fix redirect bug.
 *
 * Old behavior: always redirected to /mon-compte/notifications, which sent
 * teachers to the wrong URL (they should stay on /enseignant/notifications).
 *
 * New behavior:
 * 1. Check the Referer header — if it's one of our app pages, redirect back
 *    to it (so the user stays where they came from).
 * 2. Otherwise, fall back to a role-appropriate URL:
 *    - Teacher/Admin → /enseignant/notifications
 *    - Student      → /mon-compte/notifications
 *
 * Also accepts an optional `?next=/path` query param so the form can specify
 * where to go. (More explicit than relying on Referer.)
 */
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

  // Determine redirect target
  const origin = getRequestOrigin(req);
  const nextParam = req.nextUrl.searchParams.get('next');
  const referer = req.headers.get('referer') || '';

  // 1. Explicit `?next=/path` param wins (must be a relative path for safety)
  let target: string | null = null;
  if (nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')) {
    target = nextParam;
  }

  // 2. Referer from our app (same origin, app path)
  if (!target && referer) {
    try {
      const refUrl = new URL(referer);
      if (refUrl.origin === origin && refUrl.pathname.startsWith('/')) {
        const p = refUrl.pathname;
        // Only redirect back to known notification-related pages (avoid open-redirect)
        if (p === '/enseignant/notifications' || p === '/mon-compte/notifications' || p.startsWith('/enseignant/') || p.startsWith('/mon-compte/')) {
          target = p + (refUrl.search || '');
        }
      }
    } catch {
      // ignore malformed referer
    }
  }

  // 3. Role-based default
  if (!target) {
    const isTeacherOrAdmin = user.role === 'TEACHER' || user.role === 'ADMIN';
    target = isTeacherOrAdmin ? '/enseignant/notifications' : '/mon-compte/notifications';
  }

  return NextResponse.redirect(new URL(target, origin));
}
