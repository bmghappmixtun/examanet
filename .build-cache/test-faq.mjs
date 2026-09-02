import fs from 'fs';

const filepath = 'src/app/faq/page.tsx';
let content = fs.readFileSync(filepath, 'utf8');
console.log('content has getLocale:', content.includes('getLocale'));

let startIdx = -1, endIdx = -1, depth = 0;
let lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
    if (startIdx === -1 && /^export const metadata(: Metadata)? = \{/.test(lines[i])) {
        startIdx = i;
        depth = 1;
        depth += (lines[i].match(/{/g) || []).length - 1;
        continue;
    }
    if (startIdx !== -1) {
        depth += (lines[i].match(/{/g) || []).length - (lines[i].match(/}/g) || []).length;
        if (depth === 0) { endIdx = i; break; }
    }
}
console.log('startIdx:', startIdx, 'endIdx:', endIdx);

const newBlock = `export async function generateMetadata(): Promise<Metadata> {
  // dummy
}`;
lines.splice(startIdx, endIdx - startIdx + 1, ...newBlock.split('\n'));
console.log('After splice, lines.length:', lines.length);

// Now build content = lines.join('\n')
let newContent = lines.join('\n');
console.log('newContent has generateMetadata:', newContent.includes('generateMetadata'));

if (newContent.includes('import { breadcrumbSchema')) {
    newContent = newContent.replace(
        'import { breadcrumbSchema',
        "import { getLocale } from '@/lib/i18n-server';\nimport { breadcrumbSchema",
        1
    );
    console.log('Branch 1: applied');
}

fs.writeFileSync(filepath, newContent);
console.log('Written');
