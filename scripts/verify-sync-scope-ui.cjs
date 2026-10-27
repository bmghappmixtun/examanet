/**
 * Vérifie le bouton « Sync Resend » scopé à l'onglet actif sur /admin/invitations.
 * Prérequis : un cookie de session admin valide (variable MAVIS_SESSION).
 */
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'https://examanet-dev.examanet-poc.workers.dev';
const TOKEN = process.env.MAVIS_SESSION;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1680, height: 1050 } });
  await ctx.addCookies([
    { name: '__Secure-examanet_session', value: TOKEN, domain: new URL(BASE).hostname, path: '/', secure: true },
  ]);
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
  p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message.slice(0, 140)));

  await p.goto(`${BASE}/admin/invitations`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForTimeout(6000);
  console.log('  titre :', (await p.title()).slice(0, 60));

  const btn = p.locator('button', { hasText: 'Sync Resend' }).first();
  console.log('  bouton (aucun onglet)  :', JSON.stringify((await btn.innerText()).replace(/\s+/g, ' ')));

  // Onglet « Expirée »
  await p.locator('button', { hasText: 'Expirée' }).first().click({ timeout: 10000 });
  await p.waitForTimeout(1200);
  console.log('  bouton (onglet Expirée) :', JSON.stringify((await btn.innerText()).replace(/\s+/g, ' ')));
  await p.screenshot({ path: 'output/screenshots/sync-resend-scope-dev.png', fullPage: false });

  // Onglet « Envoyée »
  await p.locator('button', { hasText: 'Envoyée' }).first().click({ timeout: 10000 });
  await p.waitForTimeout(1200);
  console.log('  bouton (onglet Envoyée) :', JSON.stringify((await btn.innerText()).replace(/\s+/g, ' ')));

  // Déclenche le sync sur l'onglet « Envoyée » (2 emails récents → doit marcher)
  p.on('dialog', (d) => { console.log('  confirm :', JSON.stringify(d.message().slice(0, 130))); d.accept(); });
  await btn.click({ timeout: 10000 });
  await p.waitForTimeout(9000);
  const toast = await p.locator('[role="status"], [data-radix-toast-announce-exclude-at-y], .go2072408551').first().innerText().catch(() => '');
  console.log('  toast :', JSON.stringify(toast.replace(/\s+/g, ' ').slice(0, 160)));
  await p.screenshot({ path: 'output/screenshots/sync-resend-toast-dev.png', fullPage: false });

  console.log('  erreurs console :', errs.length);
  errs.slice(0, 3).forEach((e) => console.log('    ' + e));
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
