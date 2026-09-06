// @ts-nocheck
export const dynamic = 'force-dynamic';

/**
 * Admin API: external service credentials + usage
 *
 * Stores API keys (Vercel, Neon, APIConvert, iLoveAPI) in the ApiProvider
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
import { checkConvertApiUsage, checkIlovepdfUsage, checkNeonUsage } from '@/lib/external-services';

export const runtime = 'nodejs';

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: 'Non authentifié', status: 401 };
  if (user.role !== 'ADMIN') return { error: 'Accès admin requis', status: 403 };
  return { user };
}

// Map our internal types to the DB column values
const TYPE_VALUES = ['vercel', 'neon', 'apiconvert', 'iloveapi'] as const;
type ProviderType = (typeof TYPE_VALUES)[number];

/**
 * 2026-09-06: Read the stored provider record from D1 directly.
 * The table uses 'type' (not 'provider') as the column name, and stores:
 *  - apiKey: encrypted single-token (vercel, neon, apiconvert)
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
    } else if (type === 'neon') {
      usage = await checkNeonUsage(token);
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
  if (type === 'vercel') {
    return {
      periodStart: '',
      periodEnd: '',
      bandwidth: { used: 0, unit: 'GB' },
      functions: { used: 0, unit: 'hours' },
      builds: { used: 0, unit: 'builds' },
    };
  }
  if (type === 'apiconvert' || type === 'iloveapi') {
    return {
      periodStart: '',
      periodEnd: '',
      quota: { used: 0, total: 0, remaining: 0, percent: 0 },
    };
  }
  // neon
  return {
    periodStart: '',
    periodEnd: '',
    storage: { usedMb: 0 },
    compute: { usedHours: 0 },
    transfer: { usedGb: 0 },
    projects: { active: 0 },
  };
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
