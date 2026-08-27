import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;
    
    const levels = await db.prepare('SELECT * FROM "Level" ORDER BY "order" ASC').all();
    const classes = await db.prepare('SELECT * FROM "Class" ORDER BY "order" ASC').all();
    const sections = await db.prepare('SELECT * FROM "Section"').all();
    
    return NextResponse.json({
      levels: levels.results,
      classCount: classes.results?.length,
      classes: classes.results,
      sectionCount: sections.results?.length,
      // Group by level
      classesByLevel: (levels.results || []).map((l: any) => ({
        level: l.slug,
        classes: (classes.results || []).filter((c: any) => c.levelId === l.id).map((c: any) => ({
          slug: c.slug,
          nameFr: c.nameFr,
          order: c.order,
        })),
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.slice(0, 500) }, { status: 500 });
  }
}
