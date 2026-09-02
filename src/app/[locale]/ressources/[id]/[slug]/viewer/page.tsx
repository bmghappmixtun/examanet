// @ts-nocheck
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { getVisitorIp, isBotOrPlaceholder } from '@/lib/visitor';
import PDFViewer from '@/components/resources/PDFViewer';
import { ChevronLeft, Download } from 'lucide-react';

export const dynamic = 'force-dynamic';

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
  const resource = await prisma.resource.findUnique({ where: { numericId }, select: { id: true, numericId: true, title: true, fileUrl: true, r2Key: true, status: true } });
  if (!resource || resource.status !== 'PUBLISHED') notFound();

  // Increment view (use real IP, skip bots)
  const ip = getVisitorIp();
  const ua = headers().get('user-agent');
  if (!isBotOrPlaceholder(ip, ua)) {
    await prisma.view.create({ data: { resourceId: resource.id, ipAddress: ip, userAgent: ua } });
    await prisma.resource.update({
      where: { id: resource.id },
      data: { viewsCount: { increment: 1 } },
    });
  }

  async function downloadAction() {
    'use server';
    const ip = getVisitorIp();
    const ua = headers().get('user-agent');
    if (isBotOrPlaceholder(ip, ua)) return;
    await prisma.download.create({ data: { resourceId: resource!.id, ipAddress: ip } });
    await prisma.resource.update({
      where: { id: resource!.id },
      data: { downloadsCount: { increment: 1 } },
    });
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
