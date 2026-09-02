require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const fs = require('fs');
const https = require('https');
const { spawnSync } = require('child_process');
const p = new PrismaClient({ log: ['error'] });
const TOKEN = process.env.INTERNAL_BULK_TOKEN || 'devmanet-bulk-2026';

(async () => {
  const file = await p.resource.findFirst({ where: { numericId: 515 }, select: { fileKey: true, content: { select: { fullText: true } } } });
  console.log('fileKey:', file.fileKey);
  console.log('---');
  // Use the text already extracted in DB
  const text = file.content?.fullText || '';
  console.log('=== First 600 chars of stored text ===');
  console.log(text.substring(0, 600));
  console.log('---');
  console.log('=== Search for "math" or "physique" markers ===');
  const lower = text.toLowerCase();
  console.log('Has "mathématique":', /\bmath.?\b/i.test(lower) || lower.includes('mathématique') || lower.includes('mathematique'));
  console.log('Has "physique":', lower.includes('physique') || lower.includes('فيزياء'));
  console.log('Has "chimie":', lower.includes('chimie') || lower.includes('كيمياء'));
  console.log('Has "8ème année" or "8 année":', /\b8[èe]?me\b|8e ann|8 année/.test(lower) || text.includes('الثامنة'));
  console.log('Has "1ère année" or "première année":', /1[èe]?re|1er année|première/.test(lower) || text.includes('الأولى'));
  
  // Look for class indicators
  console.log('\n=== First 1500 chars (full context) ===');
  console.log(text.substring(0, 1500));
  
  await p.$disconnect();
})();
