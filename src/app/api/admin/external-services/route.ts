// @ts-nocheck
export const dynamic = 'force-dynamic';

/**
 * Admin API: external service credentials + usage
 *
 * Stores API keys (APIConvert, iLoveAPI) in the ApiProvider
 * D1 table. The table has columns: id, name, type, apiKey, publicKey,
 * secretKey, baseUrl, model, isActive, displayName, notes, monthlyQuota,
 * priority, config, lastUsedAt, createdAt, updatedAt.
 *
 *   GET    /api/admin/external-services?type=X   — get X's stored config + live usage
 *   POST   /api/admin/external-services           — save X's credentials
 *   DELETE /api/admin/external-services?type=X    — remove X's credentials
 *   GET    /api/admin/external-services           — list all configured providers
 */

import { NextRequest, NextResponse } from 'next/server';
import { isValidOrigin, isProduction } from '@/lib/security';
import { getCurrentUser } from '@/lib/auth';
import { d1First, d1All, d1Run, genId } from '@/lib/db-d1';
import { encryptSecret, decryptSecret, redactSecret } from '@/lib/provider-keys';
import { checkConvertApiUsage, checkIlovepdfUsage } from '@/lib/external-services';
import {
  checkCFWorkersUsage,
  checkD1Usage,
  checkR2Usage,
} from '@/lib/external-services.cloudflare';

export const runtime = 'nodejs';

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: 'Non authentifié', status: 401 };
  if (user.role !== 'ADMIN') return { error: 'Accès admin requis', status: 403 };
  return { user };
}

// Map our internal types to the DB column values
const TYPE_VALUES = ['cloudflare', 'd1', 'r2', 'apiconvert', 'iloveapi'] as const;
type ProviderType = (typeof TYPE_VALUES)[number];

// CF-native types use the CF_API_TOKEN env secret, not a user-supplied token
const CF_NATIVE_TYPES: ProviderType[] = ['cloudflare', 'd1', 'r2'];

/**
 * 2026-09-06: Read the stored provider record from D1 directly.
 * The table uses 'type' (not 'provider') as the column name, and stores:
 *  - apiKey: encrypted single-token (apiconvert)
 *  - secretKey: encrypted (iloveapi secret)
 *  - publicKey: plaintext (iloveapi public)
 *  - isActive: 1/0 (instead of 'enabled')
 *  - monthlyQuota: integer (optional)
 *  - displayName, notes: text
 */
async function findProvider(type: ProviderType): Promise<any | null> {
  const row = await d1First(
    'SELECT * FROM ApiProvider WHERE type = ? AND isActive = 1 ORDER BY updatedAt DESC LIMIT 1',
    type,
  );
  return row || null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type')?.toLowerCase() as ProviderType | null;

  // No type → list all (include secretKey for the hasSecret badge + redacted display)
  if (!type) {
    const all = await d1All(
      'SELECT id, name, type, displayName, isActive, publicKey, apiKey, secretKey, monthlyQuota, notes, lastUsedAt, createdAt FROM ApiProvider WHERE isActive = 1 ORDER BY type ASC'
    );
    return NextResponse.json({
      providers: all.map((p: any) => ({
        id: p.id,
        name: p.name || p.type,
        type: p.type,
        displayName: p.displayName,
        enabled: Boolean(p.isActive),
        publicKey: p.publicKey,
        hasSecret: Boolean(p.apiKey || p.secretKey),
        secretKeyRedacted: p.apiKey
          ? redactSecret(decryptSecret(p.apiKey))
          : p.secretKey
          ? redactSecret(decryptSecret(p.secretKey))
          : '',
        monthlyQuota: p.monthlyQuota,
        notes: p.notes,
        lastUsedAt: p.lastUsedAt,
        createdAt: p.createdAt,
      })),
    });
  }

  if (!TYPE_VALUES.includes(type)) {
    return NextResponse.json(
      { error: `type doit être ${TYPE_VALUES.join(', ')}` },
      { status: 400 },
    );
  }

  const provider = await findProvider(type);
  // CF-native types don't need a stored token — they use the env secret
  if (CF_NATIVE_TYPES.includes(type)) {
    const cfToken = process.env.CF_API_TOKEN || '';
    if (!cfToken) {
      return NextResponse.json({
        configured: false,
        error: 'CF_API_TOKEN manquant côté worker',
        usage: getEmptyUsage(type),
      });
    }
    let usage: any;
    try {
      if (type === 'cloudflare') usage = await checkCFWorkersUsage(cfToken);
      else if (type === 'd1') usage = await checkD1Usage(cfToken);
      else if (type === 'r2') usage = await checkR2Usage(cfToken);
    } catch (e: any) {
      return NextResponse.json({
        configured: true,
        tokenInvalid: true,
        error: e?.message,
        usage: getEmptyUsage(type),
      });
    }
    return NextResponse.json({
      configured: true,
      enabled: true,
      displayName: 'Cloudflare (auto)',
      tokenRedacted: 'cfat_***',
      monthlyQuota: null,
      usage,
    });
  }
  if (!provider || !(provider.apiKey || provider.secretKey)) {
    return NextResponse.json({
      configured: false,
      usage: getEmptyUsage(type),
      tokenRedacted: '',
    });
  }

  // Decrypt the secret and call the live usage API
  const token = provider.apiKey ? decryptSecret(provider.apiKey)
                : provider.secretKey ? decryptSecret(provider.secretKey)
                : '';
  const publicKey = provider.publicKey || '';

  if (!token) {
    return NextResponse.json({ configured: true, tokenInvalid: true });
  }

  let usage: any;
  try {
    if (type === 'apiconvert') {
      usage = await checkConvertApiUsage(token);
    } else if (type === 'iloveapi') {
      // iLoveAPI needs both keys
      usage = await checkIlovepdfUsage(publicKey, token);
    } else if (CF_NATIVE_TYPES.includes(type)) {
      // CF-native: use CF_API_TOKEN env secret, not the user-supplied token
      const cfToken = process.env.CF_API_TOKEN || '';
      if (!cfToken) {
        usage = { error: 'CF_API_TOKEN non configuré sur le worker' };
      } else if (type === 'cloudflare') {
        usage = await checkCFWorkersUsage(cfToken);
      } else if (type === 'd1') {
        usage = await checkD1Usage(cfToken);
      } else if (type === 'r2') {
        usage = await checkR2Usage(cfToken);
      }
    } else {
      usage = { error: 'Live usage not implemented for this type' };
    }
  } catch (e: any) {
    return NextResponse.json({
      configured: true,
      tokenInvalid: true,
      error: e?.message || 'Live usage check failed',
    });
  }

  return NextResponse.json({
    configured: true,
    usage,
    publicKey,
    tokenRedacted: token ? redactSecret(token) : '',
    monthlyQuota: provider.monthlyQuota,
  });
}

function getEmptyUsage(type: ProviderType) {
  if (type === 'apiconvert' || type === 'iloveapi') {
    return {
      periodStart: '',
      periodEnd: '',
      quota: { used: 0, total: 0, remaining: 0, percent: 0 },
    };
  }
  if (type === 'cloudflare') {
    return {
      periodStart: '',
      periodEnd: '',
      requests: 0,
      errors: 0,
      successRate: 100,
      cpuTimeP50: 0,
      cpuTimeP99: 0,
    };
  }
  if (type === 'd1') {
    return {
      periodStart: '',
      periodEnd: '',
      storage: { usedMb: 0, unit: 'MB' },
      rowsRead: 0,
      rowsWritten: 0,
      queries: 0,
    };
  }
  if (type === 'r2') {
    return {
      periodStart: '',
      periodEnd: '',
      storage: { usedGb: 0, unit: 'GB' },
      classAOps: 0,
      classBOps: 0,
    };
  }
}

export async function POST(req: NextRequest) {
  if (isProduction() && !isValidOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }
  const auth = await requireAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    type?: string;
    token?: string;
    publicKey?: string | null;
    enabled?: boolean;
    displayName?: string | null;
    notes?: string | null;
    monthlyQuota?: number | null;
    name?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });
  }

  const type = (body.type || '').toLowerCase() as ProviderType;
  if (!TYPE_VALUES.includes(type)) {
    return NextResponse.json(
      { error: `type doit être ${TYPE_VALUES.join(', ')}` },
      { status: 400 },
    );
  }

  // CF-native types (cloudflare/d1/r2) don't need a stored token
  if (CF_NATIVE_TYPES.includes(type)) {
    // Just confirm the env secret is set
    if (!process.env.CF_API_TOKEN) {
      return NextResponse.json(
        { error: 'CF_API_TOKEN manquant côté worker' },
        { status: 500 },
      );
    }
    return NextResponse.json({
      success: true,
      type,
      configured: true,
      message: `${type} utilise CF_API_TOKEN du worker (auto-configuré)`,
    });
  }

  // For iLoveAPI: need both publicKey and secretKey
  // For others: just need a token
  if (type === 'iloveapi') {
    if (!body.publicKey || body.publicKey.trim().length < 5) {
      return NextResponse.json({ error: 'publicKey requis (min 5 caractères)' }, { status: 400 });
    }
    if (!body.token || body.token.trim().length < 5) {
      return NextResponse.json({ error: 'secretKey requis (min 5 caractères)' }, { status: 400 });
    }
  } else {
    if (!body.token || body.token.trim().length < 8) {
      return NextResponse.json({ error: 'token requis (min 8 caractères)' }, { status: 400 });
    }
  }

  const now = Date.now();
  const publicKey = body.publicKey?.trim() || null;
  const encryptedToken = encryptSecret(body.token!.trim());
  const displayName = body.displayName?.trim() || null;
  const notes = body.notes?.trim() || null;
  const isActive = body.enabled !== false ? 1 : 0;
  const monthlyQuota = body.monthlyQuota ?? null;
  const name = body.name?.trim() || displayName || type;

  // Find existing
  const existing = await d1First('SELECT id FROM ApiProvider WHERE type = ? LIMIT 1', type);

  if (existing) {
    // Update
    const r = await d1Run(
      `UPDATE ApiProvider
       SET name = ?, displayName = ?, publicKey = ?, secretKey = ?, apiKey = ?,
           isActive = ?, notes = ?, monthlyQuota = ?, updatedAt = ?
       WHERE id = ?`,
      name, displayName, publicKey, encryptedToken, encryptedToken,
      isActive, notes, monthlyQuota, now, existing.id,
    );
    if (!(r as any).success) {
      return NextResponse.json({ error: (r as any).error || 'Update failed' }, { status: 500 });
    }
  } else {
    // Insert
    const id = genId();
    const r = await d1Run(
      `INSERT INTO ApiProvider
       (id, name, type, publicKey, secretKey, apiKey, isActive, displayName, notes, monthlyQuota, priority, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 100, ?, ?)`,
      id, name, type, publicKey, encryptedToken, encryptedToken,
      isActive, displayName, notes, monthlyQuota, now, now,
    );
    if (!(r as any).success) {
      return NextResponse.json({ error: (r as any).error || 'Insert failed' }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, type, configured: true });
}

export async function DELETE(req: NextRequest) {
  if (isProduction() && !isValidOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }
  const auth = await requireAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const type = req.nextUrl.searchParams.get('type')?.toLowerCase() as ProviderType;
  if (!type || !TYPE_VALUES.includes(type)) {
    return NextResponse.json(
      { error: `type doit être ${TYPE_VALUES.join(', ')}` },
      { status: 400 },
    );
  }

  const existing = await d1First('SELECT id FROM ApiProvider WHERE type = ? LIMIT 1', type);
  if (!existing) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 });

  const r = await d1Run('DELETE FROM ApiProvider WHERE id = ?', existing.id);
  if (!(r as any).success) {
    return NextResponse.json({ error: (r as any).error || 'Delete failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
