/**
 * Reproduit le #418/#422 sur /admin/invitations dans FIREFOX (le seul
 * navigateur où l'erreur se produit en prod).
 * Prérequis : MAVIS_SESSION = token de session admin (cf. le script).
 */
const { firefox } = require('playwright');
const BASE = process.argv[2] || 'https://examanet.com';
const TOKEN = process.env.MAVIS_SESSION;

(async () => {
  const b = await firefox.launch();
  const ctx = await b.newContext({ viewport: { width: 1680, height: 1050 }, userAgent: 'MavisProbe/1.0 (diagnostic Examanet - hors triage)' });
  await ctx.addCookies([
    { name: process.env.MAVIS_COOKIE || '__Secure-examanet_session', value: TOKEN, domain: new URL(BASE).hostname, path: '/', secure: true },
  ]);
  const p = await ctx.newPage();
  const logs = [];
  p.on('console', (m) => logs.push({ t: m.type(), x: m.text() }));
  p.on('pageerror', (e) => logs.push({ t: 'PAGEERROR', x: e.message }));

  const resp = await p.goto(`${BASE}/admin/invitations`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  console.log('  HTTP', resp ? resp.status() : '?');
  await p.waitForTimeout(12000);

  const errs = logs.filter((l) => /#418|#419|#422|#425|hydrat|did not match/i.test(l.x));
  console.log('  erreurs hydration :', errs.length);
  errs.slice(0, 6).forEach((l) => console.log(`    [${l.t}] ${l.x.slice(0, 400)}`));
  const other = logs.filter((l) => l.t === 'error' && !/#418|#419|#422|#425|hydrat|did not match/i.test(l.x));
  if (other.length) { console.log('  autres erreurs :'); other.slice(0, 3).forEach((l) => console.log('    ' + l.x.slice(0, 200))); }
  await p.screenshot({ path: 'output/screenshots/admin-invitations-firefox.png' }).catch(() => {});
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
