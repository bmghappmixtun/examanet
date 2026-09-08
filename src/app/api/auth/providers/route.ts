// @ts-nocheck
/**
 * GET /api/auth/providers
 * 
 * Public endpoint that returns which auth providers are configured.
 * Used by client UI to show/hide OAuth buttons.
 * 
 * Note: Only returns provider NAMES, never secrets.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const providers: string[] = ['credentials'];
  
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push('google');
  }
  if (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) {
    providers.push('facebook');
  }
  if (process.env.APPLE_ID && process.env.APPLE_SECRET) {
    providers.push('apple');
  }

  return NextResponse.json({
    providers,
    magicLink: true, // always available
  });
}
