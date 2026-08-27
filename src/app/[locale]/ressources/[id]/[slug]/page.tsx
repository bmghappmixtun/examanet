// @ts-nocheck
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

async function getData(numericId: number, origin: string) {
  try {
    const res = await fetch(`${origin}/api/ressources/${numericId}/detail`, {
      cache: 'no-store',
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    // ignore
  }
  return null;
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}) {
  const { id } = await params;
  const numericId = parseInt(id, 10);
  if (isNaN(numericId)) {
    return <div>Bad ID</div>;
  }
  const hdrs = await headers();
  const host = hdrs.get('host') || 'examanet-prod.examanet-poc.workers.dev';
  const protocol = hdrs.get('x-forwarded-proto') || 'https';
  const origin = `${protocol}://${host}`;
  
  const data = await getData(numericId, origin);
  if (!data) {
    return <div>Not found</div>;
  }
  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl font-bold">{data.resource.title}</h1>
      <p>By: {data.resource.teacher?.firstName} {data.resource.teacher?.lastName}</p>
    </div>
  );
}
