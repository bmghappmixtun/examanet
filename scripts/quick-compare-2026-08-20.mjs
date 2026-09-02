import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function callOpenAI(firstName, lastName) {
  const prompt = `Translittère ce nom tunisien du français (Latin) vers l'arabe. JSON: {"firstNameAr": "...", "lastNameAr": "..."}. Si pas de lastName, mets null. Prénom: "${firstName || ''}" Nom: "${lastName || ''}"`;
  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });
    return JSON.parse(r.choices[0].message.content);
  } catch (e) { return null; }
}

async function callGemini(firstName, lastName) {
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`;
  const prompt = `Translittère ce nom tunisien du français (Latin) vers l'arabe. Réponds UNIQUEMENT en JSON strict avec ce format exact (sans markdown): {"firstNameAr": "...", "lastNameAr": "..."}. Si pas de lastName, mets null. Prénom: "${firstName || ''}" Nom: "${lastName || ''}"`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } })
    });
    const data = await r.json();
    if (data.error) return { error: data.error.message };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    const jsonMatch = text.match(/\{[^}]+\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : text;
  } catch (e) { return null; }
}

const test = ['Alaeddine', 'Chaari'];
const o = await callOpenAI(test[0], test[1]);
const g = await callGemini(test[0], test[1]);
console.log('OpenAI:', JSON.stringify(o));
console.log('Gemini:', JSON.stringify(g));
