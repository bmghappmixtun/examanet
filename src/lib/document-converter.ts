// @ts-nocheck
/**
 * Document conversion utilities
 *
 * Converts .docx (and other Office formats) to PDF for the teacher library
 * and the "ajouter une ressource" flow.
 *
 * Conversion chain (only 2 providers):
 *   1. iLoveAPI   — high quality, hosted LibreOffice (plan A)
 *   2. APIConvert — free tier fallback (plan B)
 *
 * API keys are read from the ApiProvider table (encrypted) first, then
 * fall back to env vars. Each conversion is logged to ApiProviderUsage
 * so the admin can see usage stats.
 *
 * To configure via env vars (legacy):
 *   - I_LOVE_API_PUBLIC_KEY + I_LOVE_API_SECRET_KEY
 *   - APICONVERT_API_KEY
 *
 * To configure via admin UI: see /admin/fournisseurs
 */

import { convertOfficeToPdfViaIloveapi, IloveapiError } from './iloveapi';
import { convertOfficeToPdfViaConvertApi, ApiconvertError } from './apiconvert';
import { prisma } from './prisma';
import { decryptSecret } from './provider-keys';

export type ConversionResult = {
  pdfBuffer?: Buffer;
  pdfSize?: number;
  warnings: string[];
  provider: 'iloveapi' | 'apiconvert' | 'none' | 'failed';
};

async function getProviderConfig(providerName: string): Promise<{
  publicKey?: string;
  secretKey?: string;
  apiUrl?: string;
} | null> {
  // 1. Try DB first
  try {
    const dbProvider = await prisma.apiProvider.findUnique({
      where: { provider: providerName },
    });
    if (dbProvider && dbProvider.enabled && dbProvider.secretKey) {
      return {
        publicKey: dbProvider.publicKey || undefined,
        secretKey: decryptSecret(dbProvider.secretKey),
        apiUrl: dbProvider.apiUrl || undefined,
      };
    }
  } catch (e) {
    console.warn(`[document-converter] Could not read provider ${providerName} from DB:`, e);
  }

  // 2. Fall back to env vars
  if (providerName === 'iloveapi') {
    const publicKey = process.env.I_LOVE_API_PUBLIC_KEY;
    const secretKey = process.env.I_LOVE_API_SECRET_KEY || process.env.I_LOVE_API_KEY;
    if (publicKey && secretKey) {
      return { publicKey, secretKey };
    }
  } else if (providerName === 'apiconvert') {
    const secretKey = process.env.APICONVERT_API_KEY;
    if (secretKey) {
      return { secretKey, apiUrl: process.env.APICONVERT_API_URL };
    }
  }

  return null;
}

async function logUsage(
  providerName: string,
  fileName: string,
  fileSize: number,
  success: boolean,
  failedStep?: string,
) {
  try {
    const provider = await prisma.apiProvider.findUnique({
      where: { provider: providerName },
    });
    // Only log if the provider is configured in the DB
    if (!provider) return;
    const now = new Date();
    await prisma.apiProviderUsage.create({
      data: {
        providerId: provider.id,
        success,
        fileName,
        fileSize,
        failedStep: failedStep || null,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
      },
    });
  } catch (e) {
    // Non-fatal: don't break the conversion flow if logging fails
    console.warn('[document-converter] Could not log usage:', e);
  }
}

/**
 * Convert a .docx buffer to a PDF
 * Tries providers in order until one succeeds
 */
export async function convertDocxToPdf(
  fileBuffer: Buffer,
  options: {
    fileName?: string;
    title?: string;
    author?: string;
  } = {},
): Promise<ConversionResult> {
  const warnings: string[] = [];
  const fileName = options.fileName || 'document.docx';
  const fileSize = fileBuffer.length;

  // Defensive check: skip PDF files (no conversion needed)
  if (fileName) {
    const fmt = detectFormat(fileName);
    if (fmt.isPdf) {
      return { warnings, provider: 'none' };
    }
  }

  // ============== PLAN A: iLoveAPI ==============
  const iloveConfig = await getProviderConfig('iloveapi');
  if (iloveConfig?.publicKey && iloveConfig?.secretKey) {
    try {
      const result = await convertOfficeToPdfViaIloveapi(
        fileBuffer,
        fileName,
        iloveConfig.publicKey,
        iloveConfig.secretKey,
      );
      await logUsage('iloveapi', fileName, fileSize, true);
      return {
        pdfBuffer: result.pdfBuffer,
        pdfSize: result.pdfSize,
        warnings: [...warnings, ...result.warnings],
        provider: 'iloveapi',
      };
    } catch (err) {
      let msg = 'Erreur inconnue';
      let step = 'unknown';
      if (err instanceof IloveapiError) {
        msg = `iLoveAPI (${err.step}): ${err.message}`;
        step = err.step;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      console.warn('[document-converter] iLoveAPI failed, falling back to APIConvert:', msg);
      warnings.push(`iLoveAPI indisponible (${msg}). Plan B (APIConvert) activé.`);
      await logUsage('iloveapi', fileName, fileSize, false, step);
    }
  } else {
    warnings.push('iLoveAPI non configuré.');
  }

  // ============== PLAN B: APIConvert ==============
  const apiconvertConfig = await getProviderConfig('apiconvert');
  if (apiconvertConfig?.secretKey) {
    try {
      const result = await convertOfficeToPdfViaConvertApi(
        fileBuffer,
        fileName,
        apiconvertConfig.secretKey,
      );
      await logUsage('apiconvert', fileName, fileSize, true);
      return {
        pdfBuffer: result.pdfBuffer,
        pdfSize: result.pdfSize,
        warnings: [...warnings, ...result.warnings],
        provider: 'apiconvert',
      };
    } catch (err) {
      let msg = 'Erreur inconnue';
      let step = 'unknown';
      if (err instanceof ApiconvertError) {
        msg = `APIConvert (${err.step}): ${err.message}`;
        step = err.step;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      console.error('[document-converter] APIConvert failed:', err);
      warnings.push(`APIConvert indisponible (${msg}).`);
      await logUsage('apiconvert', fileName, fileSize, false, step);
    }
  } else {
    warnings.push('APIConvert non configuré.');
  }

  // ============== Aucun provider n'a fonctionné ==============
  warnings.push(
    'Aucun service de conversion PDF disponible. Le fichier original (.docx) est sauvegardé dans votre bibliothèque. Vous pouvez le re-uploader en PDF manuellement depuis /enseignant/bibliotheque.',
  );
  return { warnings, provider: 'failed' };
}

/**
 * Detect file format from name or mime type
 */
export function detectFormat(
  filename: string,
  mimeType?: string,
): {
  format: 'pdf' | 'docx' | 'doc' | 'odt' | 'rtf' | 'pptx' | 'ppt' | 'xlsx' | 'xls' | 'unknown';
  isConvertible: boolean;
  isPdf: boolean;
} {
  const ext = filename.toLowerCase().split('.').pop() || '';

  if (ext === 'pdf' || mimeType === 'application/pdf') {
    return { format: 'pdf', isConvertible: false, isPdf: true };
  }
  if (
    ext === 'docx' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return { format: 'docx', isConvertible: true, isPdf: false };
  }
  if (ext === 'doc' || mimeType === 'application/msword') {
    return { format: 'doc', isConvertible: true, isPdf: false };
  }
  if (ext === 'odt' || mimeType === 'application/vnd.oasis.opendocument.text') {
    return { format: 'odt', isConvertible: true, isPdf: false };
  }
  if (ext === 'rtf' || mimeType === 'application/rtf') {
    return { format: 'rtf', isConvertible: true, isPdf: false };
  }
  if (
    ext === 'pptx' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) {
    return { format: 'pptx', isConvertible: true, isPdf: false };
  }
  if (ext === 'ppt' || mimeType === 'application/vnd.ms-powerpoint') {
    return { format: 'ppt', isConvertible: true, isPdf: false };
  }
  if (
    ext === 'xlsx' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return { format: 'xlsx', isConvertible: true, isPdf: false };
  }
  if (ext === 'xls' || mimeType === 'application/vnd.ms-excel') {
    return { format: 'xls', isConvertible: true, isPdf: false };
  }
  return { format: 'unknown', isConvertible: false, isPdf: false };
}
