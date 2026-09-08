/**
 * PDF utilities for server-side use.
 *
 * 2026-09-06: Created to count PDF pages without a heavy library.
 * Standard PDFs expose page count via /Type /Page entries in the object
 * table. We count these (excluding /Pages containers which represent
 * the page tree, not individual pages).
 *
 * Limitations:
 *  - Works on standard PDFs (iLoveAPI output, manual exports)
 *  - Linear PDFs (object streams) may need a different approach but
 *    iLoveAPI's output is uncompressed object tables
 *  - If parsing fails, returns null so callers can fall back to a default
 */
export function countPdfPages(buffer: Uint8Array | ArrayBuffer): number | null {
  try {
    const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
    // Convert to string once and search. This is approximate but works
    // for uncompressed PDFs (the default for office docs converted by
    // iLoveAPI / LibreOffice).
    const text = new TextDecoder('latin1').decode(bytes);
    // Look for "/Type /Page" (NOT "/Pages")
    const matches = text.match(/\/Type\s*\/Page(?![sa-z])/g);
    if (matches && matches.length > 0) return matches.length;
    // Alternative: count /Count N inside /Pages (more reliable for compressed PDFs)
    const countMatch = text.match(/\/Count\s+(\d+)/);
    if (countMatch) {
      const n = parseInt(countMatch[1], 10);
      if (n > 0 && n < 10000) return n;
    }
    return null;
  } catch {
    return null;
  }
}
