/**
 * Compare le HTML SSR (serveur) avec le DOM après hydratation (client).
 * En production, React PATCHE silencieusement un mismatch d'attribut ou de
 * texte → le DOM final diffère du HTML serveur exactement là où le mismatch
 * a eu lieu. C'est le seul moyen de voir le mismatch sans build React dev.
 *
 * Usage : node scripts/diff-ssr-vs-hydrated.cjs <url> <fichier-ssr> [cookie]
 */
const fs = require('fs');
const { firefox, chromium } = require('playwright');

const URL_ = process.argv[2] || 'https://examanet.com/admin/invitations';
const SSR_FILE = process.argv[3] || '/tmp/ssr.html';
const COOKIE = process.argv[4] || '';

/** Extrait la « squelette » : liste de balises ouvrantes avec leurs attributs. */
function skeleton(html) {
  const clean = html
    .replace(/<!--[\s\S]*?-->/g, '')      // commentaires React
    .replace(/<script[\s\S]*?<\/script>/g, '') // scripts
    .replace(/<style[\s\S]*?<\/style>/g, '');
  const out = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g;
  let m;
  while ((m = re.exec(clean))) {
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrs = (m[3] || '')
      .replace(/\s+/g, ' ')
      .trim()
      // on ignore les attributs que React patche classiquement sans incidence
      .replace(/\s(data-reactroot|data-previous-style|suppresshydrationwarning)="[^"]*"/gi, '')
      .trim();
    out.push(closing ? `/${tag}` : `${tag}${attrs ? ' ' + attrs : ''}`);
  }
  return out;
}

(async () => {
  const browser = await firefox.launch();
  const ctx = await browser.newContext({ viewport: { width: 1680, height: 1050 }, userAgent: 'MavisProbe/1.0 (diagnostic Examanet - hors triage)' });
  if (COOKIE) {
    await ctx.addCookies([
      { name: '__Secure-examanet_session', value: COOKIE, domain: new URL(URL_).hostname, path: '/', secure: true },
    ]);
  }
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message.slice(0, 160)));

  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(12000);
  console.log(`  cookie fournie: ${COOKIE ? 'oui (' + COOKIE.slice(0, 14) + '…)' : 'NON'} | url finale: ${page.url()}`);
  const dom = await page.evaluate(() => document.documentElement.outerHTML);
  console.log(`  DOM: ${dom.length} octets | contient 'Invitations enseignants' : ${dom.includes('Invitations enseignants')}`);
  await browser.close();

  const a = skeleton(fs.readFileSync(SSR_FILE, 'utf8'));
  const b = skeleton(dom);
  console.log(`  SSR: ${a.length} balises | DOM hydraté: ${b.length} balises`);
  console.log(`  erreurs console: ${errs.length}`);
  errs.slice(0, 3).forEach((e) => console.log('    ' + e));

  let first = -1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) { first = i; break; }
  }
  if (first === -1) { console.log('  ✅ squelette IDENTIQUE — pas de patch React (donc pas de mismatch détectable ici)'); return; }
  console.log(`  ⚠️  1ʳᵉ divergence à l'index ${first} :`);
  for (let i = Math.max(0, first - 4); i < Math.min(Math.max(a.length, b.length), first + 6); i++) {
    const sa = (a[i] ?? '⟂').slice(0, 110);
    const sb = (b[i] ?? '⟂').slice(0, 110);
    const mark = a[i] !== b[i] ? ' <<<' : '';
    console.log(`    [${i}] SSR : ${sa}`);
    console.log(`    [${i}] DOM : ${sb}${mark}`);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
