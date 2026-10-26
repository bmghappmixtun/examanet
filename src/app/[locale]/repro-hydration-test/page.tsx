// @ts-nocheck
/**
 * BAN DE TEST TEMPORAIRE (2026-10-26) — à supprimer après validation.
 *
 * Reproduit le mismatch d'hydratation de /admin/invitations en rendant le
 * VRAI composant InvitationsClient avec des données mockées dont l'expiration
 * est calibrée pour que le flag `isExpiringSoon` bascule entre le rendu
 * serveur et l'hydratation client :
 *
 *   expiresAt = maintenant + 2 jours + 400 ms
 *   → au rendu serveur : (expiresAt - now) = 2j + 400ms  → PAS "expire bientôt"
 *   → à l'hydratation   : (expiresAt - now) = 2j - Xms     → "expire bientôt"  (X > 400ms)
 *
 * "?renderedAt" permet de tester les 2 variantes :
 *   /repro-hydration-test            → sans renderedAt (ancien comportement)
 *   /repro-hydration-test?fixed=1    → avec renderedAt (nouveau comportement)
 */
import { notFound } from 'next/navigation';
import InvitationsClient from '@/components/admin/InvitationsClient';

export const dynamic = 'force-dynamic';

const TWO_DAYS = 2 * 24 * 3600 * 1000;

function buildInvitations() {
  const now = Date.now();
  return [
    {
      id: 'repro-1',
      token: 'tok-repro-1',
      email: 'repro1@example.com',
      status: 'SENT',
      createdAt: new Date(now - 3600_000).toISOString(),
      emailSentAt: new Date(now - 3600_000).toISOString(),
      linkClickedAt: null,
      activatedAt: null,
      cancelledAt: null,
      // Bascule kalébrée : 2 jours + 400 ms
      expiresAt: new Date(now + TWO_DAYS + 400).toISOString(),
      clickCount: 1,
      clickIpAddress: null,
      activateIpAddress: null,
      customMessage: null,
      resendMessageId: null,
      deliveryStatus: 'delivered',
      deliverySyncedAt: null,
      deliveryDetail: null,
      openedAt: null,
      openCount: 0,
      teacher: {
        id: 't-repro-1',
        firstName: 'Prof',
        lastName: 'Repro',
        email: 'repro1@example.com',
        _count: { uploadedFiles: 3 },
      },
      invitedBy: {
        id: 'admin-1',
        firstName: 'Admin',
        lastName: 'Test',
        email: 'admin@example.com',
      },
    },
  ];
}

export default async function ReproHydrationTestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Ce banc de test n'a PAS sa place en production.
  if (process.env.NODE_ENV === 'production') notFound();

  const sp = await searchParams;
  const fixed = sp?.fixed === '1';
  const now = Date.now();

  return (
    <InvitationsClient
      initialInvitations={buildInvitations()}
      initialStats={{
        PENDING: 0,
        SENT: 1,
        CLICKED: 0,
        ACTIVATED: 0,
        EXPIRED: 0,
        CANCELLED: 0,
      }}
      totalClickEvents={0}
      {...(fixed ? { renderedAt: now } : {})}
    />
  );
}
