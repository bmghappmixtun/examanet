// 2026-09-17: Resources sub-sitemap chunk 3 — remaining ~5,400 (least popular).
// Refresh weekly (low priority, indexed less often).
import { buildResourcesSitemap } from '@/lib/build-resources-sitemap';

export const revalidate = 604800; // Refresh weekly

export async function GET() {
  const xml = await buildResourcesSitemap(3);
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=604800, must-revalidate',
    },
  });
}
