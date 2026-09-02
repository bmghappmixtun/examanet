/**
 * Safe localStorage / sessionStorage wrappers.
 *
 * WHY THIS EXISTS:
 * Some browsers (Safari private mode, third-party iframe contexts, and any
 * context where cookies/site data are disabled) throw a SecurityError when
 * `window.localStorage` is accessed. The error is thrown at the PROPERTY
 * access level — not at `.getItem()` — so a plain `try { localStorage.getItem }`
 * catches it, but the original code in `I18nProvider` and `ViewToggle` did
 * NOT wrap the access in try/catch, producing recurring client errors:
 *
 *   Failed to read the 'localStorage' property from 'Window':
 *   Access is denied for this document.
 *
 * (Reproduced as ERR-3EU598 in the 2026-07-29 nightly digest on
 * /ressources/srie-dexercices-…-y5KLEG and likely also contributes to
 * the React #418/#422 hydration errors on /ressources and
 * /professeurs/302/zouaoui-, because an uncaught error in a client
 * provider during initial mount can break React's hydration.)
 *
 * USAGE:
 *   import { safeGetItem, safeSetItem, safeRemoveItem } from '@/lib/safeStorage';
 *
 *   const value = safeGetItem('key');             // string | null
 *   safeSetItem('key', 'value');                  // boolean (true = stored)
 *   safeRemoveItem('key');                        // boolean
 *
 * All functions are no-ops when:
 *   - running on the server (typeof window === 'undefined')
 *   - localStorage itself is unavailable or throws on access
 *   - the storage quota is exceeded
 *
 * They never throw, never log, and always return a sensible default.
 */

const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

function tryStorage<T>(fn: (s: Storage) => T, fallback: T): T {
  if (!isBrowser) return fallback;
  try {
    return fn(window.localStorage);
  } catch {
    return fallback;
  }
}

export function safeGetItem(key: string): string | null {
  return tryStorage<string | null>((s) => s.getItem(key), null);
}

export function safeSetItem(key: string, value: string): boolean {
  return tryStorage<boolean>((s) => {
    s.setItem(key, value);
    return true;
  }, false);
}

export function safeRemoveItem(key: string): boolean {
  return tryStorage<boolean>((s) => {
    s.removeItem(key);
    return true;
  }, false);
}

/**
 * Read a JSON value from localStorage. Returns `null` if the key is missing,
 * the value is not valid JSON, or localStorage is unavailable.
 */
export function safeGetJSON<T>(key: string): T | null {
  const raw = safeGetItem(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Write a JSON value to localStorage. Returns true on success, false on
 * quota error or unavailable storage.
 */
export function safeSetJSON<T>(key: string, value: T): boolean {
  try {
    return safeSetItem(key, JSON.stringify(value));
  } catch {
    return false;
  }
}
