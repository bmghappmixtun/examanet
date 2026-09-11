import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const ctx = await getCloudflareContext({ async: true });
  const env = (ctx as any).env || {};
  const keys = Object.keys(env);
  const hasToken = !!env.CLOUDFLARE_API_TOKEN;
  const tokenLen = env.CLOUDFLARE_API_TOKEN ? String(env.CLOUDFLARE_API_TOKEN).length : 0;
  const processToken = !!(typeof process !== 'undefined' && (process as any).env?.CLOUDFLARE_API_TOKEN);
  return NextResponse.json({
    envKeys: keys,
    hasToken,
    tokenLen,
    processToken,
  });
}
