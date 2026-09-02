require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });

// Generic patterns to detect
const GENERIC_PATTERNS = [
  /^physique et chimie$/i,
  /^chimie et physique$/i,
  /^physique[\s-]+chimie$/i,
  /^chimie[\s-]+physique$/i,
  /^physique[\s-]+lycée[\s-]+tunisien$/i,
  /^physique[\s-]+lycee[\s-]+tunisien$/i,
  /^physique[\s-]+lycée$/i,
  /^physique[\s-]+lycee$/i,
  /^sciences? physiques?$/i,
  /^sciences? physiques? et chimies?$/i,
  /^sciences? physiques? chimies?$/i,
  /^sciences? physiques?$/i,
  /^physique$/i,
  /^chimie$/i,
  /^math[ée]matiques?$/i,
  /^devoir de contrôle n?[°o]?\s*\d*/i,
  /^devoir de synthèse n?[°o]?\s*\d*/i,
  /^devoir de contrôle$/i,
  /^devoir de synthèse$/i,
  /^devoir de physique/i,
  /^devoir de chimie/i,
  /^devoir de sciences? physiques?$/i,
  /^devoir de sciences? physiques? et chimies?$/i,
  /^devoir en sciences? physiques?$/i,
  /^devoir en physique/i,
  /^devoir en chimie/i,
  /^devoir$/i,
  /^cours de /i,
  /^cours$/i,
  /^s[ée]rie d.exercices?$/i,
  /^exercices? de /i,
  /^s[ée]rie$/i,
  /^examen$/i,
  /^\d+\s*$/,
  /^.{0,15}$/,  // too short
];

// Stop words that should not be the ONLY topic
const TOPIC_STOP_WORDS = new Set([
  'physique', 'chimie', 'sciences', 'physiques', 'physique et chimie',
  'sciences physiques', 'physique-chimie', 'pc', 'tunisie', 'tunisien',
  'lycée', 'secondaire', 'bac', 'annee', 'année', 'cours', 'devoir',
  'série', 'serie', 'exercice', 'exercices', 'controle', 'contrôle',
  'synthese', 'synthèse', 'magnitude', 'rendement', 'energie', 'énergie',
  'mole', 'atome', 'atomes', 'ion', 'ions', 'molecule', 'molécule', 'molécules',
]);

function isGeneric(s) {
  if (!s) return true;
  for (const pat of GENERIC_PATTERNS) {
    if (pat.test(s.trim())) return true;
  }
  return false;
}

function pickBestTopics(topics, maxWords = 6) {
  if (!Array.isArray(topics) || topics.length === 0) return null;
  // Filter out stop words
  const filtered = topics
    .map(t => (t || '').trim())
    .filter(t => t.length > 2 && !TOPIC_STOP_WORDS.has(t.toLowerCase()))
    // Also filter things that are too vague
    .filter(t => t.length < 40);
  if (filtered.length === 0) return null;
  // Take first 1-3, join with " - " if multiple
  const picked = filtered.slice(0, 3);
  let result = picked.join(' - ');
  // Limit to maxWords
  const words = result.split(/\s+/);
  if (words.length > maxWords) {
    result = words.slice(0, maxWords).join(' ');
  }
  return result;
}

(async () => {
  // Get all files
  const files = await p.$queryRaw`
    SELECT rm.id, r.id as "rId", r."numericId", r.title,
      rm."generalSubject", rm.topics, rm."keyPoints", rm."shortKeyPoints", rm."modelUsed"
    FROM "ResourceMetadata" rm
    JOIN "Resource" r ON r.id = rm."resourceId"
    WHERE r.status = 'PUBLISHED' 
      AND r."subjectId" IN (SELECT id FROM "Subject" WHERE slug = 'physique')
      AND rm."generalSubject" IS NOT NULL
  `;
  
  console.log(`Total physique files with generalSubject: ${files.length}`);
  
  const generic = files.filter(f => isGeneric(f.generalSubject));
  console.log(`Generic: ${generic.length}`);
  
  // For each generic, find better generalSubject
  const updates = [];
  let noTopic = 0;
  for (const f of generic) {
    const newGs = pickBestTopics(f.topics);
    if (newGs) {
      updates.push({ id: f.id, numericId: f.numericId, oldGs: f.generalSubject, newGs });
    } else {
      noTopic++;
    }
  }
  
  console.log(`Will update: ${updates.length} (no topic data: ${noTopic})`);
  
  // Show samples
  console.log('\n=== Samples ===');
  for (const u of updates.slice(0, 15)) {
    console.log(`  #${u.numericId}: "${u.oldGs}" → "${u.newGs}"`);
  }
  
  // Apply updates
  let success = 0, failed = 0;
  for (let i = 0; i < updates.length; i++) {
    const u = updates[i];
    try {
      await p.resourceMetadata.update({
        where: { id: u.id },
        data: { generalSubject: u.newGs },
      });
      success++;
      if (success % 200 === 0) console.log(`  ${i}/${updates.length} (success=${success}, failed=${failed})`);
    } catch (e) {
      failed++;
      console.error(`  FAIL #${u.numericId}: ${e.message}`);
    }
  }
  
  console.log(`\nDone. success=${success}, failed=${failed}, noTopic=${noTopic}`);
  await p.$disconnect();
})();
