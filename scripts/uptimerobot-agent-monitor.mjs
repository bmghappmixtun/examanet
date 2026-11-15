#!/usr/bin/env node
/**
 * UptimeRobot — "agent flow" : crée un moniteur HTTPS gratuit (check 5 min,
 * free plan à vie, 50 moniteurs) SANS compte et SANS clé API.
 *
 * 1) GET  /agentic/agent-monitor/challenge?email=&url=
 *      -> { nonce, timestamp, difficulty, signature }
 * 2) PoW : trouver un `counter` tel que SHA-256("<nonce>|<counter>") commence
 *      par `difficulty` bits à zéro.
 * 3) POST /agentic/agent-monitor  { email, url, nonce, timestamp, counter, signature }
 *      -> 200 (toujours 200, pour ne pas révéler l'existence d'un email) ;
 *         seul un PoW faux renvoie 400.
 *
 * Le compte + le moniteur ne sont créés qu'après le clic "Activate" dans l'email
 * de confirmation envoyé au propriétaire.
 *
 * Usage :
 *   node scripts/uptimerobot-agent-monitor.mjs --email=... --url=... [--dry-run]
 */

import crypto from 'node:crypto';

const API = 'https://api.uptimerobot.com';

function parseArgs(argv) {
  const out = { dryRun: false };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      out[k] = v === undefined ? true : v;
    }
  }
  if (out['dry-run'] === true || out['dry-run'] === 'true') out.dryRun = true;
  return out;
}

/** true si le hash commence par `bits` bits à 0 */
function hasLeadingZeroBits(hashHex, bits) {
  const bytes = Buffer.from(hashHex, 'hex');
  const full = bits >> 3;
  const rest = bits & 7;
  for (let i = 0; i < full; i++) {
    if (bytes[i] !== 0) return false;
  }
  if (rest > 0) {
    const mask = (0xff << (8 - rest)) & 0xff;
    if ((bytes[full] & mask) !== 0) return false;
  }
  return true;
}

function solvePoW(nonce, difficulty, maxIter = 500_000_000) {
  for (let counter = 0; counter < maxIter; counter++) {
    const hash = crypto
      .createHash('sha256')
      .update(`${nonce}|${counter}`)
      .digest('hex');
    if (hasLeadingZeroBits(hash, difficulty)) return { counter, hash };
  }
  throw new Error(`PoW non résolue après ${maxIter} itérations`);
}

async function main() {
  const args = parseArgs(process.argv);
  const email = args.email;
  const url = args.url;
  if (!email || !url) {
    console.error('Usage: --email=<email> --url=<url> [--dry-run]');
    process.exit(2);
  }

  const chUrl = `${API}/agentic/agent-monitor/challenge?email=${encodeURIComponent(email)}&url=${encodeURIComponent(url)}`;
  const chRes = await fetch(chUrl, { headers: { accept: 'application/json' } });
  const chText = await chRes.text();
  if (!chRes.ok) {
    console.error(`challenge HTTP ${chRes.status}: ${chText.slice(0, 400)}`);
    process.exit(1);
  }
  const challenge = JSON.parse(chText);
  const { nonce, timestamp, difficulty, signature } = challenge;
  console.log(`challenge: difficulty=${difficulty} nonce=${nonce} ts=${timestamp}`);

  const t0 = Date.now();
  const { counter, hash } = solvePoW(nonce, Number(difficulty));
  console.log(`PoW résolue: counter=${counter} (${Date.now() - t0} ms) hash=${hash.slice(0, 16)}…`);

  if (args.dryRun) {
    console.log('dry-run : rien n’est envoyé.');
    return;
  }

  const payload = { email, url, nonce, timestamp, counter, signature };
  const res = await fetch(`${API}/agentic/agent-monitor`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  console.log(`POST ${API}/agentic/agent-monitor → HTTP ${res.status}`);
  if (res.status !== 200) {
    console.error(`body: ${body.slice(0, 500)}`);
    process.exit(1);
  }
  console.log(
    `✅ Demande envoyée pour ${url}\n   → ${email} doit cliquer "Activate" dans l'email de confirmation.`
  );
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});
