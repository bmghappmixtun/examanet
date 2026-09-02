/* eslint-disable */
// Update 3L titles: add generalSubject after ":"
require('/workspace/edutunisie/node_modules/dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });

// Mapping for level/class extraction
const LEVEL_PATTERNS = [
  { re: /7[eè]?me|7eme/i, label: '7ème année' },
  { re: /8[eè]?me|8eme/i, label: '8ème année' },
  { re: /9[eè]?me|9eme/i, label: '9ème année' },
  { re: /1[aè]?re|1ère|1ere|1AS|1as|1ère année/i, label: '1ère année' },
  { re: /2[aè]?me|2ème|2eme|2AS|2as|2ème année/i, label: '2ème année' },
  { re: /3[aè]?me|3ème|3eme|3AS|3as|3ème année|lycée|lycee/i, label: '3ème année' },
  { re: /4[aè]?me|4ème|4eme|4AS|4as|4ème année|bac/i, label: '4ème année' },
];

// Mapping for subject slug → 3L label
const SUBJECT_MAP = {
  '3eme-langue-allemand': '3ème Langue - Allemand',
  '3eme-langue-italien': '3ème Langue - Italien',
  '3eme-langue-espagnol': '3ème Langue - Espagnol',
};

(async () => {
  const all = await p.resource.findMany({
    where: { 
      subject: { slug: { in: ['3eme-langue-allemand', '3eme-langue-italien', '3eme-langue-espagnol'] } },
      status: 'PUBLISHED',
    },
    include: { 
      metadata: { select: { generalSubject: true } },
      subject: { select: { slug: true } },
    },
    orderBy: { numericId: 'asc' },
  });
  
  let updated = 0;
  let unchanged = 0;
  const updates = [];
  
  for (const r of all) {
    if (!r.metadata?.generalSubject) {
      console.log(`⚠️  #${r.numericId} no GS, skipping`);
      continue;
    }
    
    // Get FR part of GS (before " / ")
    const gsFr = r.metadata.generalSubject.split(' / ')[0].trim();
    
    if (!gsFr || gsFr.length === 0) {
      console.log(`⚠️  #${r.numericId} empty GS FR, skipping`);
      continue;
    }
    
    let currentTitle = r.title;
    let newTitle;
    
    // Check if title already has ":" with a topic
    const colonMatch = currentTitle.match(/^(.*?):\s*(.*?)$/);
    if (colonMatch) {
      const base = colonMatch[1].trim();
      const existingTopic = colonMatch[2].trim();
      // Replace existing topic with the new GS
      newTitle = `${base} : ${gsFr}`;
    } else {
      // No colon - just append " : {GS}"
      newTitle = `${currentTitle} : ${gsFr}`;
    }
    
    if (newTitle === currentTitle) {
      unchanged++;
      continue;
    }
    
    updates.push({ id: r.numericId, old: currentTitle, new: newTitle });
  }
  
  console.log(`\n=== ${updates.length} titles to update ===\n`);
  for (const u of updates.slice(0, 10)) {
    console.log(`#${u.id}:`);
    console.log(`  OLD: ${u.old.slice(0, 100)}`);
    console.log(`  NEW: ${u.new.slice(0, 100)}`);
    console.log();
  }
  if (updates.length > 10) {
    console.log(`... and ${updates.length - 10} more\n`);
  }
  
  // Apply updates
  console.log(`Applying ${updates.length} updates...`);
  for (const u of updates) {
    await p.resource.update({
      where: { numericId: u.id },
      data: { title: u.new },
    });
    updated++;
  }
  console.log(`\n✅ Updated ${updated} titles, ${unchanged} unchanged`);
  
  await p.$disconnect();
})();
