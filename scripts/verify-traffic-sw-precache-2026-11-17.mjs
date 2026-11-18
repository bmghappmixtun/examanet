/**
 * 2026-11-18 — Test DÉCISIF de l'hypothèse « multiplicateur service worker ».
 *
 * Le SW (public/sw.js) précachee 10 URLs à l'install et recharge la page sur
 * `controllerchange`. Chaque nouvelle visite "neuve" (nouveau profil / nouveau
 * navigateur) déclenche donc :
 *   - 1 precache : /, /fr, /ar, /offline, /fr/offline, /ar/offline,
 *                   /manifest.json, /icon-192.png, /icon-512.png, /favicon.ico
 *   - 1 rechargement de page (controllerchange -> window.location.reload())
 *
 * Si le trafic est du SW, alors :
 *   - /fr/offline + /ar/offline + /offline doivent être dans le même ratio
 *     que /fr + /ar (paths que PERSONNE ne visite volontairement)
 *   - /sw.js doit être correlé avec le nombre d'installations
 *
 * Comparaison avec un path du "scraping" (/fr/recherche) qui, lui, n'a AUCUN
 * rapport avec le SW.
 */
import fs from 'node:fs';

const T = process.env.CLOUDFLARE_API_TOKEN;
const ACC = '59cffdeaadf3809cc3d2039c43f836e0';
if (!T) { console.error('CLOUDFLARE_API_TOKEN absent'); process.exit(1); }

async function gq(query, variables) {
  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST', headers: { Authorization: `Bearer ${T}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 400));
  return j.data;
}

async function countPath(day, path) {
  const from = Date.parse(day + 'T00:00:00Z');
  const filter = {
    datetime_geq: day + 'T00:00:00Z',
    datetime_lt: new Date(from + 864e5).toISOString(),
    clientRequestHTTPHost_in: ['examanet.com', 'www.examanet.com'],
    clientRequestPath: path,
  };
  const query = `query($accountTag:String!,$filter:AccountHttpRequestsAdaptiveGroupsFilter_InputObject,$limit:uint64!){
    viewer{ accounts(filter:{accountTag:$accountTag}){
      httpRequestsAdaptiveGroups(filter:$filter,limit:$limit){ count dimensions{ edgeResponseStatus } }
    }}
  }`;
  const data = await gq(query, { accountTag: ACC, filter, limit: 5000 });
  const g = data.viewer.accounts[0].httpRequestsAdaptiveGroups;
  const groups = Array.isArray(g) ? g : [];
  const total = groups.reduce((a, grp) => a + (grp.count || 0), 0);
  const byStatus = {};
  for (const grp of groups) {
    const st = grp.dimensions?.edgeResponseStatus || '?';
    byStatus[st] = (byStatus[st] || 0) + (grp.count || 0);
  }
  return { total, byStatus };
}

const PATHS = [
  '/fr', '/ar', '/', '/fr/offline', '/ar/offline', '/offline',
  '/sw.js', '/manifest.json', '/icon-192.png', '/icon-512.png', '/favicon.ico',
  '/fr/recherche', '/api/status/uptime',
];

const DAYS = ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18'];
const out = {};
for (const day of DAYS) {
  out[day] = {};
  for (const p of PATHS) {
    try { out[day][p] = await countPath(day, p); }
    catch (e) { out[day][p] = { error: String(e).slice(0, 160) }; }
  }
  console.log(day, 'OK');
}
fs.writeFileSync('output/traffic-sw-precache-2026-11-15-18.json', JSON.stringify(out, null, 2));

console.log('\n=== COMPARAISON ===');
console.log('path'.padEnd(24), DAYS.map(d => d.slice(5).padStart(9)).join(''));
for (const p of PATHS) {
  const row = DAYS.map(d => String(out[d][p]?.total ?? '-').padStart(9)).join('');
  console.log(p.padEnd(24), row);
}
console.log('\n--- ratios du 17/11 (jour du pic) ---');
const d17 = out['2026-11-17'];
const home = d17['/fr']?.total || 0;
for (const p of PATHS) {
  const n = d17[p]?.total || 0;
  console.log(`  ${p.padEnd(24)} ${String(n).padStart(7)}  ${home ? (n / home).toFixed(3) : '-'} x /fr`);
}
