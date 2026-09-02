/**
 * APIConvert integration for Office → PDF conversion (plan B)
 *
 * Used as the fallback converter when iLoveAPI (plan A) is not configured
 * or fails. APIConvert is a hosted file conversion service backed by
 * LibreOffice — same quality as iLoveAPI.
 *
 * Required env var:
 *   APICONVERT_API_KEY  (the API token from your provider)
 *
 * The base URL is configurable via APICONVERT_API_URL
 * (defaults to https://v2.convertapi.com if not set).
 */

export class ApiconvertError extends Error {
  constructor(
    message: string,
    public step: 'start' | 'upload' | 'convert' = 'start',
    public status?: number,
  ) {
    super(message);
    this.name = 'ApiconvertError';
  }
}

export type ApiconvertResult = {
  pdfBuffer: Buffer;
  pdfSize: number;
  warnings: string[];
};

/**
 * Convert an Office document to PDF via the APIConvert REST endpoint.
 * Supports: .docx, .doc, .odt, .pptx, .xlsx, .rtf, etc.
 */
export async function convertOfficeToPdfViaConvertApi(
  fileBuffer: Buffer,
  fileName: string,
  secret: string,
): Promise<ApiconvertResult> {
  if (!secret) {
    throw new ApiconvertError('APICONVERT_API_KEY non configuré');
  }

  // Detect the source format from the extension
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const formatMap: Record<string, string> = {
    docx: 'docx',
    doc: 'doc',
    odt: 'odt',
    rtf: 'rtf',
    pptx: 'pptx',
    ppt: 'ppt',
    xlsx: 'xlsx',
    xls: 'xls',
  };
  const sourceFormat = formatMap[ext];
  if (!sourceFormat) {
    throw new ApiconvertError(`Format non supporté: .${ext}`);
  }

  // Build multipart form
  const form = new FormData();
  const blob = new Blob([new Uint8Array(fileBuffer)], {
    type: 'application/octet-stream',
  });
  form.append('File', blob, fileName);

  const baseUrl = (process.env.APICONVERT_API_URL || 'https://v2.convertapi.com').replace(
    /\/+$/,
    '',
  );
  const url = `${baseUrl}/convert/${sourceFormat}/to/pdf`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
      },
      body: form as any,
    });
  } catch (e: any) {
    throw new ApiconvertError(
      `APIConvert requête échouée: ${e?.message || 'erreur réseau'}`,
      'start',
    );
  }

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const errBody = await res.text();
      errMsg = `${errMsg} — ${errBody.slice(0, 300)}`;
    } catch {
      // ignore body parsing
    }
    throw new ApiconvertError(
      `APIConvert error: ${errMsg}`,
      res.status === 401 || res.status === 403 ? 'start' : 'convert',
      res.status,
    );
  }

  // The response is the PDF binary directly
  const arrayBuffer = await res.arrayBuffer();
  const pdfBuffer = Buffer.from(arrayBuffer);

  if (pdfBuffer.length < 100) {
    throw new ApiconvertError('APIConvert a renvoyé un fichier vide', 'convert');
  }
  if (!pdfBuffer.subarray(0, 4).toString().startsWith('%PDF')) {
    throw new ApiconvertError(
      'APIConvert a renvoyé du contenu non-PDF (rate limit? erreur?)',
      'convert',
    );
  }

  return {
    pdfBuffer,
    pdfSize: pdfBuffer.length,
    warnings: [],
  };
}

/**
 * Quick health check
 */
export async function checkApiconvertHealth(secret: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (!secret) return { ok: false, error: 'Missing APICONVERT_API_KEY' };
  try {
    const form = new FormData();
    form.append('File', new Blob(['Hello Examanet'], { type: 'text/plain' }), 'test.txt');
    const baseUrl = (process.env.APICONVERT_API_URL || 'https://v2.convertapi.com').replace(
      /\/+$/,
      '',
    );
    const res = await fetch(`${baseUrl}/convert/txt/to/pdf`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
      body: form as any,
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
      };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Unknown' };
  }
}
