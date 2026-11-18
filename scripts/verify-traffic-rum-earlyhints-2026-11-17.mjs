/**
 * 2026-11-18 — Vérifie 2 points du diagnostic de l'assistant Cloudflare :
 *  A) le volume des sondes "early hints" (prefetch Cloudflare) — qui n'atteignent
 *     JAMAIS notre Worker mais gonflent le compteur "HTTP requests" ;
 *  B) le nombre de pageloads RUM (/cdn-cgi/rum) — permet de séparer le trafic
 *     qui exécute le JS (visiteurs + bots headless) de celui qui ne l'exécute pas.
 */
import fs from 'node:fs';
const T = process.env.CLOUDFLARE_API_TOKEN;
const ACC = '59cffdeaadf3809cc3d2039c43f836e0';
if (!T) { console.error('CLOUDFLARE_API_TOKEN absent'); process.exit(1); }
async function gq(q, v) {
  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST', headers: { Authorization: `Bearer ${T}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q, variables: v }) });
  const j = await r.json(); if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 300)); return j.data;
}
async function agg(dims, filter, limit = 5000) {
  const q = `query($accountTag:String!,$filter:AccountHttpRequestsAdaptiveGroupsFilter_InputObject,$limit:uint64!){
    viewer{ accounts(filter:{accountTag:$accountTag}){
      httpRequestsAdaptiveGroups(filter:$filter,limit:$limit){ count ${dims.length ? `dimensions{ ${dims.join(' ')} }` : ''} }}}}`;
  const d = await gq(q, { accountTag: ACC, filter, limit });
  const g = d.viewer.accounts[0].httpRequestsAdaptiveGroups;
  return Array.isArray(g) ? g : [];
}
const DAYS = ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18'];
const out = {};
for (const day of DAYS) {
  const from = Date.parse(day + 'T00:00:00Z');
  const base = { datetime_geq: day + 'T00:00:00Z', datetime_lt: new Date(from + 864e5).toISOString(),
                 clientRequestHTTPHost_in: ['examanet.com', 'www.examanet.com'] };
  const total = (await agg(['edgeResponseStatus'], base)).reduce((a, g) => a + g.count, 0);
  const rum = (await agg(['edgeResponseStatus'], { ...base, clientRequestPath: '/cdn-cgi/rum' })).reduce((a, g) => a + g.count, 0);
  const eh = await agg(['userAgent'], base);
  const byUA = {}; let ehTotal = 0;
  for (const g of eh) {
    const ua = g.dimensions.userAgent || '(vide)';
    if (/early hints/i.test(ua)) { byUA[ua] = (byUA[ua] || 0) + g.count; ehTotal += g.count; }
  }
  out[day] = { total, rum, earlyHints: ehTotal, byUA };
  console.log(`${day}: total=${total}  RUM(pageloads JS)=${rum}  earlyHints=${ehTotal} (${(100*ehTotal/total).toFixed(1)}%)  ${JSON.stringify(byUA)}`);
}
fs.writeFileSync('output/traffic-rum-earlyhints-2026-11-15-18.json', JSON.stringify(out, null, 2));
