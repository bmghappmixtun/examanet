const { execSync } = require('child_process');
// Just test the chunking
const file = {
  id: 'test',
  numericId: 14311,
  type: 'EXERCISE',
  subject_slug: 'physique',
  class_slug: '2eme-secondaire',
  section_name: 'Sciences',
  fullText: 'Exercice 1 (Physique): abc. Exercice 2 (Chimie): def. Exercice 3 (Math): ghi.'
};
function chunkText(fullText, maxChars = 25000) {
  if (fullText.length <= maxChars) return [fullText];
  const parts = fullText.split(/(?=Exercice\s+\d+)/i);
  const chunks = [];
  let current = '';
  for (const part of parts) {
    if (current.length + part.length > maxChars && current.length > 0) {
      chunks.push(current);
      current = part;
    } else {
      current += part;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
console.log('Chunks:', chunkText(file.fullText));
