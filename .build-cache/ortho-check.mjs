// Verify AR translations for common orthographic issues
import fs from 'fs';
const ar = JSON.parse(fs.readFileSync('./src/messages/ar.json', 'utf8'));

// Common Arabic typos/issues
const issues = [];

// 1. Check for double spaces
function walk(obj, path = '') {
  for (const [k, v] of Object.entries(obj || {})) {
    const p = path ? path + '.' + k : k;
    if (typeof v === 'string') {
      // Double spaces
      if (/\s{2,}/.test(v)) {
        issues.push({ path: p, type: 'double-space', value: v.substring(0, 80) });
      }
      // Leading/trailing space
      if (v !== v.trim() && v.trim()) {
        issues.push({ path: p, type: 'edge-space', value: v.substring(0, 80) });
      }
      // Mixed LTR/RTL marks
      if (/[\u200f\u200e]/.test(v)) {
        issues.push({ path: p, type: 'mark', value: v.substring(0, 80) });
      }
      // Latin words inside AR (excluding URLs and known acronyms)
      if (/[\u0600-\u06FF].*[a-zA-Z]{3,}.*[\u0600-\u06FF]/.test(v)) {
        // Allow if it's an acronym like "PDF", "PWA", "FAQ", "FR", "AR"
        const allowedAcronyms = /(PDF|PWA|FAQ|FR|AR|SMS|JORT|BAC|JOOR|DSI)/;
        const arPart = v.replace(allowedAcronyms, '');
        if (/[\u0600-\u06FF].*[a-zA-Z]{4,}.*[\u0600-\u06FF]/.test(arPart)) {
          // Real issue
          const match = v.match(/[\u0600-\u06FF].*[a-zA-Z]{4,}.*[\u0600-\u06FF]/);
          if (match) {
            issues.push({ path: p, type: 'latin-in-ar', value: match[0].substring(0, 80) });
          }
        }
      }
    } else if (typeof v === 'object' && !Array.isArray(v)) {
      walk(v, p);
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === 'string') {
          if (/\s{2,}/.test(item)) {
            issues.push({ path: p + '[' + i + ']', type: 'double-space', value: item.substring(0, 80) });
          }
        } else if (typeof item === 'object' && item !== null) {
          walk(item, p + '[' + i + ']');
        }
      });
    }
  }
}
walk(ar);

console.log(`Issues found: ${issues.length}`);
const byType = {};
for (const i of issues) {
  byType[i.type] = (byType[i.type] || 0) + 1;
}
console.log('By type:', byType);
issues.slice(0, 30).forEach(i => {
  console.log(`  [${i.type}] ${i.path}: ${i.value}`);
});
