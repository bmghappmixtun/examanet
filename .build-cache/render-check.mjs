import https from 'https';

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Accept-Language': 'en' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

function extractVisibleText(html) {
  // Remove script, style
  let text = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
                 .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
                 .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '');
  // Strip tags
  text = text.replace(/<[^>]+>/g, ' ');
  // Decode HTML entities
  text = text.replace(/&amp;/g, '&')
             .replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>')
             .replace(/&quot;/g, '"')
             .replace(/&#39;/g, "'")
             .replace(/&#x27;/g, "'")
             .replace(/&nbsp;/g, ' ');
  // Normalize whitespace
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

const pages = ['contact', 'cgu', 'a-propos', 'niveaux', 'matieres', 'faq', 'college', 'professeurs'];
const base = 'https://examanet.com';

const results = {};
for (const p of pages) {
  const frResp = await get(`${base}/${p}`);
  const arResp = await get(`${base}/ar/${p}`);
  results[p] = {
    fr: { status: frResp.status, text: extractVisibleText(frResp.body), body: frResp.body },
    ar: { status: arResp.status, text: extractVisibleText(arResp.body), body: arResp.body },
  };
}

// Look for things that might be bugs:
// 1. French-looking text in AR page (e.g. "Qu'est-ce qu" or apostrophes)
// 2. AR-looking text in FR page
// 3. Raw key patterns (e.g. "t('foo.bar')" rendering)
// 4. Specific known French-only words that shouldn't appear in AR
const FRENCH_WORDS = /\b(et le|et la|sont|est|avec|pour|dans|sur|tous|toutes|cours|devoirs|ressources|gratuit|faire|comment|examen)\b/i;
const ARABIC_PATTERN = /[\u0600-\u06FF]/;

console.log('=== Render Audit Report ===\n');

for (const p of pages) {
  const { fr, ar } = results[p];
  console.log(`\n--- ${p.toUpperCase()} ---`);
  console.log(`  FR: HTTP ${fr.status}, ${fr.text.length} chars visible`);
  console.log(`  AR: HTTP ${ar.status}, ${ar.text.length} chars visible`);

  // Check 1: AR page should have Arabic text
  const arHasArabic = ARABIC_PATTERN.test(ar.text);
  const frHasArabic = ARABIC_PATTERN.test(fr.text);
  console.log(`  AR has Arabic: ${arHasArabic ? 'YES' : 'NO ⚠️'}`);
  console.log(`  FR has Arabic (should be NO): ${frHasArabic ? 'YES ⚠️' : 'NO'}`);

  // Check 2: French words in AR (look for common FR strings)
  const arHasFrenchLeakage = /\b(le|la|les|et|ou|est|sont|avec|pour|dans|sur|par|des|une|nos|votre)\b/i.test(ar.text);
  if (arHasFrenchLeakage) {
    // Find context
    const frMatches = ar.text.match(/\b(et|ou|est|sont|avec|pour|dans|sur|par|des|nos|votre|parmi)\b/gi) || [];
    if (frMatches.length > 5) {
      console.log(`  ⚠️ AR has French words (${frMatches.length}): ${[...new Set(frMatches)].slice(0,10).join(', ')}`);
    }
  }

  // Check 3: HTML lang/dir
  const arLang = ar.body.match(/<html[^>]*lang="([^"]+)"/)?.[1];
  const arDir = ar.body.match(/<html[^>]*dir="([^"]+)"/)?.[1];
  console.log(`  AR lang="${arLang}" dir="${arDir}"`);

  // Check 4: Look for missing key patterns (e.g. "t('xxx')" or just "xxx.yyy.zzz" without spaces)
  const rawKey = /\b\w+\.\w+\.\w+/.test(ar.text);
  if (rawKey) {
    const matches = ar.text.match(/\b[a-z]+\.[a-z]+\.[a-z]+/g) || [];
    if (matches.length > 0) {
      console.log(`  ⚠️ AR has raw key patterns: ${[...new Set(matches)].slice(0,5).join(', ')}`);
    }
  }
}
