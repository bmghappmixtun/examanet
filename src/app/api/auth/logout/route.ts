import { NextRequest, NextResponse } from 'next/server';
import { isValidOrigin, isProduction } from '@/lib/security';
import { clearSessionCookie } from '@/lib/auth';
import { getRequestOrigin } from '@/lib/origin';

export async function POST(req: NextRequest) {
  // SECURITY: CSRF origin check (production only)
  if (isProduction() && !isValidOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }

  await clearSessionCookie();
  return NextResponse.redirect(new URL('/', getRequestOrigin(req)));
}
