// @ts-nocheck
export const dynamic = 'force-dynamic';

/**
 * Admin API: list / create / update / delete conversion providers.
 *
 * 2026-09-06: Rewrote to use raw D1 queries (d1All, d1First, d1Run) instead
 * of the broken d1-admin stub. The route's old Prisma-style code expected
 * columns like 'provider' / 'enabled' that don't exist in the real D1
 * ApiProvider table (which uses 'type' / 'isActive'). This caused all
 * writes to throw "no such column" → 500 → "Erreur réseau" in the UI.
 *
 *   GET    /api/admin/providers              — list all + usage stats
 *   POST   /api/admin/providers              — create or update a provider
 *   DELETE /api/admin/providers?provider=X   — remove a provider
 *
 * All routes require ADMIN role.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isValidOrigin, isProduction } from '@/lib/security';
import { getCurrentUser } from '@/lib/auth';
import { d1All, d1First, d1Run, genId } from '@/lib/db-d1';
import { encryptSecret, decryptSecret, redactSecret } from '@/lib/provider-keys';

export const runtime = 'nodejs';

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: 'Non authentifié', status: 401 };
  if (user.role !== 'ADMIN') return { error: 'Accès admin requis', status: 403 };
  return { user };
}

const SUPPORTED = new Set(['iloveapi', 'apiconvert']);

export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const providers = await d1All(
    'SELECT id, name, type, displayName, isActive, publicKey, apiKey, secretKey, monthlyQuota, apiUrl, notes, createdAt, updatedAt FROM ApiProvider WHERE type IN (\'iloveapi\', \'apiconvert\') ORDER BY type ASC'
  );

  // Compute usage for the current month for each provider.
  // We DO NOT have an ApiProviderUsage table in the current D1 schema,
  // so we always return 0s here (stats are sourced from Cloudflare logs).
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const result = providers.map((p: any) => {
    const used = 0;
    const successCount = 0;
    const failureCount = 0;
    const last30Days = 0;
    const remaining = p.monthlyQuota ? Math.max(0, p.monthlyQuota - used) : null;
    const percentUsed = p.monthlyQuota ? Math.round((used / p.monthlyQuota) * 100) : null;

    return {
      id: p.id,
      provider: p.type,
      displayName: p.displayName,
      publicKey: p.publicKey,
      secretKeyRedacted: p.apiKey
        ? redactSecret(decryptSecret(p.apiKey))
        : p.secretKey
        ? redactSecret(decryptSecret(p.secretKey))
        : '',
      hasSecret: Boolean(p.apiKey || p.secretKey),
      enabled: Boolean(p.isActive),
      monthlyQuota: p.monthlyQuota,
      apiUrl: p.apiUrl,
      notes: p.notes,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      usage: {
        month,
        year,
        used,
        success: successCount,
        failed: failureCount,
        totalBytes: 0,
        last30Days,
        remaining,
        percentUsed,
      },
      lastUse: null,
    };
  });

  return NextResponse.json({ providers: result });
}

export async function POST(req: NextRequest) {
  if (isProduction() && !isValidOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }
  const auth = await requireAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    provider?: string;
    displayName?: string;
    publicKey?: string | null;
    secretKey?: string;
    enabled?: boolean;
    monthlyQuota?: number | null;
    apiUrl?: string | null;
    notes?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });
  }

  const provider = (body.provider || '').trim().toLowerCase();
  if (!SUPPORTED.has(provider)) {
    return NextResponse.json(
      { error: 'provider doit être "iloveapi" ou "apiconvert"' },
      { status: 400 },
    );
  }

  if (!body.secretKey || body.secretKey.trim().length < 4) {
    return NextResponse.json({ error: 'secretKey requis (min 4 caractères)' }, { status: 400 });
  }

  const now = Date.now();
  const publicKey = body.publicKey?.trim() || null;
  const encryptedToken = encryptSecret(body.secretKey.trim());
  const displayName = body.displayName?.trim() || null;
  const notes = body.notes?.trim() || null;
  const isActive = body.enabled !== false ? 1 : 0;
  const monthlyQuota = body.monthlyQuota ?? null;
  const apiUrl = body.apiUrl?.trim() || null;
  const name = displayName || provider;

  const existing = await d1First('SELECT id FROM ApiProvider WHERE type = ? LIMIT 1', provider);

  let id: string;
  if (existing) {
    id = existing.id;
    const r = await d1Run(
      `UPDATE ApiProvider
       SET name = ?, displayName = ?, publicKey = ?, secretKey = ?, apiKey = ?,
           isActive = ?, notes = ?, monthlyQuota = ?, apiUrl = ?, updatedAt = ?
       WHERE id = ?`,
      name, displayName, publicKey, encryptedToken, encryptedToken,
      isActive, notes, monthlyQuota, apiUrl, now, id,
    );
    if (!(r as any).success) {
      return NextResponse.json({ error: (r as any).error || 'Update failed' }, { status: 500 });
    }
  } else {
    id = genId();
    const r = await d1Run(
      `INSERT INTO ApiProvider
       (id, name, type, publicKey, secretKey, apiKey, isActive, displayName, notes, monthlyQuota, apiUrl, priority, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 100, ?, ?)`,
      id, name, provider, publicKey, encryptedToken, encryptedToken,
      isActive, displayName, notes, monthlyQuota, apiUrl, now, now,
    );
    if (!(r as any).success) {
      return NextResponse.json({ error: (r as any).error || 'Insert failed' }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: true,
    provider: {
      id,
      provider,
      displayName,
      enabled: isActive === 1,
    },
  });
}

export async function DELETE(req: NextRequest) {
  if (isProduction() && !isValidOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }
  const auth = await requireAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const provider = req.nextUrl.searchParams.get('provider')?.trim().toLowerCase();
  if (!provider) {
    return NextResponse.json({ error: 'provider query param requis' }, { status: 400 });
  }

  const existing = await d1First('SELECT id FROM ApiProvider WHERE type = ? LIMIT 1', provider);
  if (!existing) {
    return NextResponse.json({ error: 'Provider non trouvé' }, { status: 404 });
  }
  const r = await d1Run('DELETE FROM ApiProvider WHERE id = ?', existing.id);
  if (!(r as any).success) {
    return NextResponse.json({ error: (r as any).error || 'Delete failed' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
