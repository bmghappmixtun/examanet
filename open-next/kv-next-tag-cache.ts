/**
 * Cache de tags ISR — override Cloudflare KV.
 *
 * 2026-11-15 : correction de la cause racine des erreurs « KVNextModeTagCache ».
 *
 * L'implémentation d'OpenNext (`@opennextjs/cloudflare` 1.15.1) fait :
 *
 *     const result = await kv.get(keys, { type: 'json' });
 *
 * Or l'API Workers KV impose **100 clés maximum par bulk-get** :
 * au-delà, l'appel échoue avec « KV GET_BULK failed: 400 You can request a
 * maximum of 100 keys ». L'exception était avalée par un try/catch qui
 * journalisait une stack sans message (donc invisible dans l'observabilité CF),
 * et `hasBeenRevalidated` repartait de zéro → le cache de données était
 * considéré périmé → rendu à froid à chaque requête (coût + alertes perf).
 *
 * Deux corrections ici :
 *
 * 1. Le bulk-get est **découpé en lots de 100 clés maximum** (plus de crash).
 * 2. Les **deux formats de valeur** sont acceptés :
 *    - nombre (format historique, écrit par OpenNext < 1.19) ;
 *    - objet `{ revalidatedAt, stale, expire }` (format OpenNext >= 1.19).
 *    L'ancien code faisait `Math.max(...valeurs)` → avec un objet dans le lot,
 *    le résultat était `NaN` → le cache de tags se croyait toujours périmé.
 *
 * Le reste du comportement est aligné sur OpenNext >= 1.20.
 */
import { error } from '@opennextjs/aws/adapters/logger.js';
import type { NextModeTagCache } from '@opennextjs/aws/types/overrides.js';

import { getCloudflareContext } from '@opennextjs/cloudflare';
import { debugCache, FALLBACK_BUILD_ID } from '@opennextjs/cloudflare/overrides/internal';

export const NAME = 'kv-next-mode-tag-cache';
export const BINDING_NAME = 'NEXT_TAG_CACHE_KV';

/** Limite Workers KV : nombre maximal de clés par bulk-get. */
const MAX_KEYS_PER_BULK_GET = 100;
/** Limite Workers KV : longueur maximale d'une clé (512 octets). */
const MAX_KEY_LENGTH = 512;
/** Seuil sûr (octets UTF-8) au-delà duquel la clé est dérivée par hachage. */
const MAX_KEY_BYTES = 480;

/** Longueur d'une chaîne en OCTETS UTF-8 (la limite KV compte des octets). */
function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** Empreinte stable 64 bits (FNV-1a x2, sans dépendance). */
function stableHash(value: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/** Format historique (OpenNext < 1.19) : un simple timestamp en ms. */
type TagValueNumber = number;
/** Format OpenNext >= 1.19. */
type TagValueObject = {
  revalidatedAt: number;
  stale?: number | null;
  expire?: number | null;
};
type TagValue = TagValueNumber | TagValueObject;

function getRevalidatedAt(value: TagValue): number {
  return typeof value === 'number' ? value : (value?.revalidatedAt ?? 0);
}

function getExpire(value: TagValue): number | null {
  return typeof value === 'number' ? null : (value?.expire ?? null);
}

export class KVNextModeTagCache implements NextModeTagCache {
  readonly mode = 'nextMode' as const;
  readonly name = NAME;

  async getLastRevalidated(tags: string[]): Promise<number> {
    const timeMs = await this.#getLastRevalidated(tags);
    debugCache('KVNextModeTagCache', `getLastRevalidated tags=${tags.length} -> time=${timeMs}`);
    return timeMs;
  }

  async #getLastRevalidated(tags: string[]): Promise<number> {
    const kv = this.getKv();
    if (!kv || tags.length === 0) return 0;

    try {
      const values = await this.#resolveTagValues(tags, kv);
      const revalidations = [...values.values()]
        .filter((v): v is TagValue => v != null)
        .map(getRevalidatedAt)
        .filter((n) => Number.isFinite(n));
      return revalidations.length === 0 ? 0 : Math.max(...revalidations);
    } catch (e) {
      // On ne casse jamais le rendu : on journalise un message lisible
      // (l'observabilité Cloudflare ne conserve que le 1er argument).
      error(
        `KVNextModeTagCache: lecture impossible (${tags.length} tags) - ${
          e instanceof Error ? e.message : String(e)
        }`
      );
      return 0;
    }
  }

  async hasBeenRevalidated(tags: string[], lastModified?: number): Promise<boolean> {
    const kv = this.getKv();
    if (!kv || tags.length === 0) return false;
    try {
      const now = Date.now();
      const values = await this.#resolveTagValues(tags, kv);
      const revalidated = [...values.values()].some((v) => {
        if (v == null) return false;
        const expire = getExpire(v);
        if (expire != null) return expire <= now && expire > (lastModified ?? 0);
        return getRevalidatedAt(v) > (lastModified ?? now);
      });
      debugCache(
        'KVNextModeTagCache',
        `hasBeenRevalidated tags=${tags.length} lastModified=${lastModified} -> ${revalidated}`
      );
      return revalidated;
    } catch (e) {
      error(
        `KVNextModeTagCache: vérification impossible (${tags.length} tags) - ${
          e instanceof Error ? e.message : String(e)
        }`
      );
      return false;
    }
  }

  async writeTags(tags: string[]): Promise<void> {
    const kv = this.getKv();
    if (!kv || tags.length === 0) return;

    const nowMs = Date.now();
    const entries: { key: string; value: string }[] = [];
    let skipped = 0;
    for (const tag of tags) {
      const key = this.getCacheKey(tag);
      // Une clé > 512 octets est rejetée par l'API KV : on l'ignore
      // proprement plutôt que de faire échouer l'écriture du lot.
      if (key.length > MAX_KEY_LENGTH) {
        skipped++;
        continue;
      }
      entries.push({ key, value: String(nowMs) });
    }
    if (skipped > 0) {
      error(
        `KVNextModeTagCache: ${skipped} tag(s) ignoré(s) — clé > ${MAX_KEY_LENGTH} octets`
      );
    }

    // Écriture par lots de 100 (limite d'opérations externes par invocation).
    for (let i = 0; i < entries.length; i += MAX_KEYS_PER_BULK_GET) {
      const batch = entries.slice(i, i + MAX_KEYS_PER_BULK_GET);
      await Promise.all(batch.map((e) => kv.put(e.key, e.value)));
    }
    debugCache('KVNextModeTagCache', `writeTags tags=${tags.length} time=${nowMs}`);
  }

  /**
   * Lit les valeurs des tags, par lots de 100 clés maximum.
   * Retourne une Map tag → valeur (null si la clé n'existe pas).
   */
  async #resolveTagValues(
    tags: string[],
    kv: KVNamespace
  ): Promise<Map<string, TagValue | null>> {
    const result = new Map<string, TagValue | null>();
    const kvKeys = tags.map((tag) => this.getCacheKey(tag));

    for (let i = 0; i < kvKeys.length; i += MAX_KEYS_PER_BULK_GET) {
      const batch = kvKeys.slice(i, i + MAX_KEYS_PER_BULK_GET);
      const fetched = await kv.get(batch, { type: 'json' });
      for (const key of batch) {
        result.set(key, (fetched.get(key) as TagValue | null | undefined) ?? null);
      }
    }
    return result;
  }

  getKv(): KVNamespace | undefined {
    const kv = getCloudflareContext().env[BINDING_NAME] as KVNamespace | undefined;
    if (!kv) {
      error(`No KV binding ${BINDING_NAME} found`);
      return undefined;
    }
    const isDisabled = Boolean((globalThis as any).openNextConfig?.dangerous?.disableTagCache);
    return isDisabled ? undefined : kv;
  }

  getCacheKey(key: string): string {
    const base = `${this.getBuildId()}/${key}`.replaceAll('//', '/');
    // Un tag long (slug UTF-8 double-encodé → chemin > 485 caractères) donne
    // une clé > 512 octets : le bulk-get KV échoue en 414 et l'ENTIER lot de
    // tags est perdu ⇒ cache toujours périmé. On dérive une clé stable par
    // hachage au lieu d'abandonner ces tags.
    if (byteLength(base) > MAX_KEY_BYTES) {
      return `${this.getBuildId()}/h${stableHash(base)}`;
    }
    return base;
  }

  getBuildId(): string {
    return process.env.NEXT_BUILD_ID ?? FALLBACK_BUILD_ID;
  }
}

export default new KVNextModeTagCache();
