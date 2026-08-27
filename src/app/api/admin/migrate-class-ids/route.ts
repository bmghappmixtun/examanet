// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import * as fs from 'fs';
import * as path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIGRATION_TOKEN = process.env.MIGRATION_TOKEN || 'migration-secret-2026-08-26-1787767184';

interface ResourceExport {
  id: string;
  classId: string | null;
  sectionId: string | null;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${MIGRATION_TOKEN}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const body = await req.json().catch(() => ({}));
  const dryRun = body.dryRun !== false;
  const batchSize = body.batchSize || 200;
  
  try {
    const exportPath = path.join(
      process.cwd(),
      'scripts',
      'd1-migration',
      'exports',
      'Resource.json'
    );
    if (!fs.existsSync(exportPath)) {
      return NextResponse.json({ error: 'Export file not found at ' + exportPath }, { status: 500 });
    }
    const resources: ResourceExport[] = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
    
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;
    
    const currentStats = await db.prepare(
      "SELECT COUNT(*) as total, SUM(CASE WHEN classId IS NULL THEN 1 ELSE 0 END) as null_count FROM Resource WHERE status = 'PUBLISHED'"
    ).first();
    
    const d1Classes = await db.prepare("SELECT id FROM `Class`").all();
    const d1ClassIds = new Set((d1Classes.results || []).map((c: any) => c.id));
    
    const updates: Array<{ id: string; classId: string }> = [];
    const skipped: Array<{ id: string; reason: string }> = [];
    for (const r of resources) {
      if (!r.classId) {
        skipped.push({ id: r.id, reason: 'no classId in export' });
        continue;
      }
      if (!d1ClassIds.has(r.classId)) {
        skipped.push({ id: r.id, reason: `classId ${r.classId} not in D1 Class` });
        continue;
      }
      updates.push({ id: r.id, classId: r.classId });
    }
    
    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        totalResources: resources.length,
        plannedUpdates: updates.length,
        skipped: skipped.length,
        beforeNullCount: currentStats?.null_count,
      });
    }
    
    let updated = 0;
    let failed = 0;
    const startTime = Date.now();
    
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      const cases = batch.map(u => `WHEN '${u.id}' THEN '${u.classId}'`).join(' ');
      const ids = batch.map(u => `'${u.id}'`).join(',');
      const sql = `UPDATE Resource SET classId = CASE id ${cases} END WHERE id IN (${ids}) AND classId IS NULL`;
      
      try {
        const result = await db.prepare(sql).run();
        updated += (result as any).meta?.changes || batch.length;
      } catch (e: any) {
        console.error(`[migrate-class-ids] Batch ${i} failed:`, e.message);
        failed += batch.length;
      }
    }
    
    const elapsed = Date.now() - startTime;
    
    const postStats = await db.prepare(
      "SELECT COUNT(*) as total, SUM(CASE WHEN classId IS NULL THEN 1 ELSE 0 END) as null_count FROM Resource WHERE status = 'PUBLISHED'"
    ).first();
    
    return NextResponse.json({
      ok: true,
      dryRun: false,
      durationMs: elapsed,
      totalResources: resources.length,
      plannedUpdates: updates.length,
      updated,
      failed,
      beforeNullCount: currentStats?.null_count,
      afterNullCount: postStats?.null_count,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
