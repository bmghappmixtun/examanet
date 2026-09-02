/**
 * Encryption helper for storing API provider secrets in the database
 *
 * Uses AES-256-GCM with a key derived from PROVIDER_KEY_ENCRYPTION_KEY env var.
 * The encryption key should be a long random string (32+ chars).
 *
 * In dev (no env var), uses a deterministic dev-only key (NOT for production).
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const SALT = 'examanet-provider-keys-v1';

function getKey(): Buffer {
  const secret =
    process.env.PROVIDER_KEY_ENCRYPTION_KEY ||
    process.env.NEXTAUTH_SECRET ||
    'dev-only-key-please-set-PROVIDER_KEY_ENCRYPTION_KEY-in-production';
  return scryptSync(secret, SALT, 32);
}

export function encryptSecret(plain: string): string {
  if (!plain) return '';
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: base64(iv) . base64(tag) . base64(ciphertext)
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
  if (!payload) return '';
  try {
    const [ivB64, tagB64, dataB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !dataB64) return '';
    const key = getKey();
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const decipher = createDecipheriv(ALG, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return '';
  }
}

/** Redact a secret for display: only show first 4 and last 2 chars */
export function redactSecret(plain: string): string {
  if (!plain) return '';
  if (plain.length <= 8) return '••••••••';
  return `${plain.slice(0, 4)}${'•'.repeat(Math.max(4, plain.length - 6))}${plain.slice(-2)}`;
}
