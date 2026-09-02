#!/usr/bin/env node
/**
 * Batch-fix canonical URLs across [locale] pages.
 * 
 * For each page that has a PAGE_URL const = ${SITE_URL}/path,
 * update it to be locale-aware (add /fr or /ar prefix).
 */
import fs from 'fs';
import path from 'path';

const PAGE_DIR = 'src/app/[locale]';

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(p));
    } else if (entry.name === 'page.tsx') {
      out.push(p);
    }
  }
  return out;
}

const files = walk(PAGE_DIR);
console.log(`Found ${files.length} page.tsx files`);

let updated = 0;
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  const orig = content;
  
  // Check if this file has a canonical: PAGE_URL or similar
  // We won't auto-update, just identify which files need manual review
  const hasPageUrl = /const PAGE_URL = `\$\{SITE_URL\}\/[^`]+`/.test(content);
  const hasWrongCanonical = /canonical: ['"`](\/[^'"`]+)['"`]/.test(content);
  
  if (hasPageUrl) {
    console.log(`  ${file}: has PAGE_URL`);
  } else if (hasWrongCanonical) {
    const m = content.match(/canonical: ['"`](\/[^'"`]+)['"`]/);
    if (m) {
      console.log(`  ${file}: wrong canonical: '${m[1]}'`);
    }
  }
}
