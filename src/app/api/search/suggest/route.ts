// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const runtime = 'nodejs';
export const revalidate = 60; // 5 min cache

const SUGGEST_TYPES = ['resource', 'teacher', 'subject', 'class', 'section'] as const;
type SuggestType = (typeof SUGGEST_TYPES)[number];

interface SuggestResult {
  type: SuggestType;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  icon?: string;
}

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.DB;
}

async function searchResources(db: any, q: string, limit: number): Promise<SuggestResult[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];

  const like = `%${trimmed}%`;
  const r = await db.prepare(`
    SELECT r.id, r.numericId, r.title, r.slug, r.type,
           s.nameFr as subjectName, c.nameFr as className
    FROM Resource r
    LEFT JOIN \`Subject\` s ON r.subjectId = s.id
    LEFT JOIN \`Class\` c ON r.classId = c.id
    // 2026-09-05: also filter isHidden=0 to hide unpublished resources
    WHERE r.status = 'PUBLISHED' AND r.isHidden = 0
      AND (r.title LIKE ? OR r.description LIKE ? OR r.summary LIKE ?)
    ORDER BY r.viewsCount DESC
    LIMIT ?
  `).bind(like, like, like, limit).all();
  
  return (r?.results || []).map((row: any) => ({
    type: 'resource' as SuggestType,
    id: row.id,
    numericId: row.numericId,
    title: row.title,
    subtitle: [row.subjectName, row.className].filter(Boolean).join(' • '),
    href: `/fr/ressources/${row.numericId || row.id}/${row.slug}`,
    icon: 'file-text',
  }));
}

async function searchTeachers(db: any, q: string, limit: number): Promise<SuggestResult[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];

  const like = `%${trimmed}%`;
  const r = await db.prepare(`
    SELECT id, numericId, slug, firstName, lastName, schoolName
    FROM User
    WHERE role = 'TEACHER' AND status = 'ACTIVE'
      AND (LOWER(firstName) LIKE LOWER(?) OR LOWER(lastName) LIKE LOWER(?) OR LOWER(IFNULL(schoolName, '')) LIKE LOWER(?))
    LIMIT ?
  `).bind(like, like, like, limit).all();
  
  return (r?.results || []).map((row: any) => ({
    type: 'teacher' as SuggestType,
    id: row.id,
    numericId: row.numericId,
    title: `${row.firstName} ${row.lastName}`,
    subtitle: row.schoolName || 'Enseignant',
    href: `/fr/professeurs/${row.numericId || row.id}`,
    icon: 'user',
  }));
}

async function searchSubjects(db: any, q: string, limit: number): Promise<SuggestResult[]> {
  const trimmed = q.trim().toLowerCase();
  if (!trimmed) return [];
  
  const like = `%${trimmed}%`;
  const r = await db.prepare(`
    SELECT id, slug, nameFr, nameAr
    FROM Subject
    WHERE LOWER(nameFr) LIKE ? OR LOWER(nameAr) LIKE ?
    ORDER BY nameFr ASC
    LIMIT ?
  `).bind(like, like, limit).all();
  
  return (r?.results || []).map((row: any) => ({
    type: 'subject' as SuggestType,
    id: row.id,
    title: row.nameFr,
    href: `/fr/matieres/${row.slug}`,
    icon: 'book',
  }));
}

export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get('q') || '').trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] });
    }
    
    const db = await getD1();
    if (!db) {
      return NextResponse.json({ results: [], error: 'DB not available' }, { status: 503 });
    }
    
    const [resources, teachers, subjects] = await Promise.all([
      searchResources(db, q, 5),
      searchTeachers(db, q, 3),
      searchSubjects(db, q, 3),
    ]);
    
    return NextResponse.json({
      results: [...resources, ...teachers, ...subjects],
    });
  } catch (e: any) {
    console.error('[search/suggest] error:', e?.message);
    return NextResponse.json({ results: [], error: e?.message }, { status: 500 });
  }
}
