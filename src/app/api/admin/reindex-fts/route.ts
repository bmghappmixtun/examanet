import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function POST(request: NextRequest) {
  const token = request.headers.get('x-migration-token');
  if (token !== process.env.MIGRATION_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;
    if (!db) return NextResponse.json({ error: 'D1 not available' }, { status: 500 });

    const log: string[] = [];

    // Drop corrupted FTS5 tables
    const dropStmts = [
      'DROP TABLE IF EXISTS resource_fts',
      'DROP TABLE IF EXISTS resource_fts_data',
      'DROP TABLE IF EXISTS resource_fts_idx',
      'DROP TABLE IF EXISTS resource_fts_docsize',
      'DROP TABLE IF EXISTS resource_fts_config',
      'DROP TABLE IF EXISTS resource_fts_trigram',
      'DROP TABLE IF EXISTS resource_fts_trigram_data',
      'DROP TABLE IF EXISTS resource_fts_trigram_idx',
      'DROP TABLE IF EXISTS resource_fts_trigram_docsize',
      'DROP TABLE IF EXISTS resource_fts_trigram_config',
      // Also drop triggers
      'DROP TRIGGER IF EXISTS resource_fts_ai',
      'DROP TRIGGER IF EXISTS resource_fts_ad',
      'DROP TRIGGER IF EXISTS resource_fts_au',
      'DROP TRIGGER IF EXISTS resource_fts_trigram_ai',
      'DROP TRIGGER IF EXISTS resource_fts_trigram_ad',
      'DROP TRIGGER IF EXISTS resource_fts_trigram_au',
    ];
    for (const stmt of dropStmts) {
      try { await db.prepare(stmt).run(); log.push(`dropped: ${stmt}`); } catch (e: any) { log.push(`skip ${stmt}: ${e.message}`); }
    }

    // Recreate FTS5 with unicode61 (FR-friendly)
    await db.prepare(`
      CREATE VIRTUAL TABLE resource_fts USING fts5(
        title, description, subject,
        content=''
      )
    `).run();
    log.push('created resource_fts');

    // Recreate trigram FTS5 (AR-friendly)
    await db.prepare(`
      CREATE VIRTUAL TABLE resource_fts_trigram USING fts5(
        title, description,
        content='',
        tokenize='trigram'
      )
    `).run();
    log.push('created resource_fts_trigram');

    // Populate from Resource table
    const insertRes = await db.prepare(`
      INSERT INTO resource_fts (rowid, title, description, subject)
      SELECT 
        r.numericId,
        COALESCE(r.title, ''),
        COALESCE(r.description, ''),
        COALESCE(s.nameFr, '')
      FROM Resource r
      LEFT JOIN Subject s ON r.subjectId = s.numericId
      WHERE r.status = 'PUBLISHED'
    `).run();
    log.push(`inserted resource_fts: ${insertRes.meta?.changes || 0} rows`);

    const insertTri = await db.prepare(`
      INSERT INTO resource_fts_trigram (rowid, title, description)
      SELECT 
        r.numericId,
        COALESCE(r.title, ''),
        COALESCE(r.description, '')
      FROM Resource r
      WHERE r.status = 'PUBLISHED'
    `).run();
    log.push(`inserted resource_fts_trigram: ${insertTri.meta?.changes || 0} rows`);

    return NextResponse.json({ success: true, log });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.slice(0, 500) }, { status: 500 });
  }
}
