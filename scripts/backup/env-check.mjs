#!/usr/bin/env node
/**
 * Examanet Environment Variable Health Check
 *
 * Verifies that all required env vars are set, with format checks.
 * Run before deploy to catch missing config.
 *
 * Usage: node scripts/backup/env-check.mjs [--strict]
 *
 * Auto-loads .env, .env.local (local wins).
 *
 * Exit code:
 *   0 = all required vars OK
 *   1 = at least one required var missing or malformed
 */

import fs from 'fs';
import path from 'path';

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
}
loadEnv('.env');
loadEnv('.env.local');

const SECRET_VARS = [
  {
    name: 'DATABASE_URL',
    required: true,
    pattern: /^postgres(ql)?:\/\//,
    hint: 'PostgreSQL connection string',
  },
  { name: 'NEXTAUTH_URL', required: true, pattern: /^https?:\/\//, hint: 'Public site URL' },
  { name: 'NEXTAUTH_SECRET', required: true, minLength: 32, hint: 'openssl rand -base64 32' },
  {
    name: 'BLOB_READ_WRITE_TOKEN',
    required: false,
    pattern: /^vercel_blob_/,
    hint: 'Vercel Blob token',
  },
  { name: 'RESEND_API_KEY', required: false, pattern: /^re_/, hint: 'Resend API key' },
  {
    name: 'NEXT_PUBLIC_SITE_URL',
    required: true,
    pattern: /^https?:\/\//,
    hint: 'Public site URL',
  },
  // R2 backup (off-site blob backup)
  { name: 'R2_ACCOUNT_ID', required: false, hint: 'Cloudflare account ID' },
  { name: 'R2_ACCESS_KEY_ID', required: false, hint: 'R2 access key (32 chars)' },
  { name: 'R2_SECRET_ACCESS_KEY', required: false, hint: 'R2 secret key' },
  { name: 'R2_BUCKET', required: false, hint: 'R2 bucket name (e.g. examanet-blob-backup)' },
];

let hasError = false;

console.log('═══════════════════════════════════════════════════════');
console.log('  EXAMANET — ENV VARS HEALTH CHECK');
console.log('═══════════════════════════════════════════════════════\n');

for (const { name, required, pattern, minLength, hint } of SECRET_VARS) {
  const value = process.env[name];
  const status = value ? '✅' : required ? '❌' : '⚠️ ';
  const type = required ? 'required' : 'optional';

  let detail = '';
  if (!value) {
    if (required) hasError = true;
  } else if (pattern && !pattern.test(value)) {
    detail = ` ⚠️  doesn't match ${pattern}`;
    if (required) hasError = true;
  } else if (minLength && value.length < minLength) {
    detail = ` ⚠️  too short (${value.length} < ${minLength})`;
    if (required) hasError = true;
  } else {
    detail = ` (${value.length} chars)`;
  }

  console.log(`  ${status} ${name.padEnd(28)} ${type.padEnd(10)} ${detail}`);
  if (!value && hint) console.log(`      hint: ${hint}`);
}

console.log('\n═══════════════════════════════════════════════════════');

// Check R2 backup status
const r2Vars = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
const r2Set = r2Vars.filter((v) => process.env[v]);
if (r2Set.length === 0) {
  console.log('  ☁️  R2 backup: NOT CONFIGURED (Vercel Blob has no off-site backup)');
  console.log('     → See docs/operations/blob-r2-backup.md to enable');
} else if (r2Set.length < r2Vars.length) {
  console.log(`  ☁️  R2 backup: PARTIAL (${r2Set.length}/${r2Vars.length} vars set)`);
  console.log('     → Missing: ' + r2Vars.filter((v) => !process.env[v]).join(', '));
} else {
  console.log('  ☁️  R2 backup: CONFIGURED ✅');
}

if (hasError) {
  console.log('\n  ❌ FAILED — fix missing/malformed vars above');
  console.log('  📖 See docs/operations/env-vars.md for full list');
  process.exit(1);
} else {
  console.log('  ✅ PASSED — all required vars are set');
  process.exit(0);
}
