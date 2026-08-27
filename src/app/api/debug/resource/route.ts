import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;
    
    const r = await db.prepare("SELECT * FROM Resource LIMIT 1").first();
    const classes = await db.prepare("SELECT id, slug, nameFr FROM Class").all();
    const distinctClassIds = await db.prepare("SELECT DISTINCT classId FROM Resource LIMIT 20").all();
    
    return NextResponse.json({
      firstResource: r,
      firstResource_classId: r?.classId,
      classIdsInResources: distinctClassIds.results,
      classes: classes.results,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
