/**
 * slugify.ts
 *
 * Centralized slugify function used across the app.
 *
 * Features:
 *  - Decodes HTML entities (handles double-encoding)
 *  - Strips file extensions (.pdf, .docx, .odt)
 *  - Transliterates French accents (é → e, à → a, ç → c)
 *  - Keeps ASCII letters a-z, digits 0-9
 *  - Keeps Arabic Unicode letters (\u0600-\u06FF)
 *  - Collapses multiple hyphens, trims edges
 *  - Truncates to 60 chars at word boundary
 *
 * Used by:
 *  - /api/teacher/resources (new uploads)
 *  - one-off migration scripts (regenerate-all-slugs, regenerate-slugs-with-id)
 *  - any other place that needs a clean URL slug
 */

export function decodeHtmlEntities(text: string): string {
  if (!text) return '';
  let result = text;
  for (let i = 0; i < 3; i++) {
    const before = result;
    result = result
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&hellip;/g, '...')
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–')
      .replace(/&eacute;/g, 'é')
      .replace(/&egrave;/g, 'è')
      .replace(/&agrave;/g, 'à')
      .replace(/&ccedil;/g, 'ç')
      .replace(/&iuml;/g, 'ï')
      .replace(/&ouml;/g, 'ö')
      .replace(/&ugrave;/g, 'ù')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
    if (before === result) break;
  }
  return result;
}

export function properSlugify(text: string, maxLength = 80): string {
  if (!text) return '';
  let s = decodeHtmlEntities(text);
  // Strip file extensions
  s = s
    .replace(/\.pdf$/i, '')
    .replace(/\.docx?$/i, '')
    .replace(/\.odt$/i, '');

  // === Arabic-friendly cleanup ===
  // 1. Strip year patterns: (2024-2025), (2024–2025), 2024-2025 standalone
  s = s.replace(/\s*\(\d{4}[-–—]\d{4}\)/g, '');
  s = s.replace(/\s+\d{4}[-–—]\d{4}\s+/g, ' ');

  // 2. Strip teacher name ONLY when there's a colon (الموضوع العام marker)
  //    Pattern: " - فتحي المرسني : موضوع" → " : موضوع"
  //    We don't strip blindly when no colon is present because the last
  //    segment could be a class/level name like "السابعة أساسي" — false positives.
  if (s.includes(':')) {
    const idx = s.lastIndexOf(':');
    const before = s.substring(0, idx);
    const after = s.substring(idx);
    // Match " - ARABIC_NAME" at the end of `before` (3-40 Arabic chars)
    const m = before.match(/\s+-\s+([\u0600-\u06FF][\u0600-\u06FF\s]{2,40})\s*$/);
    if (m) {
      s = before.substring(0, m.index).trim() + ' ' + after;
    }
  }

  s = s.toLowerCase().trim();
  // NFD: decompose accented chars into base + combining diacritic, then strip diacritics
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Specific French accent map (in case NFD missed)
  s = s
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ç]/g, 'c')
    .replace(/[ñ]/g, 'n')
    .replace(/[ýÿ]/g, 'y');

  // Keep ASCII a-z, digits, Arabic Unicode (\u0600-\u06FF), hyphens
  s = s.replace(/[^a-z0-9\u0600-\u06FF]+/g, '-');
  s = s.replace(/-+/g, '-');
  s = s.replace(/^-+|-+$/g, '');

  // Drop redundant "عدد N" (e.g., "عدد-3") — the type field already says
  // "فرض مراقبة N°1", so the Arabic count is noisy in the URL.
  s = s.replace(/عدد-\d+/g, '');
  s = s.replace(/-+/g, '-').replace(/^-+|-+$/g, '');

  // Truncate at word boundary (maxLength default raised to 80 to fit full
  // general subject in the slug — the previous 60-char cap was truncating
  // the SEO-critical الموضوع العام).
  if (s.length > maxLength) {
    const truncated = s.substring(0, maxLength);
    const lastHyphen = truncated.lastIndexOf('-');
    if (lastHyphen > 20) {
      s = truncated.substring(0, lastHyphen);
    } else {
      s = truncated;
    }
  }

  return s;
}
