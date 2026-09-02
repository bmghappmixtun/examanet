import fs from 'fs';
import { execSync } from 'child_process';

const files = execSync(`grep -rln "numericId: true" src/ 2>/dev/null`, { encoding: 'utf8' })
  .split('\n').filter(Boolean);

let removed = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let fileChanged = false;
  const lines = content.split('\n');
  const newLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Check if this is a line with just `numericId: true,` or `numericId: true }`
    if (trimmed.match(/^numericId:\s*true[,]?\s*\}?$/)) {
      // Check the surrounding context
      // Look at the previous 10 lines for `subject: { select:`, `class: { select:`, etc.
      const contextBefore = lines.slice(Math.max(0, i - 10), i).join('\n');
      const contextAfter = lines.slice(i + 1, Math.min(lines.length, i + 5)).join('\n');
      
      // If we see a nested select pattern (subject:, class:, section:, level:, teacher:) in the
      // previous 5 lines, this numericId is on a non-Resource model → remove
      const isNestedSelect = /(\bsubject|\bclass|\bsection|\blevel|\bteacher):\s*\{\s*select:\s*\{/.test(contextBefore) &&
                              !/numericId:\s*true/.test(contextBefore);
      
      // Check if this is the LAST line of a nested select (closing with } )
      // If so, just remove the numericId line and the trailing comma
      if (isNestedSelect) {
        fileChanged = true;
        removed++;
        // Check the previous line: if it ends with `,`, we need to keep it
        // The numericId: true, line just gets removed
        continue;
      }
    }
    newLines.push(line);
  }

  if (fileChanged) {
    fs.writeFileSync(file, newLines.join('\n'));
    console.log(`✅ ${file}: removed nested numericId`);
  }
}

console.log(`\nTotal lines removed: ${removed}`);
