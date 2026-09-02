import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
config({ path: '/workspace/edutunisie/.env.local' });
const p = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

async function main() {
  const samples = await p.$queryRaw`
    SELECT r."numericId", r.title, r."hasCorrection",
      rc."fullText" as text
    FROM "Resource" r
    JOIN "Subject" sub ON sub.id = r."subjectId"
    JOIN "Class" c ON c.id = r."classId"
    LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
    WHERE sub.slug = 'technologie'
      AND c.slug IN ('1ere-secondaire', '2eme-secondaire', '3eme-secondaire', '4eme-secondaire')
      AND r.status = 'PUBLISHED'
      AND r."hasCorrection" = true
    ORDER BY r."numericId"
  `;
  console.log('Total hasCorrection=true:', samples.length);
  console.log('');

  const keywords = /corrig[ée]|correction|barème|réponse|solution/i;
  let withKeyword = 0;
  let withoutKeyword = 0;
  const flagged = [];
  for (const r of samples) {
    const text = r.text || '';
    if (text && text.length > 200) {
      const lastPart = text.slice(Math.floor(text.length * 0.7));
      if (keywords.test(lastPart) || keywords.test(text)) {
        withKeyword++;
      } else {
        withoutKeyword++;
        flagged.push(r);
      }
    } else {
      withoutKeyword++;
      flagged.push(r);
    }
  }
  console.log('With correction keyword in text: ' + withKeyword);
  console.log('Without correction keyword: ' + withoutKeyword);
  console.log('');
  console.log('=== Flagged (no keyword found) ===');
  flagged.slice(0, 15).forEach(r => {
    console.log('  #' + r.numericId + ' | ' + r.title);
  });

  await p.$disconnect();
}
main().catch(console.error);
