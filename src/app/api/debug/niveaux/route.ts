import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;
    
    if (!db) return NextResponse.json({ error: 'No D1' }, { status: 500 });
    
    // Test the count query
    const counts1 = await db.prepare("SELECT classId, COUNT(*) as count FROM Resource WHERE status = ? AND classId IS NOT NULL GROUP BY classId").bind("PUBLISHED").all();
    
    // Try with .first() to see schema
    const singleRow = await db.prepare("SELECT * FROM Resource WHERE classId IS NOT NULL LIMIT 1").first();
    
    // Alternative count query
    const counts2 = await db.prepare("SELECT classId, COUNT(*) as c FROM Resource WHERE status = ? GROUP BY classId").bind("PUBLISHED").all();
    
    // Total resource count
    const total = await db.prepare("SELECT COUNT(*) as total FROM Resource WHERE status = ?").bind("PUBLISHED").first();
    
    return NextResponse.json({
      counts1: {
        count: counts1.results?.length || 0,
        first: counts1.results?.[0],
        keys: counts1.results?.[0] ? Object.keys(counts1.results[0]) : [],
      },
      counts2: {
        count: counts2.results?.length || 0,
        first: counts2.results?.[0],
      },
      singleRow_keys: singleRow ? Object.keys(singleRow) : null,
      singleRow_classId: singleRow?.classId,
      total_published: total,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.slice(0, 500) }, { status: 500 });
  }
}
