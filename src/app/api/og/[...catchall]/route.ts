// 2026-09-07: Serve static OG image (was disabled in POC).
// Dynamic per-page OG generation with @vercel/og requires a TTF font
// that bloats the bundle by ~1.5MB. For now we use a single static
// image at /og-image.png (1200x630) and add the page title via the
// OG meta tag. When bundle bloat becomes a concern, switch to
// @vercel/og with a subset font.
//
// CF Workers cannot read the local filesystem at runtime, so we
// redirect to the static asset served via the ASSETS binding.
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const STATIC_OG_URL = '/og-image.png';

export async function GET() {
  // 308 permanent redirect to the static asset.
  // SEO (2026-09-17): add X-Robots-Tag: noindex on the redirect itself
  // to prevent Google from indexing /api/og/resource/xxx URLs that
  // were leaking into the search index. 165 such URLs were indexed
  // per GSC coverage drilldown.
  return NextResponse.redirect(new URL(STATIC_OG_URL, 'https://examanet.com'), {
    status: 308,
    headers: {
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
