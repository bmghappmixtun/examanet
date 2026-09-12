// @ts-nocheck
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { headers } from 'next/headers';
// Replaced prisma-compat with D1 direct (2026-09-02)
async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.DB;
}
import { getVisitorIp, isBotOrPlaceholder } from '@/lib/visitor';
import PDFViewer from '@/components/resources/PDFViewer';
import { ChevronLeft, Download } from 'lucide-react';

export const dynamic = 'force-dynamic';

// 2026-09-12: /viewer is an iframe PDF viewer — it duplicates the main
// resource page. Mark it noindex to avoid duplicate-content issues in
// Google Search Console (was inheriting index:true from [locale]/layout.tsx).
export const metadata = {
  robots: { index: false, follow: true },
};

export default async function ResourceViewerPage({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}) {
  const { id: rawId, slug: rawSlug } = await params;
  const numericId = parseInt(rawId, 10);
  if (isNaN(numericId)) notFound();
  // Same URL-decode fix as the page (Next.js doesn't auto-decode non-ASCII slugs)
  let slug: string;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    slug = rawSlug;
  }
  const db = await getD1();
  if (!db) notFound();
  const r: any = await db.prepare(
    "SELECT id, numericId, title, fileUrl, fileKey, r2Key, status FROM Resource WHERE numericId = ? LIMIT 1"
  ).bind(numericId).first();
  const resource = r ? { ...r, hasFile: !!(r.fileKey || r.r2Key) } : null;
  if (!resource || resource.status !== 'PUBLISHED') notFound();

  // Increment view (use real IP, skip bots)
  const ip = getVisitorIp();
  const ua = headers().get('user-agent');
  if (!isBotOrPlaceholder(ip, ua)) {
    // Try to insert view (may fail silently if duplicate)
    try {
      await db.prepare(
        "INSERT INTO View (id, resourceId, userId, ipAddress, userAgent, createdAt) VALUES (lower(hex(randomblob(12))), ?, NULL, ?, ?, ?)"
      ).bind(resource.id, ip || null, ua || null, Date.now()).run();
    } catch {}
    try {
      await db.prepare(
        "UPDATE Resource SET viewsCount = viewsCount + 1 WHERE id = ?"
      ).bind(resource.id).run();
    } catch {}
  }

  async function downloadAction() {
    'use server';
    const ip = getVisitorIp();
    const ua = headers().get('user-agent');
    if (isBotOrPlaceholder(ip, ua)) return;
    const db2 = await getD1();
    if (!db2) return;
    try {
      await db2.prepare(
        "INSERT INTO Download (id, resourceId, userId, ipAddress, userAgent, original, createdAt) VALUES (lower(hex(randomblob(12))), ?, NULL, ?, ?, 1, ?)"
      ).bind(resource!.id, ip || null, ua || null, Date.now()).run();
    } catch {}
    try {
      await db2.prepare(
        "UPDATE Resource SET downloadsCount = downloadsCount + 1 WHERE id = ?"
      ).bind(resource!.id).run();
    } catch {}
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <div className="pt-16 lg:pt-20 px-4 py-3 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={`/ressources/${numericId}/${slug}`}
              className="p-2 hover:bg-slate-100 rounded-lg"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div className="min-w-0">
              <h1 className="font-bold truncate">{resource.title}</h1>
              <p className="text-xs text-slate-500">Mode lecture</p>
            </div>
          </div>
          <a href={`/api/resources/${resource.numericId}/download`} className="btn-primary text-sm">
            <Download className="w-4 h-4" /> Télécharger
          </a>
        </div>
      </div>
      <div className="flex-1 p-4">
        <div className="max-w-7xl mx-auto">
          <PDFViewer
            url={`/api/resources/${resource.numericId}/download`}
            fileName={`${resource.title}.pdf`}
          />
          <div className="mt-3 text-center text-xs text-slate-500">
            💡 Astuces : ← → pour naviguer, +/- pour zoomer, Échap pour quitter le plein écran
          </div>
        </div>
      </div>
    </div>
  );
}
