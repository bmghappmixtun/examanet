/**
 * Storage helper for CF Workers + D1 deployment.
 *
 * Production: files go to R2 (PDFS_BUCKET). The fileUrl points to our
 * /api/file/{key} proxy so the browser never sees a Vercel Blob URL.
 * Legacy Vercel Blob URLs (from before migration) are still served via
 * the same proxy, falling back to Vercel Blob when R2 doesn't have the file.
 *
 * Development: local filesystem (./public/uploads).
 */
import { promises as fs } from 'fs';
import path from 'path';

const IS_VERCEL = process.env.VERCEL === '1';
const R2_PUBLIC_PREFIX = '/api/file/';

export async function uploadFile(
  filename: string,
  data: Buffer | Blob,
  contentType = 'application/pdf',
): Promise<{ url: string; key: string }> {
  // Production: R2 (CF Workers). fileUrl is the public proxy.
  if (IS_VERCEL) {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const bucket = (ctx as any).env.PDFS_BUCKET as R2Bucket | undefined;
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
  // If it's a proxy URL, extract the key
  if (keyOrUrl.startsWith(R2_PUBLIC_PREFIX)) {
    const key = keyOrUrl.slice(R2_PUBLIC_PREFIX.length);
    if (IS_VERCEL) {
      const { getCloudflareContext } = await import('@opennextjs/cloudflare');
      const ctx = await getCloudflareContext({ async: true });
      const bucket = (ctx as any).env.PDFS_BUCKET as R2Bucket | undefined;
      if (bucket) {
        try {
          await bucket.delete(key);
        } catch {}
      }
    }
    return;
  }
  // Legacy Vercel Blob delete (best-effort, won't work without @vercel/blob)
  // We no longer use Vercel Blob, so this is a no-op.
  if (keyOrUrl.startsWith('http')) {
    return;
  }
  // Local delete
  try {
    const uploadDir = process.env.UPLOAD_DIR || './public/uploads';
    await fs.unlink(path.join(uploadDir, path.basename(keyOrUrl)));
  } catch {}
}
