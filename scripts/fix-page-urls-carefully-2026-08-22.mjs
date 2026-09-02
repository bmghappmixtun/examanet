#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const files = [
  'src/app/[locale]/bac/archives/page.tsx',
  'src/app/[locale]/concours-9eme-tunisie/page.tsx',
  'src/app/[locale]/concours-9eme-tunisie/sujets-passes/page.tsx',
  'src/app/[locale]/outils/moyenne-bac/page.tsx',
  'src/app/[locale]/programme-officiel/page.tsx',
];

for (const file of files) {
  const full = path.join(process.cwd(), file);
  if (!fs.existsSync(full)) {
    console.log(`SKIP: ${file}`);
    continue;
  }
  let content = fs.readFileSync(full, 'utf8');
  const orig = content;
  
  // Find PAGE_URL = `${SITE_URL}/path` pattern
  const m = content.match(/const PAGE_URL = `\$\{SITE_URL\}(\/[^`]+)`;/);
  if (!m) {
    console.log(`NO MATCH: ${file}`);
    continue;
  }
  const pagePath = m[1];
  
  // Replace the const declaration to use localeUrl
  // For module-level: define both FR and AR
  content = content.replace(
    /const PAGE_URL = `\$\{SITE_URL\}(\/[^`]+)`;/,
    `const PAGE_PATH = '${pagePath}';
const PAGE_URL_FR = \`\${SITE_URL}/fr\${PAGE_PATH}\`;
const PAGE_URL_AR = \`\${SITE_URL}/ar\${PAGE_PATH}\`;`
  );
  
  // Replace canonical: PAGE_URL → isAr ? PAGE_URL_AR : PAGE_URL_FR (in metadata context)
  // We need to add isAr logic. For now just replace all PAGE_URL uses
  // but it's tricky because they may be in different contexts
  // 
  // Strategy: for canonical: PAGE_URL, replace with canonical: isAr ? PAGE_URL_AR : PAGE_URL_FR
  // (only in metadata function)
  content = content.replace(
    /canonical: PAGE_URL,/g,
    'canonical: isAr ? PAGE_URL_AR : PAGE_URL_FR,'
  );
  
  // For languages, replace fr: PAGE_URL, ar: PAGE_URL with the proper fr-TN/ar-TN
  content = content.replace(
    /fr: PAGE_URL,\s*\n\s*ar: PAGE_URL,?\s*\n\s*'x-default': PAGE_URL,/g,
    `'fr-TN': PAGE_URL_FR,\n        'ar-TN': PAGE_URL_AR,\n        'x-default': PAGE_URL_FR,`
  );
  content = content.replace(
    /'fr-TN': PAGE_URL,\s*\n\s*'ar-TN': PAGE_URL,?\s*\n\s*'x-default': PAGE_URL,/g,
    `'fr-TN': PAGE_URL_FR,\n        'ar-TN': PAGE_URL_AR,\n        'x-default': PAGE_URL_FR,`
  );
  
  // For og:url: PAGE_URL → og:url: isAr ? PAGE_URL_AR : PAGE_URL_FR
  content = content.replace(
    /url: PAGE_URL,/g,
    'url: isAr ? PAGE_URL_AR : PAGE_URL_FR,'
  );
  
  // For breadcrumbSchema usage: convert breadcrumb to pass locale
  // This is harder to automate. Leave for manual.
  
  if (content !== orig) {
    fs.writeFileSync(full, content, 'utf8');
    console.log(`UPDATED: ${file}`);
  } else {
    console.log(`NO CHANGES: ${file}`);
  }
}
