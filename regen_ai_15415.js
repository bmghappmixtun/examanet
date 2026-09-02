require('/workspace/edutunisie/node_modules/dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const OpenAI = require('/workspace/edutunisie/node_modules/openai').default;
const fs = require('fs');
const p = new PrismaClient({ log: ['error'] });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

(async () => {
  const text = fs.readFileSync('/tmp/15415_text.txt', 'utf-8');
  console.log(`Loaded ${text.length} chars`);
  
  const TYPE_FR = { COURSE: 'Cours', DEVOIR: 'Devoir', EXERCISE: "Série d'exercices", EXAM: 'Examen', CORRECTION: 'Devoir corrigé', TP: 'TP', HOMEWORK: 'Devoir maison' };
  
  const r = await p.resource.findUnique({ 
    where: { numericId: 15415 },
    include: { 
      metadata: true, 
      class: true,
      subject: true,
    },
  });
  
  const subject = r.subject?.nameFr || 'Physique';
  const cls = r.class?.nameFr || '4ème année secondaire';
  const typeLabel = TYPE_FR[r.type] || r.type;
  const textSample = text.substring(0, 6000);
  
  const prompt = `Tu es un expert en sciences tunisien. Analyse ce document: ${typeLabel} de ${subject} pour ${cls} - 2024-2025.

⚠️ RÈGLE ABSOLUE: Le "generalSubject" doit être le **sujet SPÉCIFIQUE** du document, pas un terme générique.

❌ INTERDITS (trop génériques):
- "Physique et Chimie", "Physique", "Chimie", "Mathématiques"
- "En physique", "En anglais"
- "Cours de...", "Devoir de..."

✅ EXEMPLES BONS (3-6 mots spécifiques):
- Physique: "Piles électrochimiques", "Spectre atomique et niveaux d'énergie", "Réactions nucléaires et radioactivité"
- Maths: "Fonctions logarithme", "Probabilités conditionnelles"

JSON uniquement:
{
  "generalSubject": "Sujet spécifique (3-6 mots)",
  "summary": "Résumé 2-3 phrases en français (100-150 mots)",
  "keyPoints": ["point 1 spécifique", "point 2", "point 3", "point 4", "point 5"],
  "shortKeyPoints": ["point court 1", "point court 2"]
}

Contenu OCR:
${textSample}`;
  
  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Tu réponds TOUJOURS en français. JSON uniquement. Sois PRÉCIS sur le sujet.' },
      { role: 'user', content: prompt },
    ],
    max_tokens: 900,
    temperature: 0.2,
  });
  let content = resp.choices[0].message.content.trim();
  if (content.startsWith('```')) {
    content = content.split('```')[1];
    if (content.startsWith('json')) content = content.slice(4);
    content = content.trim();
  }
  const data = JSON.parse(content);
  console.log('\n=== AI Result ===');
  console.log('generalSubject:', data.generalSubject);
  console.log('summary:', data.summary?.substring(0, 200));
  console.log('keyPoints:', data.keyPoints);
  console.log('shortKeyPoints:', data.shortKeyPoints);
  
  await p.resourceMetadata.update({
    where: { resourceId: r.id },
    data: {
      generalSubject: data.generalSubject,
      keyPoints: data.keyPoints,
      shortKeyPoints: data.shortKeyPoints,
    },
  });
  console.log('\n✅ ResourceMetadata updated');
  
  await p.resource.update({
    where: { id: r.id },
    data: { 
      summary: data.summary,
      description: data.summary,
    },
  });
  console.log('✅ Resource.summary + description updated');
  
  // Re-generate tags
  const tagsPrompt = `Génère 5-8 TAGS COURTS (1-3 mots, 6-20 chars) en français pour ce document:
Matière: ${subject}
Classe: ${cls}
Type: ${typeLabel}
Sujet: ${data.generalSubject}
KeyPoints: ${JSON.stringify(data.keyPoints)}

Règles strictes: 1-3 mots max par tag, 6-20 chars, minuscules, pas de phrase, pas de virgule dans un tag.

Réponds UNIQUEMENT: {"tags": ["tag1", "tag2", ...]}`;
  
  const tagsResp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'JSON uniquement. Tags COURTS en français.' },
      { role: 'user', content: tagsPrompt },
    ],
    max_tokens: 200,
    temperature: 0.3,
  });
  let tagsContent = tagsResp.choices[0].message.content.trim();
  if (tagsContent.startsWith('```')) {
    tagsContent = tagsContent.split('```')[1];
    if (tagsContent.startsWith('json')) tagsContent = tagsContent.slice(4);
    tagsContent = tagsContent.trim();
  }
  const tagsData = JSON.parse(tagsContent);
  const cleanTags = (tagsData.tags || []).map(t => String(t).trim().toLowerCase()).filter(t => t && t.length <= 25 && t.split(/\s+/).length <= 4);
  console.log('\n✅ Tags:', cleanTags);
  await p.resource.update({
    where: { id: r.id },
    data: { tags: cleanTags.join(', ') },
  });
  
  await p.$disconnect();
})();
