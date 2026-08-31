/**
 * Storage helper for Examanet.
 *
 *  - Production (CF Workers + D1 deployment): R2 (PDFS_BUCKET) is the
 *    storage backend. The fileUrl is `/api/file/{key}` (proxied through
 *    our Worker so the browser never sees a third-party URL).
 *  - Local dev: ./public/uploads.
 *
 * We DO NOT use Vercel Blob anymore. New uploads go straight to R2.
 * Legacy Vercel Blob URLs are still served (read-only) via the same proxy
 * (`/api/file/` falls back to Vercel Blob when R2 doesn't have the file).
 */
import { promises as fs } from 'fs';
import path from 'path';

const R2_PUBLIC_PREFIX = '/api/file/';

/**
 * Detect whether we are running on CF Workers (i.e. R2 is available).
 * We try to read the PDFS_BUCKET binding via getCloudflareContext. If it
 * resolves to a bucket, we're on Workers. If it throws (no binding, dev
 * mode, Node), we're on local dev.
 *
 * Cached after first call — the answer doesn't change at runtime.
 */
let isWorkersCache: boolean | null = null;
async function isWorkers(): Promise<boolean> {
  if (isWorkersCache !== null) return isWorkersCache;
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const bucket = (ctx as any)?.env?.PDFS_BUCKET;
    isWorkersCache = Boolean(bucket);
  } catch {
    isWorkersCache = false;
  }
  return isWorkersCache;
}

export async function uploadFile(
  filename: string,
  data: Buffer | Blob,
  contentType = 'application/pdf',
): Promise<{ url: string; key: string }> {
  // Production: R2 (CF Workers). fileUrl is the public proxy.
  if (await isWorkers()) {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const bucket = (ctx as any).env.PDFS_BUCKET as R2Bucket;
    if (!bucket) {
      throw new Error('R2 bucket (PDFS_BUCKET) is not configured');
    }
    const arrayBuffer = data instanceof Blob ? await data.arrayBuffer() : data;
    await bucket.put(filename, arrayBuffer, {
      httpMetadata: { contentType },
    });
    return { url: `${R2_PUBLIC_PREFIX}${filename}`, key: filename };
  }

  // Dev: local filesystem
  const uploadDir = process.env.UPLOAD_DIR || './public/uploads';
  await fs.mkdir(uploadDir, { recursive: true });
  const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const uniqueName = `${Date.now()}-${safeName}`;
  const filepath = path.join(uploadDir, uniqueName);
  const buffer = data instanceof Blob ? Buffer.from(await data.arrayBuffer()) : data;
  await fs.writeFile(filepath, buffer);
  return { url: `/uploads/${uniqueName}`, key: uniqueName };
}

export async function deleteFile(keyOrUrl: string): Promise<void> {
  // If it's a proxy URL, extract the key and delete from R2
  if (keyOrUrl.startsWith(R2_PUBLIC_PREFIX)) {
    const key = keyOrUrl.slice(R2_PUBLIC_PREFIX.length);
    if (await isWorkers()) {
      try {
        const { getCloudflareContext } = await import('@opennextjs/cloudflare');
        const ctx = await getCloudflareContext({ async: true });
        const bucket = (ctx as any).env.PDFS_BUCKET as R2Bucket | undefined;
        if (bucket) {
          await bucket.delete(key);
        }
      } catch {
        // ignore — best effort
      }
    }
    return;
  }
  // Legacy Vercel Blob URL — we no longer delete from Vercel Blob.
  // The file is still served read-only via /api/file/ (Vercel Blob fallback).
  if (keyOrUrl.startsWith('http')) {
    return;
  }
  // Local file delete (dev)
  try {
    const uploadDir = process.env.UPLOAD_DIR || './public/uploads';
    await fs.unlink(path.join(uploadDir, path.basename(keyOrUrl)));
  } catch {}
}
