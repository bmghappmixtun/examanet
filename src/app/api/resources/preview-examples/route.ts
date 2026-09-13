// @ts-nocheck
import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;
    if (!db) return NextResponse.json({ examples: [] });
    
    const result = await db.prepare(`
      SELECT numericId, title, viewsCount 
      FROM Resource 
      WHERE status = 'PUBLISHED' AND isHidden = 0
      ORDER BY viewsCount DESC LIMIT 4
    `).all();
    
    return NextResponse.json({
      examples: (result.results || []).map((r: any) => ({
        numericId: r.numericId,
        title: r.title,
      })),
    });
  } catch {
    return NextResponse.json({ examples: [] });
  }
}
