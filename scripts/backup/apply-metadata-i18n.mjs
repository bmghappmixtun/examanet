#!/usr/bin/env node
/**
 * Apply AR-aware metadata to public pages.
 */
import fs from 'fs';
import path from 'path';

const META_JSON = process.argv[2] || '.build-cache/i18n-metadata.json';
const pages = JSON.parse(fs.readFileSync(META_JSON, 'utf8'));

let okCount = 0,
  failCount = 0;
for (const page of pages) {
  const { filePath, fr, ar, addImport } = page;
  const filepath = path.join(process.cwd(), filePath);
  if (!fs.existsSync(filepath)) {
    console.error(`✗ Missing: ${filePath}`);
    failCount++;
    continue;
  }
  const orig = fs.readFileSync(filepath, 'utf8');

  // Find existing static metadata block (export const metadata = { ... } OR export const metadata: Metadata = { ... })
  let startIdx = -1,
    endIdx = -1,
    depth = 0;
  const lines = orig.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (startIdx === -1 && /^export const metadata(: Metadata)? = \{/.test(lines[i])) {
      startIdx = i;
      depth = 1;
      depth += (lines[i].match(/{/g) || []).length - 1;
      continue;
    }
    if (startIdx !== -1) {
      depth += (lines[i].match(/{/g) || []).length - (lines[i].match(/}/g) || []).length;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }

  if (startIdx === -1 || endIdx === -1) {
    console.error(`✗ No static metadata block in ${filePath}`);
    failCount++;
    continue;
  }

  // Build new generateMetadata block
  const newBlock = buildGenerateMetadata(fr, ar);

  // Replace
  lines.splice(startIdx, endIdx - startIdx + 1, ...newBlock.split('\n'));
  let newContent = lines.join('\n');

  // Add import
  if (addImport && !newContent.includes("getLocale } from '@/lib/i18n-server'")) {
    if (newContent.includes('import { breadcrumbSchema')) {
      newContent = newContent.replace(
        /(import { breadcrumbSchema[^\n]*;)/,
        "import { getLocale } from '@/lib/i18n-server';\n$1",
        1,
      );
    } else if (newContent.includes('import { itemListSchema')) {
      newContent = newContent.replace(
        /(import { itemListSchema[^\n]*;)/,
        "import { getLocale } from '@/lib/i18n-server';\n$1",
        1,
      );
    } else if (newContent.includes('import Link from') || newContent.includes('import Header')) {
      // Add before first layout import
      const m = newContent.match(/^(import .+ from .+\.tsx?;)$/m);
      if (m) {
        newContent = newContent.replace(
          m[1],
          "import { getLocale } from '@/lib/i18n-server';\n" + m[1],
          1,
        );
      }
    } else {
      // Add at the top after the "import type" line
      const lines2 = newContent.split('\n');
      const idx = lines2.findIndex((l) => /^import type/.test(l));
      if (idx >= 0) {
        lines2.splice(idx + 1, 0, "import { getLocale } from '@/lib/i18n-server';");
        newContent = lines2.join('\n');
      }
    }
  }

  if (newContent === orig) {
    console.error(`✗ No change in ${filePath}`);
    failCount++;
  } else {
    fs.writeFileSync(filepath, newContent);
    console.log(`✓ ${filePath}`);
    okCount++;
  }
}

console.log(`\n${okCount} OK, ${failCount} failed`);

function buildGenerateMetadata(fr, ar) {
  const lines = [];
  lines.push('export async function generateMetadata(): Promise<Metadata> {');
  lines.push('  const locale = getLocale();');
  lines.push('  const isAr = locale === "ar";');
  lines.push('  return {');
  for (const key of Object.keys(fr)) {
    if (key === 'openGraph') {
      lines.push('    openGraph: {');
      const ogKeys = Object.keys(fr.openGraph || {});
      for (const ogKey of ogKeys) {
        const frVal = JSON.stringify(fr.openGraph[ogKey]);
        const arVal = JSON.stringify(ar.openGraph?.[ogKey] ?? fr.openGraph[ogKey]);
        lines.push(`      ${ogKey}: isAr ? ${arVal} : ${frVal},`);
      }
      lines.push('    },');
    } else if (key === 'keywords' && Array.isArray(fr.keywords)) {
      const frK = JSON.stringify(fr.keywords);
      const arK = JSON.stringify(ar.keywords || fr.keywords);
      lines.push(`    ${key}: isAr ? ${arK} : ${frK},`);
    } else {
      const frVal = JSON.stringify(fr[key]);
      const arVal = JSON.stringify(ar[key] ?? fr[key]);
      lines.push(`    ${key}: isAr ? ${arVal} : ${frVal},`);
    }
  }
  lines.push('  };');
  lines.push('}');
  return lines.join('\n');
}
