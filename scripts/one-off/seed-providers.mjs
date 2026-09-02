/**
 * One-off script to seed the iLoveAPI provider into the DB
 *
 * Run: node -r dotenv/config -e "require('dotenv').config({path:'.env.local',override:true}); import('./scripts/one-off/seed-providers.mjs')"
 *
 * Reads the iLoveAPI keys from .vercel/.env.development.local (local dev file)
 * and inserts them as the iLoveAPI provider.
 */

import { PrismaClient } from '@prisma/client';
import { createCipheriv, randomBytes, scryptSync } from 'crypto';

const prisma = new PrismaClient();

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const SALT = 'examanet-provider-keys-v1';

function getKey() {
  const secret =
    process.env.PROVIDER_KEY_ENCRYPTION_KEY ||
    process.env.NEXTAUTH_SECRET ||
    'dev-only-key-please-set-PROVIDER_KEY_ENCRYPTION_KEY-in-production';
  return scryptSync(secret, SALT, 32);
}

function encryptSecret(plain) {
  if (!plain) return '';
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

const PUBLIC_KEY = 'project_public_d1448365692fd5dee0aa5e617dc877a3_oZ7Rs0e163492d3ce295974b66731db65ce9c';
const SECRET_KEY = 'secret_key_5090a237520cd8bf28007277b0a8eaae_wePIX80644e3e7875908c7d17221d417f8cf5';

const encrypted = encryptSecret(SECRET_KEY);

const existing = await prisma.apiProvider.findUnique({ where: { provider: 'iloveapi' } });
if (existing) {
  console.log('iLoveAPI already exists, updating...');
  await prisma.apiProvider.update({
    where: { id: existing.id },
    data: {
      publicKey: PUBLIC_KEY,
      secretKey: encrypted,
      enabled: true,
      monthlyQuota: 2500,
      displayName: 'iLoveAPI (Lite - 2 500 crédits/mois)',
      notes: 'Compte iLoveAPI - plan Lite',
    },
  });
  console.log('✅ iLoveAPI updated');
} else {
  await prisma.apiProvider.create({
    data: {
      provider: 'iloveapi',
      publicKey: PUBLIC_KEY,
      secretKey: encrypted,
      enabled: true,
      monthlyQuota: 2500,
      displayName: 'iLoveAPI (Lite - 2 500 crédits/mois)',
      notes: 'Compte iLoveAPI - plan Lite',
    },
  });
  console.log('✅ iLoveAPI created');
}

await prisma.$disconnect();
