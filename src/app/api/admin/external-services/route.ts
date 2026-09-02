// @ts-nocheck
export const dynamic = 'force-dynamic';

/**
 * Admin API: external service credentials + usage
 *
 * Vercel + Neon API tokens are stored encrypted in the ApiProvider table
 * (provider = 'vercel' | 'neon'), and we use them to fetch live usage.
 *
 *   GET  /api/admin/external-services?type=vercel  — get Vercel usage
 *   GET  /api/admin/external-services?type=neon    — get Neon usage
 *   POST /api/admin/external-services              — save a token
 *   DELETE /api/admin/external-services?type=X     — remove a token
 */

import { NextRequest, NextResponse } from 'next/server';
import { isValidOrigin, isProduction } from '@/lib/security';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encryptSecret, decryptSecret, redactSecret } from '@/lib/provider-keys';
import { checkVercelUsage } from '@/lib/external-services.vercel';
import { checkConvertApiUsage, checkIlovepdfUsage, checkNeonUsage } from '@/lib/external-services';

export const runtime = 'nodejs';

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: 'Non authentifié', status: 401 };
  if (user.role !== 'ADMIN') return { error: 'Accès admin requis', status: 403 };
  return { user };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const type = req.nextUrl.searchParams.get('type')?.toLowerCase();
  if (!type || !['vercel', 'neon', 'apiconvert', 'iloveapi'].includes(type)) {
    return NextResponse.json(
      { error: 'type doit être "vercel", "neon", "apiconvert" ou "iloveapi"' },
      { status: 400 },
    );
  }

  const provider = await prisma.apiProvider.findUnique({ where: { provider: type } });
  if (!provider || !provider.secretKey) {
    return NextResponse.json({
      configured: false,
      usage:
        type === 'vercel'
          ? {
              periodStart: '',
              periodEnd: '',
              bandwidth: { used: 0, unit: 'GB' },
              functions: { used: 0, unit: 'hours' },
              builds: { used: 0, unit: 'builds' },
            }
          : {
              periodStart: '',
              periodEnd: '',
              storage: { usedMb: 0 },
              compute: { usedHours: 0 },
              transfer: { usedGb: 0 },
              projects: { active: 0 },
            },
      tokenRedacted: '',
    });
  }

  const token = decryptSecret(provider.secretKey);
  if (!token) {
    return NextResponse.json({ configured: true, tokenInvalid: true });
  }

  let usage: any;
  if (type === 'vercel') {
    usage = await checkVercelUsage(token);
  } else if (type === 'apiconvert') {
    usage = await checkConvertApiUsage(token);
  } else if (type === 'iloveapi') {
    usage = await checkIlovepdfUsage(provider.publicKey || '', token);
    // iLoveAPI doesn't return total quota in the response.
    // Use the configured monthlyQuota from DB if set.
    if (usage.quota && provider.monthlyQuota) {
      const remaining = usage.quota.remaining;
      const total = provider.monthlyQuota;
      const used = Math.max(0, total - remaining);
      usage.quota.total = total;
      usage.quota.used = used;
      usage.quota.percent = total > 0 ? Math.round((used / total) * 100) : 0;
    }
  } else {
    usage = await checkNeonUsage(token, provider.publicKey || undefined);
  }

  return NextResponse.json({
    configured: true,
    enabled: provider.enabled,
    displayName: provider.displayName,
    publicKey: provider.publicKey,
    tokenRedacted: redactSecret(token),
    monthlyQuota: provider.monthlyQuota,
    notes: provider.notes,
    updatedAt: provider.updatedAt,
    usage,
  });
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
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });
  }

  const type = (body.type || '').toLowerCase();
  if (!['vercel', 'neon', 'apiconvert', 'iloveapi'].includes(type)) {
    return NextResponse.json(
      { error: 'type doit être "vercel", "neon", "apiconvert" ou "iloveapi"' },
      { status: 400 },
    );
  }

  if (!body.token || body.token.trim().length < 8) {
    return NextResponse.json({ error: 'token requis (min 8 caractères)' }, { status: 400 });
  }

  const data: any = {
    provider: type,
    displayName: body.displayName?.trim() || null,
    publicKey: body.publicKey?.trim() || null,
    secretKey: encryptSecret(body.token.trim()),
    enabled: body.enabled !== false,
    notes: body.notes?.trim() || null,
  };

  const existing = await prisma.apiProvider.findUnique({ where: { provider: type } });
  let saved;
  if (existing) {
    saved = await prisma.apiProvider.update({ where: { id: existing.id }, data });
  } else {
    saved = await prisma.apiProvider.create({ data });
  }

  return NextResponse.json({ success: true, provider: saved.provider });
}

export async function DELETE(req: NextRequest) {
  if (isProduction() && !isValidOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }
  const auth = await requireAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const type = req.nextUrl.searchParams.get('type')?.toLowerCase();
  if (!type || !['vercel', 'neon', 'apiconvert', 'iloveapi'].includes(type)) {
    return NextResponse.json(
      { error: 'type doit être "vercel", "neon", "apiconvert" ou "iloveapi"' },
      { status: 400 },
    );
  }

  const existing = await prisma.apiProvider.findUnique({ where: { provider: type } });
  if (!existing) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 });
  await prisma.apiProvider.delete({ where: { id: existing.id } });
  return NextResponse.json({ success: true });
}
