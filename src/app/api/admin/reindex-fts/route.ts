import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function POST(request: NextRequest) {
  // Check auth
  const token = request.headers.get('x-migration-token');
  if (token !== process.env.MIGRATION_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;
    if (!db) {
      return NextResponse.json({ error: 'D1 not available' }, { status: 500 });
    }

    // Count current FTS5 state
    const ftsCount = await db.prepare('SELECT COUNT(*) as c FROM resource_fts').first();
    const resourceCount = await db.prepare("SELECT COUNT(*) as c FROM Resource WHERE status = 'PUBLISHED'").first();
    
    // Rebuild FTS5 index from scratch
    // FTS5 with external content + rowid will auto-populate via triggers on insert
    // We need to manually rebuild for existing data
    await db.prepare(`DELETE FROM resource_fts`).run();
    
    // Re-insert all published resources into FTS5
    // Get title + description + subject for indexing
    const result = await db.prepare(`
      INSERT INTO resource_fts (rowid, title, description, subject)
      SELECT 
        r.numericId,
        COALESCE(r.title, ''),
        COALESCE(r.description, ''),
        COALESCE(s.name, '')
      FROM Resource r
      LEFT JOIN Subject s ON r.subjectId = s.numericId
      WHERE r.status = 'PUBLISHED'
    `).run();

    // Also populate trigram index for Arabic
    await db.prepare(`DELETE FROM resource_fts_trigram`).run();
    await db.prepare(`
      INSERT INTO resource_fts_trigram (rowid, title, description)
      SELECT 
        r.numericId,
        COALESCE(r.title, ''),
        COALESCE(r.description, '')
      FROM Resource r
      WHERE r.status = 'PUBLISHED'
    `).run();

    return NextResponse.json({
      fts5_before: ftsCount?.c || 0,
      resource_count: resourceCount?.c || 0,
      reindexed: result.meta?.changes || 0,
      success: true
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
