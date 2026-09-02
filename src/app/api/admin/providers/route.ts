// @ts-nocheck
export const dynamic = 'force-dynamic';

/**
 * Admin API: list / create / update / delete conversion providers
 *   GET    /api/admin/providers              — list all + usage stats
 *   POST   /api/admin/providers              — create or update a provider
 *   DELETE /api/admin/providers?provider=X   — remove a provider
 *
 * All routes require ADMIN role.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isValidOrigin, isProduction } from '@/lib/security';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encryptSecret, decryptSecret, redactSecret } from '@/lib/provider-keys';

export const runtime = 'nodejs';

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: 'Non authentifié', status: 401 };
  if (user.role !== 'ADMIN') return { error: 'Accès admin requis', status: 403 };
  return { user };
}

export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const providers = await prisma.apiProvider.findMany({
    orderBy: { provider: 'asc' },
  });

  // Compute usage for the current month for each provider
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const result = await Promise.all(
    providers.map(async (p) => {
      const usageThisMonth = await prisma.apiProviderUsage.aggregate({
        where: { providerId: p.id, year, month },
        _count: { _all: true },
        _sum: { fileSize: true },
      });
      const successCount = await prisma.apiProviderUsage.count({
        where: { providerId: p.id, year, month, success: true },
      });
      const failureCount = await prisma.apiProviderUsage.count({
        where: { providerId: p.id, year, month, success: false },
      });

      // Last 30 days
      const last30Days = await prisma.apiProviderUsage.count({
        where: {
          providerId: p.id,
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      });

      // Last use
      const lastUse = await prisma.apiProviderUsage.findFirst({
        where: { providerId: p.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, success: true, fileName: true },
      });

      const used = usageThisMonth._count._all;
      const remaining = p.monthlyQuota ? Math.max(0, p.monthlyQuota - used) : null;
      const percentUsed = p.monthlyQuota ? Math.round((used / p.monthlyQuota) * 100) : null;

      return {
        id: p.id,
        provider: p.provider,
        displayName: p.displayName,
        publicKey: p.publicKey,
        // Never send the full secret; only show redacted
        secretKeyRedacted: redactSecret(decryptSecret(p.secretKey)),
        hasSecret: !!p.secretKey,
        enabled: p.enabled,
        monthlyQuota: p.monthlyQuota,
        apiUrl: p.apiUrl,
        notes: p.notes,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        // Usage stats (current month)
        usage: {
          month,
          year,
          used,
          success: successCount,
          failed: failureCount,
          totalBytes: usageThisMonth._sum.fileSize || 0,
          last30Days,
          remaining,
          percentUsed,
        },
        lastUse: lastUse
          ? {
              at: lastUse.createdAt,
              success: lastUse.success,
              fileName: lastUse.fileName,
            }
          : null,
      };
    }),
  );

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
  if (!provider || !['iloveapi', 'apiconvert'].includes(provider)) {
    return NextResponse.json(
      { error: 'provider doit être "iloveapi" ou "apiconvert"' },
      { status: 400 },
    );
  }

  if (!body.secretKey || body.secretKey.trim().length < 4) {
    return NextResponse.json({ error: 'secretKey requis (min 4 caractères)' }, { status: 400 });
  }

  const data: any = {
    provider,
    displayName: body.displayName?.trim() || null,
    publicKey: body.publicKey?.trim() || null,
    secretKey: encryptSecret(body.secretKey.trim()),
    enabled: body.enabled !== false,
    monthlyQuota: body.monthlyQuota ?? null,
    apiUrl: body.apiUrl?.trim() || null,
    notes: body.notes?.trim() || null,
  };

  // Upsert: if a provider with this name already exists, update it
  const existing = await prisma.apiProvider.findUnique({ where: { provider } });
  let saved;
  if (existing) {
    saved = await prisma.apiProvider.update({
      where: { id: existing.id },
      data,
    });
  } else {
    saved = await prisma.apiProvider.create({ data });
  }

  return NextResponse.json({
    success: true,
    provider: {
      id: saved.id,
      provider: saved.provider,
      displayName: saved.displayName,
      enabled: saved.enabled,
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

  const existing = await prisma.apiProvider.findUnique({ where: { provider } });
  if (!existing) {
    return NextResponse.json({ error: 'Provider non trouvé' }, { status: 404 });
  }
  await prisma.apiProvider.delete({ where: { id: existing.id } });
  return NextResponse.json({ success: true });
}
