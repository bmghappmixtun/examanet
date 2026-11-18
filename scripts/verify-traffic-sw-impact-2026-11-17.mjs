/**
 * 2026-11-18 — Quantification de l'impact DU SERVICE WORKER sur le trafic.
 *
 * Constat (mesuré au navigateur sur la prod) : à la PREMIÈRE visite d'un
 * profil neuf, le SW s'installe, appelle clients.claim() → l'événement
 * `controllerchange` déclenche `window.location.reload()` → la page est
 * rechargée. Chaque visite "neuve" (donc chaque requête d'un bot qui
 * n'envoie pas de cookie) coûte donc :
 *   - 2 requêtes document (au lieu de 1)
 *   - 1 precache SW de 10 URLs ('/', '/fr', '/ar', '/offline', '/fr/offline',
 *     '/ar/offline', '/manifest.json', '/icon-192.png', '/icon-512.png',
 *     '/favicon.ico')
 *   - 2 × le jeu complet de scripts (42 chunks) + 2 × les RSC prefetch
 *
 * Ce script calcule, pour chaque jour, le TOTAL exact des requêtes et la
 * part imputable aux chemins du precache SW (que PERSONNE ne visite
 * volontairement : /fr/offline, /ar/offline, /offline, /sw.js...).
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
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 300));
  return j.data;
}

/** Compte exact via un grouping à faible cardinalité (edgeResponseStatus). */
async function count(day, path) {
  const from = Date.parse(day + 'T00:00:00Z');
  const filter = {
    datetime_geq: day + 'T00:00:00Z',
    datetime_lt: new Date(from + 864e5).toISOString(),
    clientRequestHTTPHost_in: ['examanet.com', 'www.examanet.com'],
  };
  if (path) filter.clientRequestPath = path;
  const query = `query($accountTag:String!,$filter:AccountHttpRequestsAdaptiveGroupsFilter_InputObject,$limit:uint64!){
    viewer{ accounts(filter:{accountTag:$accountTag}){
      httpRequestsAdaptiveGroups(filter:$filter,limit:$limit){ count dimensions{ edgeResponseStatus } }
    }}}`;
  const data = await gq(query, { accountTag: ACC, filter, limit: 5000 });
  const groups = data.viewer.accounts[0].httpRequestsAdaptiveGroups;
  return (Array.isArray(groups) ? groups : []).reduce((a, g) => a + (g.count || 0), 0);
}

const SW_PRECACHE = ['/fr/offline', '/ar/offline', '/offline', '/sw.js', '/manifest.json', '/icon-192.png', '/icon-512.png', '/favicon.ico'];
const DAYS = ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18'];

const out = {};
for (const day of DAYS) {
  const total = await count(day, null);
  const per = {};
  for (const p of SW_PRECACHE) per[p] = await count(day, p);
  const swSum = Object.values(per).reduce((a, b) => a + b, 0);
  const doc = await count(day, '/fr');
  out[day] = { total, doc_fr: doc, per, swSum, swPct: +(100 * swSum / total).toFixed(1) };
  console.log(`${day}: total=${total}  /fr=${doc}  chemins-SW=${swSum} (${out[day].swPct} %)`);
}
fs.writeFileSync('output/traffic-sw-impact-2026-11-15-18.json', JSON.stringify(out, null, 2));

console.log('\n=== DÉTAIL par chemin SW ===');
console.log('path'.padEnd(22), DAYS.map(d => d.slice(5).padStart(9)).join(''));
for (const p of SW_PRECACHE) {
  console.log(p.padEnd(22), DAYS.map(d => String(out[d].per[p]).padStart(9)).join(''));
}
console.log('\n=== TOTAL requêtes ===');
console.log(''.padEnd(22), DAYS.map(d => String(out[d].total).padStart(9)).join(''));
console.log('\n=== part SW (precache + sw.js) ===');
console.log(''.padEnd(22), DAYS.map(d => (out[d].swPct + '%').padStart(9)).join(''));
