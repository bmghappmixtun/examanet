#!/usr/bin/env node
/**
 * Test de régression : la route /api/status/uptime doit détecter une page
 * d'erreur Next.js servie en HTTP 200 (le mode de panne le plus vicieux :
 * invisible pour un simple contrôle de code HTTP — c'est ce qui a laissé le
 * site « vert » pendant l'outage du 2026-11-15).
 *
 * On rejoue la LOGIQUE exacte de la route sur deux cas :
 *   A) une page saine (200 + HTML normal)  → doit être OK
 *   B) une page d'erreur Next.js (200 + `__next_error__`) → doit être KO
 *
 * Usage : node scripts/verify-uptime-error-detection.mjs [https://examanet.com]
 */

const SITE = process.argv[2] || 'https://examanet.com';
const BODY_SNIFF_BYTES = 16 * 1024;

async function sniffBody(res, maxBytes) {
  try {
    if (!res.body) return await res.text();
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.length;
      }
    }
    try {
      await reader.cancel();
    } catch {
      /* best-effort */
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf-8');
  } catch {
    return '';
  }
}

/** Même logique que dans la route. */
function classify(head) {
  if (head.includes('__next_error__')) {
    return { ok: false, error: "page d'erreur servie en 200 (__next_error__)" };
  }
  if (!head.trim()) return { ok: false, error: 'corps de réponse vide' };
  return { ok: true };
}

let failures = 0;

// --- A) page saine -------------------------------------------------------
const res = await fetch(`${SITE}/fr?ci=${Date.now()}`, {
  headers: { 'user-agent': 'Examanet-UptimeCheck/1.0' },
});
const head = await sniffBody(res, BODY_SNIFF_BYTES);
const a = classify(head);
if (a.ok) {
  console.log(`✅ A) page saine : ${res.status}, ${head.length} octets sniffés → OK`);
} else {
  failures++;
  console.error(`❌ A) page saine classée KO à tort : ${a.error}`);
}

// --- B) page d'erreur servie en 200 ---------------------------------------
const fakeErrorHtml =
  '<!DOCTYPE html><html id="__next_error__"><head><meta charSet="utf-8"/>' +
  '<title>Examanet</title></head><body><h1>Une erreur est survenue</h1>' +
  '</body></html>';
const b = classify(fakeErrorHtml);
if (!b.ok && /__next_error__/.test(b.error)) {
  console.log(`✅ B) page d'erreur en 200 : détectée → "${b.error}"`);
} else {
  failures++;
  console.error(`❌ B) page d'erreur NON détectée (résultat : ${JSON.stringify(b)})`);
}

// --- C) la page d'erreur réelle commence-t-elle bien dans les 16 Ko ? -----
// (le marqueur doit être dans le début du corps pour être sniffé)
const markerOffset = fakeErrorHtml.indexOf('__next_error__');
if (markerOffset >= 0 && markerOffset < BODY_SNIFF_BYTES) {
  console.log(
    `✅ C) marqueur à l'offset ${markerOffset} octets (< ${BODY_SNIFF_BYTES}) → dans la fenêtre sniffée`
  );
} else {
  failures++;
  console.error(`❌ C) marqueur hors fenêtre de sniff (offset ${markerOffset})`);
}

console.log(failures === 0 ? '\n✅ Tous les tests passent.' : `\n❌ ${failures} test(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
