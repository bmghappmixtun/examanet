// @ts-nocheck
/**
 * Teacher library blob proxy - INTERNAL USE ONLY.
 *
 * Proxies teacher-library files from Vercel Blob through examanet.com.
 * This is used by the AI extraction bulk pipeline to bypass IP-based
 * rate limits from Vercel Blob's edge network.
 *
 * NOT intended for public user access. Protected by a shared secret in
 * the X-Internal-Token header (matching INTERNAL_BULK_TOKEN env var).
 *
 * If the token is missing, the route refuses to serve (returns 404).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const BLOB_BASE_URL = 'https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com';
const INTERNAL_TOKEN = process.env.INTERNAL_BULK_TOKEN || 'devmanet-bulk-2026';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  // Auth check
  const token = req.headers.get('x-internal-token');
  if (token !== INTERNAL_TOKEN) {
    return new NextResponse('Not found', { status: 404 });
  }

  const { key: keyParts } = await params;
  const key = keyParts.map(decodeURIComponent).join('/');

  // Validate the key looks like a teacher-library key
  if (!key.startsWith('teacher-library/')) {
    return new NextResponse('Invalid key', { status: 400 });
  }

  // Build upstream URL
  const upstreamUrl = `${BLOB_BASE_URL}/${key}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { 'User-Agent': 'Examanet-Internal/1.0' },
    });

    if (!upstream.ok) {
      return new NextResponse(`Upstream fetch failed: ${upstream.status}`, {
        status: 502,
      });
    }

    const contentType = upstream.headers.get('content-type') || 'application/pdf';
    const stream = upstream.body;
    if (!stream) {
      return new NextResponse('No body', { status: 502 });
    }

    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e: any) {
    return new NextResponse(`Proxy error: ${e.message}`, { status: 502 });
  }
}
