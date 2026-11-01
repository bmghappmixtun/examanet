// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/d1-admin';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/admin/logs/errorlog
 * 
 * Query ErrorLog table with filters.
 * 
 * Query params:
 * - sinceMs: number of ms ago (default 1h = 3600000)
 * - severity: filter by severity
 * - limit: max results (default 50, max 200)
 */
/**
 * 2026-10-26: contrôle d'accès ADMIN ajouté.
 *
 * Cette route était ouverte à TOUT le monde : `GET /api/admin/logs/errorlog`
 * répondait HTTP 200 sans aucun header, et exposait la table ErrorLog
 * (message, stack, url, userAgent, userEmail, userId, context) sur un
 * historique NON BORNÉ (`sinceMs` libre → 30 jours, `limit` jusqu'à 200).
 * C'est une fuite de PII (emails d'élèves) + d'internes.
 *
 * Même contrôle que les routes admin sœurs (api/admin/logs/clear,
 * api/admin/providers) : 401 si pas de session, 403 si le rôle n'est pas
 * ADMIN.
 */
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: 'Non autorisé', status: 401 };
  if (user.role !== 'ADMIN') return { error: 'Accès admin requis', status: 403 };
  return { user };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const sinceMs = parseInt(url.searchParams.get('sinceMs') || '3600000');
  const severity = url.searchParams.get('severity');
  const limit = Math.min(200, parseInt(url.searchParams.get('limit') || '50'));
  
  const since = new Date(Date.now() - sinceMs);
  
  try {
    // 2026-11-01: la colonne réelle est `level`, PAS `severity` (severity
    // n'existe pas dans ErrorLog -> filtre silencieusement inerte car en
    // SQLite un identifiant en double quotes inconnu devient un litteral
    // chaine). La base contient 'ERROR' (331) mais aussi 'error' (1) :
    // on filtre donc sur les deux casses.
    const where: any = { createdAt: { gte: since } };
    if (severity && severity !== 'all') {
      where.OR = [{ level: severity }, { level: severity.toLowerCase() }];
    }
    
    const logs = await db.errorLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    
    // Get counts by severity (colonne réelle : level)
    const counts = await db.errorLog.groupBy({
      by: ['level'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    });
    
    return NextResponse.json({
      ok: true,
      range: { since, until: new Date() },
      counts: counts.map(c => ({ level: c.level, count: c._count._all })),
      logs: logs.map(l => ({
        ...l,
        createdAt: (typeof l.createdAt === 'number' ? new Date(l.createdAt).toISOString() : l.createdAt),
        updatedAt: (typeof l.updatedAt === 'number' ? new Date(l.updatedAt).toISOString() : l.updatedAt),
        resolvedAt: (l.resolvedAt ? (typeof l.resolvedAt === "number" ? new Date(l.resolvedAt).toISOString() : l.resolvedAt) : null) || null,
        agentNotifiedAt: (l.agentNotifiedAt ? (typeof l.agentNotifiedAt === "number" ? new Date(l.agentNotifiedAt).toISOString() : l.agentNotifiedAt) : null) || null,
        agentSeenAt: (l.agentSeenAt ? (typeof l.agentSeenAt === "number" ? new Date(l.agentSeenAt).toISOString() : l.agentSeenAt) : null) || null,
      })),
    });
  } catch (e) {
    return NextResponse.json({ 
      error: 'Query failed',
      detail: (e as Error).message,
    }, { status: 500 });
  }
}
