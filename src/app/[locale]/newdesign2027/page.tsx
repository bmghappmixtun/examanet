// @ts-nocheck
// 2026-09-12: NEW DESIGN 2027 — Sample/demo page for resource detail redesign.
// Server component only passes the numericId; client component fetches data via API.
// This avoids the getCloudflareContext() race condition that affects SSR pages.

import NewDesign2027Client from './NewDesign2027Client';

export const dynamic = 'force-dynamic';

export default async function NewDesign2027Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const sp = await searchParams;
  const numericId = parseInt(sp.id || '2369', 10);
  return <NewDesign2027Client numericId={numericId} />;
}
