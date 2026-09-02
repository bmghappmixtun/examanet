/**
 * iLoveAPI (iLovePDF) integration for Word → PDF conversion
 *
 * Uses the official @ilovepdf/ilovepdf-nodejs SDK which handles all the
 * JWT auth, multipart upload, and download flows correctly.
 *
 * Free tier: 250 documents/month
 * API docs: https://developer.ilovepdf.com/
 *
 * Required env vars:
 *   I_LOVE_API_PUBLIC_KEY  (project_public_...)
 *   I_LOVE_API_SECRET_KEY  (secret_key_...)
 *
 * The SDK uses both keys to sign JWTs locally (no extra /auth call needed).
 */

import ILovePDFApi from '@ilovepdf/ilovepdf-nodejs';
// @ts-ignore - the package exports the file class as default
import ILovePDFFile from '@ilovepdf/ilovepdf-nodejs/ILovePDFFile';

export type ConversionResult = {
  pdfBuffer?: Buffer;
  pdfSize?: number;
  warnings: string[];
  provider: 'iloveapi' | 'none' | 'failed';
};

export class IloveapiError extends Error {
  constructor(
    message: string,
    public step: 'start' | 'upload' | 'process' | 'download' = 'start',
    public status?: number,
  ) {
    super(message);
    this.name = 'IloveapiError';
  }
}

/**
 * Convert an Office document (.docx, .doc, .odt, .pptx, .xlsx) to PDF
 * Uses the official iLovePDF SDK.
 */
export async function convertOfficeToPdfViaIloveapi(
  fileBuffer: Buffer,
  fileName: string,
  publicKey: string,
  secretKey: string,
): Promise<{ pdfBuffer: Buffer; pdfSize: number; warnings: string[] }> {
  if (!publicKey || !secretKey) {
    throw new IloveapiError(
      'I_LOVE_API_PUBLIC_KEY et I_LOVE_API_SECRET_KEY requis. Configurez-les dans Vercel.',
    );
  }

  const api = new ILovePDFApi(publicKey, secretKey);
  const task = api.newTask('officepdf');

  // 1. Start the task
  try {
    await task.start();
  } catch (e: any) {
    throw new IloveapiError(
      `iLoveAPI start failed: ${e?.message || 'erreur inconnue'}`,
      'start',
      e?.response?.status,
    );
  }

  // 2. Upload the file via the SDK (uses ILovePDFFile.fromArray for buffers)
  let file;
  try {
    file = ILovePDFFile.fromArray(fileBuffer, fileName);
    await task.addFile(file);
  } catch (e: any) {
    throw new IloveapiError(
      `iLoveAPI upload failed: ${e?.message || 'erreur inconnue'}`,
      'upload',
      e?.response?.status,
    );
  }

  // 3. Run the conversion
  try {
    await task.process();
  } catch (e: any) {
    throw new IloveapiError(
      `iLoveAPI process failed: ${e?.message || 'erreur inconnue'}`,
      'process',
      e?.response?.status,
    );
  }

  // 4. Download the converted PDF
  try {
    const data = await task.download();
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (!buffer.subarray(0, 4).toString().startsWith('%PDF')) {
      throw new IloveapiError('iLoveAPI returned non-PDF content', 'download');
    }
    return { pdfBuffer: buffer, pdfSize: buffer.length, warnings: [] };
  } catch (e: any) {
    if (e instanceof IloveapiError) throw e;
    throw new IloveapiError(
      `iLoveAPI download failed: ${e?.message || 'erreur inconnue'}`,
      'download',
      e?.response?.status,
    );
  }
}

/**
 * Quick health check - starts a task then cancels it
 */
export async function checkIloveapiHealth(
  publicKey: string,
  secretKey: string,
): Promise<{ ok: boolean; error?: string; server?: string; remainingFiles?: number }> {
  if (!publicKey || !secretKey) {
    return { ok: false, error: 'Missing public or secret key' };
  }
  try {
    const api = new ILovePDFApi(publicKey, secretKey);
    const task = api.newTask('merge'); // merge is the cheapest (no real work)
    await task.start();
    return {
      ok: true,
      server: (task as any).server,
      remainingFiles: (task as any).remainingFiles,
    };
  } catch (e: any) {
    return {
      ok: false,
      error: e?.message || 'Unknown error',
    };
  }
}
