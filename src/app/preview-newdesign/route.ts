// @ts-nocheck
// 2026-09-13: Helper endpoint to set the preview_newdesign cookie.
// Visit /preview-newdesign once, then navigate to a real resource page.
// The cookie persists for 30 days.

import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
  
  // Set the cookie
  const response = NextResponse.redirect(new URL('/fr', url));
  response.cookies.set('preview_newdesign', '1', {
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    httpOnly: false,
    sameSite: 'lax',
  });
  return response;
}
