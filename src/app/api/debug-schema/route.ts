import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;
    const tables = await db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name IN ('Class','Subject','Section')").all();
    return NextResponse.json(tables.results);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
