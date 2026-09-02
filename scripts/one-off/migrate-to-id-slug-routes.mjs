/**
 * migrate-to-id-slug-routes.mjs
 *
 * One-shot script to transform the new route handlers from
 * [slug] to [id]/[slug] format.
 *
 * For /ressources/[id]/[slug]/page.tsx and viewer/page.tsx:
 *  - params: { id, slug } instead of { slug }
 *  - Lookup by numericId (parse from id)
 *  - The slug in URL is just for SEO (not used in lookup)
 *  - canonical URL: /ressources/{numericId}/{slug}
 *  - OG image URL: /api/og/resource/{numericId}
 *
 * For /ressources/[slug]/page.tsx (the OLD route, kept for compatibility):
 *  - Receives a slug
 *  - Looks up ResourceSlugRedirect to find the new URL
 *  - 301 redirect to the new URL
 */

import fs from 'fs';

const newPagePath = 'src/app/ressources/[id]/[slug]/page.tsx';
const newViewerPath = 'src/app/ressources/[id]/[slug]/viewer/page.tsx';
const oldPagePath = 'src/app/ressources/[slug]/page.tsx';

let newPage = fs.readFileSync(newPagePath, 'utf8');
let newViewer = fs.readFileSync(newViewerPath, 'utf8');

// ============================================================================
// Update new page.tsx — change to use [id, slug] params
// ============================================================================

// 1. generateMetadata signature
newPage = newPage.replace(
  `export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {`,
  `export async function generateMetadata({ params }: { params: Promise<{ id: string; slug: string }> }) {`
);

// 2. generateMetadata body — extract id, look up by numericId
newPage = newPage.replace(
  `  const rawSlug = (await params).slug;
  // Same URL-decode fix as the page (Next.js doesn't auto-decode non-ASCII slugs)
  let slug: string;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    slug = rawSlug;
  }
  const resource = await prisma.resource.findUnique({
    where: { slug },
    include: { subject: true, class: true, teacher: true },
  });`,
  `  const { id: rawId, slug: rawSlug } = await params;
  // The numericId is the stable identifier; the slug is purely cosmetic / SEO
  const numericId = parseInt(rawId, 10);
  if (isNaN(numericId)) {
    return { title: 'Ressource non trouvée' };
  }
  // Same URL-decode fix as the page (Next.js doesn't auto-decode non-ASCII slugs)
  let slug: string;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    slug = rawSlug;
  }
  const resource = await prisma.resource.findUnique({
    where: { numericId },
    include: { subject: true, class: true, teacher: true },
  });`
);

// 3. Page component signature
newPage = newPage.replace(
  `export default async function ResourcePage({ params }: { params: Promise<{ slug: string }> }) {`,
  `export default async function ResourcePage({ params }: { params: Promise<{ id: string; slug: string }> }) {`
);

// 4. Page component body — extract id, look up by numericId
newPage = newPage.replace(
  `  const rawSlug = (await params).slug;
  // SECURITY/UX: Next.js does NOT auto-decode non-ASCII chars in [slug] params
  // (e.g. Arabic slugs arrive as '%D9%81...' percent-encoded). Decode manually
  // so Prisma can find the resource by its real slug.
  let slug: string;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    slug = rawSlug;
  }
  const userSession = await getCurrentUser();
  const resource = await prisma.resource.findUnique({
    where: { slug },`,
  `  const { id: rawId, slug: rawSlug } = await params;
  // SECURITY/UX: Next.js does NOT auto-decode non-ASCII chars in [slug] params
  // (e.g. Arabic slugs arrive as '%D9%81...' percent-encoded). Decode manually
  // so Prisma can find the resource by its real slug.
  // The numericId is the stable identifier; the slug is purely cosmetic / SEO.
  const numericId = parseInt(rawId, 10);
  if (isNaN(numericId)) notFound();
  let slug: string;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    slug = rawSlug;
  }
  const userSession = await getCurrentUser();
  const resource = await prisma.resource.findUnique({
    where: { numericId },`
);

// 5. Update canonical URL to include numericId
newPage = newPage.replace(
  `    alternates: {
      canonical: \`\${baseUrl}/ressources/\${resource.slug}\`,
    },`,
  `    alternates: {
      canonical: \`\${baseUrl}/ressources/\${resource.numericId}/\${resource.slug}\`,
    },`
);

// 6. Update OG image URL to use numericId
newPage = newPage.replace(
  `      url: \`\${baseUrl}/ressources/\${resource.slug}\`,`,
  `      url: \`\${baseUrl}/ressources/\${resource.numericId}/\${resource.slug}\`,`
);
newPage = newPage.replace(
  `      images: [\n        {\n          url: \`\${baseUrl}/api/og/resource/\${resource.slug}\`,`,
  `      images: [\n        {\n          url: \`\${baseUrl}/api/og/resource/\${resource.numericId}\`,`
);
newPage = newPage.replace(
  `images: [\`\${baseUrl}/api/og/resource/\${resource.slug}\`],`,
  `images: [\`\${baseUrl}/api/og/resource/\${resource.numericId}\`],`
);

// 7. Update resourceUrl (for JSON-LD) to use numericId
newPage = newPage.replace(
  `const resourceUrl = \`\${baseUrl}/ressources/\${resource.slug}\`;`,
  `const resourceUrl = \`\${baseUrl}/ressources/\${resource.numericId}/\${resource.slug}\`;`
);

fs.writeFileSync(newPagePath, newPage);
console.log(`✅ Updated ${newPagePath}`);

// ============================================================================
// Update new viewer/page.tsx — same pattern
// ============================================================================

let newViewerContent = newViewer;
newViewerContent = newViewerContent.replace(
  `export default async function ResourceViewerPage({ params }: { params: Promise<{ slug: string }> }) {`,
  `export default async function ResourceViewerPage({ params }: { params: Promise<{ id: string; slug: string }> }) {`
);
newViewerContent = newViewerContent.replace(
  `  const rawSlug = (await params).slug;
  // Same URL-decode fix as the page (Next.js doesn't auto-decode non-ASCII slugs)
  let slug: string;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    slug = rawSlug;
  }
  const resource = await prisma.resource.findUnique({ where: { slug } });`,
  `  const { id: rawId, slug: rawSlug } = await params;
  const numericId = parseInt(rawId, 10);
  if (isNaN(numericId)) notFound();
  // Same URL-decode fix as the page (Next.js doesn't auto-decode non-ASCII slugs)
  let slug: string;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    slug = rawSlug;
  }
  const resource = await prisma.resource.findUnique({ where: { numericId } });`
);
// Back button uses slug — keep the new URL pattern
newViewerContent = newViewerContent.replace(
  `<Link href={\`/ressources/\${slug}\`} className="p-2 hover:bg-slate-100 rounded-lg">`,
  `<Link href={\`/ressources/\${numericId}/\${slug}\`} className="p-2 hover:bg-slate-100 rounded-lg">`
);

fs.writeFileSync(newViewerPath, newViewerContent);
console.log(`✅ Updated ${newViewerPath}`);

// ============================================================================
// Replace the OLD [slug]/page.tsx with a redirect handler
// ============================================================================

const redirectHandler = `import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { permanentRedirect } from 'next/navigation';

/**
 * Legacy /ressources/[slug] route handler.
 *
 * After migration to the Etsy-style URL pattern (/ressources/{id}/{slug}),
 * the old slug-only URL must redirect to the new format. We use the
 * ResourceSlugRedirect table to find the new URL.
 *
 * This handler:
 *  1. Decodes the slug (Next.js doesn't auto-decode non-ASCII)
 *  2. Looks up ResourceSlugRedirect.oldSlug
 *  3. 301 redirects to the stored new URL
 *  4. If no redirect found, returns 404
 *
 * The numericId in the new URL is stable forever; the slug is purely cosmetic.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return { title: 'Redirection...' };
}

export default async function LegacyResourceRedirectPage({ params }: { params: Promise<{ slug: string }> }) {
  const rawSlug = (await params).slug;
  let slug: string;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    slug = rawSlug;
  }

  // Look up the redirect
  const redirect = await prisma.resourceSlugRedirect.findUnique({
    where: { oldSlug: slug },
  });

  if (!redirect) {
    // No redirect found — could be a brand-new resource uploaded with the new format,
    // or an invalid URL. Try direct slug lookup as a fallback.
    const direct = await prisma.resource.findUnique({ where: { slug } });
    if (direct && direct.numericId) {
      permanentRedirect(\`/ressources/\${direct.numericId}/\${direct.slug}\`);
    }
    notFound();
  }

  // The newSlug field stores the full new URL (e.g. "/ressources/1234/clean-slug")
  permanentRedirect(redirect.newSlug);
}
`;

fs.writeFileSync(oldPagePath, redirectHandler);
console.log(`✅ Replaced ${oldPagePath} with redirect handler`);

console.log('\n✅ All route files updated. Next: update internal links + sitemap.');
