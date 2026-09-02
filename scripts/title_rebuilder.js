require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });

// Section slug mapping (DB section name -> slug)
const SECTION_SLUG = {
  'sciences expérimentales': 'sciences-experimentales',
  'sciences de l\'informatique': 'sciences-informatique',
  'mathématiques': 'mathematiques',
  'technique': 'technique',
  'économie & gestion': 'eco-gestion',
  'économie & services': 'eco-services',
  'lettres': 'lettres',
  'sport': 'sport',
  'sciences': 'sciences',
};

// Type + subtype map
function buildType(type, rawTitle) {
  const title = rawTitle.toLowerCase();
  // Has correction?
  const hasCorrection = /\bavec\s+(corr|corrig|correction)\b/i.test(rawTitle) || /corrigé/i.test(rawTitle);
  
  if (type === 'COURSE') return { type: 'Cours', subtype: null };
  if (type === 'EXAM') return { type: 'Examen', subtype: null };
  if (type === 'EXERCISE') return { type: "Série d'exercices", subtype: null };
  if (type === 'CORRECTION') return { type: 'Devoir Corrigé', subtype: null };
  if (type === 'DEVOIR') {
    if (/synthèse|synthese/.test(title)) {
      return { type: hasCorrection ? 'Devoir Corrigé de Synthèse' : 'Devoir de Synthèse', subtype: 'Synthèse' };
    }
    if (/contrôle|controle/.test(title)) {
      return { type: hasCorrection ? 'Devoir Corrigé de Contrôle' : 'Devoir de Contrôle', subtype: 'Contrôle' };
    }
    return { type: hasCorrection ? 'Devoir Corrigé' : 'Devoir', subtype: null };
  }
  return { type: type, subtype: null };
}

// Extract N° from title
function extractN(rawTitle) {
  // Match patterns like "N°1", "N 1", "N°2 Lycée pilote", "N°6"
  let m = rawTitle.match(/N°\s*(\d+)/i);
  if (m) return m[1];
  m = rawTitle.match(/\bDC\s*(\d+)/i);
  if (m) return m[1];
  m = rawTitle.match(/\bDS\s*(\d+)/i);
  if (m) return m[1];
  return null;
}

// Class label builder
function buildClasse(classSlug, className) {
  // classSlug: 1ere-secondaire, 2eme-secondaire, 3eme-secondaire, 4eme-secondaire
  if (classSlug === '1ere-secondaire') return '1ère année secondaire';
  if (classSlug === '2eme-secondaire') return '2ème année secondaire';
  if (classSlug === '3eme-secondaire') return '3ème année secondaire';
  if (classSlug === '4eme-secondaire') return '4ème année secondaire (Bac)';
  return className;
}

// Build topic from generalSubject or fallback
function buildTopic(generalSubject, rawTitle) {
  if (!generalSubject) {
    // Try to extract from title: text after last " - " or after the year
    let m = rawTitle.match(/\(\d{4}-\d{4}\)\s*:?\s*(.+)$/i);
    if (m) return cleanTopic(m[1]);
    return null;
  }
  return cleanTopic(generalSubject);
}

function cleanTopic(s) {
  if (!s) return null;
  let t = s.trim();
  // Remove leading "Devoir de", "Cours de", "Série d'exercices", "Contrôle", etc.
  t = t.replace(/^(Devoir de (Contrôle|Synthèse) N?\d*|Devoir de (Contrôle|Synthèse)|Devoir|Cours de|Cours|Série d'exercices|Contrôle N?\d*|Synthèse N?\d*|Contrôle|Synthèse|Examen)\b\s*[:\-]?\s*/i, '');
  // Remove leading subject words
  t = t.replace(/^(Sciences? physiques?|Physique et Chimie|Physique-Chimie|Physique|PC|Chimie)\s*[:\-]?\s*/i, '');
  // Drop leading "et ..." or "et"
  t = t.replace(/^et\s+/i, '');
  // Remove leading articles and prepositions
  t = t.replace(/^(en|du|de|à propos de|sur|le|la|les|au|aux)\s+/i, '');
  // Remove generic filler words (whole words only)
  t = t.replace(/\b(lycée|lycee|secondaire|tunisien|tunisienne|tunisie|collège|college|au)\b/gi, '');
  // Remove "Trimestre X" or "Trim X"
  t = t.replace(/\bTrimestre\s*\d+\b/gi, '');
  t = t.replace(/\bTrim\s*\d+\b/gi, '');
  // Remove trim indicator from end
  t = t.replace(/\bT[1-3]\b/gi, '');
  // Clean up
  t = t.replace(/^[\s\-:;,.\u0600-\u06FF]+/, '').trim();
  t = t.replace(/[\s\-:;,.]+$/, '').trim();
  t = t.replace(/\s+/g, ' ');
  // Drop if it's empty or just punctuation
  if (t.length < 3) return null;
  // Drop very generic topics
  if (/^(chimie|physique|et|et chimie)$/i.test(t)) return null;
  // Capitalize first letter
  t = t.charAt(0).toUpperCase() + t.slice(1);
  // Limit length
  if (t.length > 80) t = t.substring(0, 77) + '...';
  return t;
}

// Build slug from title
function buildSlug(title, numericId) {
  return title
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/œ/g, 'oe')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 80)
    .replace(/^-|-$/g, '')
    + '-' + numericId;
}

(async () => {
  console.log('Loading physique lycée files...');
  const files = await p.$queryRaw`
    SELECT r.id, r."numericId", r.title, r.type, r."schoolType",
      c.slug as class_slug, c."nameFr" as class_name,
      s.slug as subject_slug, sec."nameFr" as section_name,
      rm."generalSubject", rm."keyInsights"
    FROM "Resource" r
    JOIN "Class" c ON r."classId" = c.id
    JOIN "Level" l ON c."levelId" = l.id
    JOIN "Subject" s ON r."subjectId" = s.id
    LEFT JOIN "Section" sec ON r."sectionId" = sec.id
    LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    WHERE l.slug = 'lycee' AND s.slug = 'physique' AND r.status = 'PUBLISHED'
    ORDER BY r."numericId" ASC
  `;
  console.log(`Total files: ${files.length}`);
  
  // Build new titles
  const updates = [];
  const seen = { samples: [], errors: [] };
  
  for (const f of files) {
    const t = buildType(f.type, f.title);
    const n = extractN(f.title);
    const classe = buildClasse(f.class_slug, f.class_name);
    const yearMatch = f.title.match(/\((\d{4}-\d{4})\)/);
    const year = yearMatch ? yearMatch[1] : null;
    const topic = buildTopic(f.generalSubject, f.title);
    
    // Sujet is always "Physique" for this batch
    const sujet = 'Physique';
    
    // Build: {Type}{N°X?} - {Sujet} - {Classe} [- Section {Section}] [(year)] [: {Topic}]
    let newTitle = t.type;
    if (n) newTitle += ` N°${n}`;
    newTitle += ` - ${sujet} - ${classe}`;
    if (f.section_name) {
      newTitle += ` - Section ${f.section_name}`;
    }
    if (year) {
      newTitle += ` (${year})`;
    }
    if (topic) {
      newTitle += ` : ${topic}`;
    }
    
    // Add "Lycée pilote" hint for PILOTE files
    if (f.schoolType === 'PILOTE' && !/pilote/i.test(newTitle)) {
      // Insert "Lycée pilote" before the topic or year
      // For now, just add it in the topic position if no topic
      if (!topic) {
        newTitle += ' : Lycée pilote';
      }
    }
    
    const newSlug = buildSlug(newTitle, f.numericId);
    
    if (seen.samples.length < 10) {
      seen.samples.push({
        old: f.title,
        new: newTitle,
        slug: newSlug,
      });
    }
    
    updates.push({ id: f.id, numericId: f.numericId, newTitle, newSlug, oldTitle: f.title, oldSlug: '' });
  }
  
  console.log('\n=== SAMPLES (old → new) ===\n');
  for (const s of seen.samples) {
    console.log(`OLD: ${s.old}`);
    console.log(`NEW: ${s.new}`);
    console.log(`SLUG: ${s.slug}`);
    console.log('');
  }
  
  // Dry run mode — print to JSON file for review
  require('fs').writeFileSync('/tmp/title_rebuilder_plan.json', JSON.stringify(updates, null, 2));
  console.log(`\nFull plan written to /tmp/title_rebuilder_plan.json (${updates.length} files)`);
  
  // Count unique new titles (to detect duplicates)
  const titleCount = new Map();
  for (const u of updates) {
    titleCount.set(u.newTitle, (titleCount.get(u.newTitle) || 0) + 1);
  }
  const dupes = Array.from(titleCount.entries()).filter(([_, c]) => c > 1);
  console.log(`Unique titles: ${titleCount.size}, duplicates: ${dupes.length}`);
  if (dupes.length > 0) {
    console.log('\n=== DUPLICATES ===');
    for (const [title, c] of dupes.slice(0, 5)) {
      console.log(`[${c}x] ${title}`);
    }
  }
  
  await p.$disconnect();
})();
