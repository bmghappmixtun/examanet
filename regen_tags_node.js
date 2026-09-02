require('/workspace/edutunisie/node_modules/dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const OpenAI = require('/workspace/edutunisie/node_modules/openai').default;
const p = new PrismaClient({ log: ['error'] });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TYPE_FR = {
  COURSE: 'Cours',
  DEVOIR: 'Devoir',
  EXERCISE: "Série d'exercices",
  EXAM: 'Examen',
  CORRECTION: 'Devoir corrigé',
  TP: 'TP',
  HOMEWORK: 'Devoir maison',
};

async function genTags({subject, className, docType, generalSubject, shortKps, kps}) {
  const prompt = `Génère 5 à 8 TAGS COURTS (mots-clés, 1-3 mots max, 6-20 caractères) pour ce document éducatif tunisien.

⚠️ RÈGLES STRICTES pour les tags:
- 1 à 3 mots MAXIMUM par tag
- 6-20 caractères MAX par tag
- Pas de phrase, pas de "exercice sur...", pas de "analyse de..."
- Pas de virgule dans un tag
- Mots simples ou composés avec tiret (ex: "acides-bases", "2ème année")
- Toujours en français
- En minuscule (sauf noms propres)

✅ EXEMPLES BONS:
- "physique", "2ème année", "devoir corrigé", "synthèse", "acides-bases", "réfraction", "lentilles", "miroirs", "dosage", "piles", "mécanique", "ondes", "électricité"
- "mathématiques", "1ère année", "contrôle", "probabilités", "suites", "logarithme", "intégrales"
- "svt", "3ème année", "immunologie", "génétique", "mitose", "phylogénétique"

❌ INTERDITS (trop longs):
- "exercice sur les équilibres acido-basiques" → ❌
- "application des lois de descartes" → ❌
- "analyse des images virtuelles" → ❌

Données du document:
- Matière: ${subject}
- Classe: ${className}
- Type: ${docType}
- Sujet spécifique: ${generalSubject}
- KeyPoints courts: ${JSON.stringify(shortKps)}
- KeyPoints: ${JSON.stringify(kps)}

Réponds UNIQUEMENT avec un JSON: {"tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6"]}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Tu réponds en JSON uniquement. Tags COURTS en français.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 200,
        temperature: 0.3,
      });
      let content = resp.choices[0].message.content.trim();
      if (content.startsWith('```')) {
        content = content.split('```')[1];
        if (content.startsWith('json')) content = content.slice(4);
        content = content.trim();
      }
      const data = JSON.parse(content);
      let tags = (data.tags || []).map(t => String(t).trim().toLowerCase()).filter(t => t && t.length <= 25 && t.split(/\s+/).length <= 4);
      if (tags.length >= 4) return tags.slice(0, 8);
    } catch (e) {
      console.error(`  attempt ${attempt+1}: ${e.message}`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  return null;
}

(async () => {
  const files = await p.resource.findMany({
    where: { numericId: { gte: 15413, lte: 15452 } },
    select: {
      id: true,
      numericId: true,
      type: true,
      tags: true,
      metadata: { select: { generalSubject: true, shortKeyPoints: true, keyPoints: true } },
      class: { select: { nameFr: true } },
      subject: { select: { nameFr: true } },
    },
    orderBy: { numericId: 'asc' },
  });
  console.log(`Processing ${files.length} files...\n`);
  
  const stats = { updated: 0, skipped: 0, failed: 0 };
  for (const f of files) {
    if (!f.metadata) {
      console.log(`#${f.numericId}: no metadata, skip`);
      stats.skipped++;
      continue;
    }
    const subject = f.subject?.nameFr || '?';
    const cls = f.class?.nameFr || '?';
    const docType = TYPE_FR[f.type] || f.type;
    const gs = f.metadata.generalSubject || '?';
    const skps = f.metadata.shortKeyPoints || [];
    const kps = f.metadata.keyPoints || [];
    
    const existingCount = f.tags ? f.tags.split(',').length : 0;
    console.log(`#${f.numericId} (${f.type}, ${subject}, ${cls}):`);
    console.log(`  "${gs}"`);
    console.log(`  existing: ${existingCount} tags`);
    
    const newTags = await genTags({ subject, className: cls, docType, generalSubject: gs, shortKps: skps, kps });
    if (!newTags) {
      console.log(`  ❌ FAILED\n`);
      stats.failed++;
      continue;
    }
    console.log(`  ✅ ${newTags.join(', ')}`);
    await p.resource.update({
      where: { id: f.id },
      data: { tags: newTags.join(', ') },
    });
    stats.updated++;
    await new Promise(r => setTimeout(r, 300));
  }
  console.log(`\n=== Summary ===`);
  console.log(`  Updated: ${stats.updated}`);
  console.log(`  Skipped: ${stats.skipped}`);
  console.log(`  Failed:  ${stats.failed}`);
  await p.$disconnect();
})();
