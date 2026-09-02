import { GoogleGenerativeAI } from '@google/generative-ai';
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const SYSTEM_PROMPT = `Tu es un expert des noms arabes. Retourne UNIQUEMENT le JSON {"firstNameAr": "...", "lastNameAr": "..."}.`;
async function go(fn, ln) {
  const m = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } });
  const r = await m.generateContent(SYSTEM_PROMPT + `\nPrénom: ${fn}\nNom: ${ln}\nJSON:`);
  return JSON.parse(r.response.text());
}
for (const t of [{id:20,fn:'Aloui',ln:'Mohamed'},{id:24,fn:'El Fekih',ln:'Nader'},{id:26,fn:'Dhaouadi',ln:'Ali'},{id:27,fn:'Mokhtar',ln:'Felhi'}]) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await go(t.fn, t.ln);
      console.log(`#${t.id} ${t.fn} ${t.ln} | ${r.firstNameAr} ${r.lastNameAr || ''}`);
      break;
    } catch (e) {
      console.log(`#${t.id} attempt ${i+1} fail: ${e.message.substring(0, 50)}`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}
