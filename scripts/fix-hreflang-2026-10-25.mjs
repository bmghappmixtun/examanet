#!/usr/bin/env node
/**
 * SEO 2026-10-25 — ajoute les hreflang (fr-TN / ar-TN / x-default) aux pages
 * [locale] qui n'en déclaraient pas, via le helper partagé.
 *
 * Contexte : Next.js rend les `alternates` du layout RACINE *et* ceux de la
 * page feuille comme deux jeux de <link rel="alternate"> distincts. Le layout
 * racine pointait vers l'ACCUEIL, donc chaque page localisée annonçait
 * « la version française de cette page = https://examanet.com ».
 * Le layout racine n'émet plus de `languages` (cf. src/app/layout.tsx) ;
 * chaque page doit donc déclarer les siens.
 *
 * Les routes FR et AR sont parfaitement symétriques (/fr/X <-> /ar/X, même
 * slug : les ressources/classes/matières sont des lignes D1 partagées), donc
 * la variante AR est le même chemin avec le segment de locale inversé.
 *
 * Dry-run par défaut. `--apply` pour écrire.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const APPLY = process.argv.includes('--apply');
const ROOT = resolve(process.cwd());

/** chemin relatif -> { from, to } | { from, to, importAs } */
const EDITS = [
  {
    file: 'src/app/[locale]/a-propos/page.tsx',
    from: "    alternates: isAr ? { canonical: '/ar/a-propos' } : { canonical: '/fr/a-propos' },",
    to: "    alternates: localeAlternates('/a-propos'),",
  },
  {
    file: 'src/app/[locale]/cgu/page.tsx',
    from: "    alternates: isAr ? { canonical: '/ar/cgu' } : { canonical: '/fr/cgu' },",
    to: "    alternates: localeAlternates('/cgu'),",
  },
  {
    file: 'src/app/[locale]/college/page.tsx',
    from: "    alternates: isAr ? { canonical: '/ar/college' } : { canonical: '/fr/college' },",
    to: "    alternates: localeAlternates('/college'),",
  },
  {
    file: 'src/app/[locale]/contact/page.tsx',
    from: "    alternates: isAr ? { canonical: '/ar/contact' } : { canonical: '/fr/contact' },",
    to: "    alternates: localeAlternates('/contact'),",
  },
  {
    file: 'src/app/[locale]/cours/[slug]/page.tsx',
    from: "    alternates: { canonical: `${baseUrl}/${locale}/cours/${slug}` },",
    to: "    alternates: localeAlternates(`/cours/${slug}`),",
  },
  {
    file: 'src/app/[locale]/devoirs/[slug]/page.tsx',
    from: "    alternates: { canonical: `${baseUrl}/${locale}/devoirs/${slug}` },",
    to: "    alternates: localeAlternates(`/devoirs/${slug}`),",
  },
  {
    file: 'src/app/[locale]/faq/page.tsx',
    from: "    alternates: isAr ? { canonical: '/ar/faq' } : { canonical: '/fr/faq' },",
    to: "    alternates: localeAlternates('/faq'),",
  },
  {
    file: 'src/app/[locale]/matieres/page.tsx',
    from: "    alternates: isAr ? { canonical: '/ar/matieres' } : { canonical: '/fr/matieres' },",
    to: "    alternates: localeAlternates('/matieres'),",
  },
  {
    file: 'src/app/[locale]/niveaux/[level]/page.tsx',
    from: `      alternates: {
        canonical: \`\${baseUrl}\${locale === 'ar' ? '/ar' : '/fr'}/niveaux/\${levelSlug}\`,
      },`,
    to: `      alternates: localeAlternates(\`/niveaux/\${levelSlug}\`),`,
  },
  {
    file: 'src/app/[locale]/niveaux/[level]/page.tsx',
    from: `    alternates: {
      canonical: \`\${baseUrl}\${locale === 'ar' ? '/ar' : '/fr'}/niveaux/\${level.slug}\`,
    },`,
    to: `    alternates: localeAlternates(\`/niveaux/\${level.slug}\`),`,
  },
  {
    file: 'src/app/[locale]/niveaux/page.tsx',
    from: "    alternates: { canonical: isAr ? '/ar/niveaux' : '/fr/niveaux' },",
    to: "    alternates: localeAlternates('/niveaux'),",
  },
  {
    file: 'src/app/[locale]/outils/moyenne-bac/page.tsx',
    from: "    alternates: { canonical: isAr ? PAGE_URL_AR : PAGE_URL_FR },",
    to: "    alternates: localeAlternates('/outils/moyenne-bac'),",
  },
  {
    file: 'src/app/[locale]/politique-confidentialite/page.tsx',
    from: `    alternates: isAr
      ? { canonical: '/ar/politique-confidentialite' }
      : { canonical: '/fr/politique-confidentialite' },`,
    to: "    alternates: localeAlternates('/politique-confidentialite'),",
  },
  {
    file: 'src/app/[locale]/professeurs/[numericId]/[slug]/page.tsx',
    from: `    alternates: {
      canonical: \`\${SITE_URL}\${localePrefix}/professeurs/\${numericId}\`,
    },`,
    to: "    alternates: localeAlternates(`/professeurs/${numericId}`),",
  },
  {
    file: 'src/app/[locale]/recherche/page.tsx',
    from: "    alternates: { canonical: isAr ? '/ar/recherche' : '/fr/recherche' },",
    to: "    alternates: localeAlternates('/recherche'),",
  },
  {
    file: 'src/app/[locale]/ressources/[id]/[slug]/page.tsx',
    from: `      alternates: { canonical: canonicalUrl },`,
    to: `      alternates: localeAlternatesWithCanonical('/ressources', canonicalUrl),`,
  },
  {
    // Ancré sur le openGraph qui suit : sinon le motif à 4 espaces matche
    // aussi l'occurrence à 6 espaces (le fallback) par sous-chaîne.
    file: 'src/app/[locale]/ressources/[id]/[slug]/page.tsx',
    from: `    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,`,
    to: `    alternates: localeAlternatesWithCanonical(\`/ressources/\${numericId}/\${decodedSlug}\`, canonicalUrl),
    openGraph: {
      title,`,
  },
  {
    file: 'src/app/[locale]/series/[slug]/page.tsx',
    from: "    alternates: { canonical: `${baseUrl}/${locale}/series/${slug}` },",
    to: "    alternates: localeAlternates(`/series/${slug}`),",
  },
  {
    file: 'src/app/[locale]/page.tsx',
    from: `  alternates: {
    canonical: '/fr',
  },`,
    to: "  alternates: localeAlternates('/'),",
  },
];

/** Insère l'import après la DERNIÈRE instruction import du fichier. */
function insertImport(src, statement) {
  if (src.includes(statement)) return src;
  const lines = src.split('\n');
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^import\b/.test(lines[i])) { start = i; break; }
  }
  if (start === -1) throw new Error('aucun import trouvé');
  let end = start;
  while (end < lines.length && !lines[end].includes(';')) end++;
  lines.splice(end + 1, 0, statement);
  return lines.join('\n');
}

let applied = 0;
let failed = 0;

for (const edit of EDITS) {
  const abs = resolve(ROOT, edit.file);
  let src = readFileSync(abs, 'utf8');
  const occurrences = src.split(edit.from).length - 1;
  if (occurrences !== 1) {
    console.error(`❌ ${edit.file} — pattern trouvé ${occurrences}x (attendu 1)`);
    failed++;
    continue;
  }
  src = src.replace(edit.from, edit.to);
  src = insertImport(src, edit.to.includes('localeAlternatesWithCanonical')
    ? "import { localeAlternatesWithCanonical } from '@/lib/seo-alternates';"
    : "import { localeAlternates } from '@/lib/seo-alternates';");
  // Si les deux helpers sont nécessaires dans le même fichier, on complète.
  if (src.includes('localeAlternates(') && !src.includes("import { localeAlternates }") && !src.includes('import { localeAlternates,')) {
    src = insertImport(src, "import { localeAlternates } from '@/lib/seo-alternates';");
  }
  if (src.includes('localeAlternatesWithCanonical(') && !src.includes("import { localeAlternatesWithCanonical }")) {
    src = insertImport(src, "import { localeAlternatesWithCanonical } from '@/lib/seo-alternates';");
  }
  if (APPLY) writeFileSync(abs, src, 'utf8');
  applied++;
  console.log(`✅ ${edit.file}`);
}

console.log(`\n${applied} édition(s) ${APPLY ? 'appliquée(s)' : 'simulée(s)'}, ${failed} échec(s).`);
if (failed) process.exit(1);
