/**
 * Extract Arabic subject from title wherever it appears.
 * Returns the title with Arabic block removed and the Arabic text separately.
 *
 * Handles 3 patterns:
 * 1. AR at end after " - ": "FR title - Arabic" -> {fr: "FR title", ar: "Arabic"}
 * 2. AR at end after space: "FR title Arabic" -> {fr: "FR title", ar: "Arabic"}
 * 3. AR in middle: "Math المثلثات - 9ème" -> {fr: "Math - 9ème", ar: "المثلثات"}
 *
 * For mostly-Arabic titles (>60%), return as-is (let H1 be RTL via isArabic).
 *
 * Example:
 *   splitArabicSubject("Cours Collège pilote - Math - 9ème (2017-2018) Mme Tekeri Zeineb مبرهنة طالس")
 *     -> {fr: "Cours Collège pilote - Math - 9ème (2017-2018) Mme Tekeri Zeineb", ar: "مبرهنة طالس"}
 *   splitArabicSubject("Série d'exercices - Math المثلثات ونظرية بيتاغور - 9ème (2015-2016) Mr ZOUARI SAMI")
 *     -> {fr: "Série d'exercices - Math - 9ème (2015-2016) Mr ZOUARI SAMI", ar: "المثلثات ونظرية بيتاغور"}
 *   splitArabicSubject("درس - موسيقى - 7 أساسي (2013-2014) الأستاذ ثابت بن محرز")
 *     -> {fr: "درس - موسيقى - 7 أساسي (2013-2014) الأستاذ ثابت بن محرز", ar: null}  (mostly Arabic)
 */
export function splitArabicSubject(title: string | null | undefined): {
  fr: string;
  ar: string | null;
} {
  if (!title) return { fr: '', ar: null };

  // Count Arabic vs Latin chars to decide if title is mostly Arabic
  const arabicChars = (title.match(/[\u0600-\u06FF]/g) || []).length;
  const latinChars = (title.match(/[A-Za-zÀ-ÿ0-9]/g) || []).length;
  const total = arabicChars + latinChars;
  // If title is >60% Arabic, don't split (let H1 stay RTL)
  if (total > 0 && arabicChars / total > 0.6) {
    return { fr: title, ar: null };
  }

  // Pattern 1 & 2: AR at end (most common)
  let match = title.match(/^(.*?)\s+-\s+([\u0600-\u06FF][\u0600-\u06FF\s،.؟!]*)$/);
  if (match) {
    return { fr: match[1].trim(), ar: match[2].trim() };
  }
  match = title.match(/^(.*?\S)\s+([\u0600-\u06FF][\u0600-\u06FF\s،.؟!]{2,})$/);
  if (match) {
    return { fr: match[1].trim(), ar: match[2].trim() };
  }

  // Pattern 3: AR in middle - extract the Arabic block
  // Find ALL Arabic blocks and take the largest one
  const arabicMatches = [...title.matchAll(/[\u0600-\u06FF][\u0600-\u06FF\s،.؟!]*/g)];
  if (arabicMatches.length > 0) {
    // Pick the longest Arabic block
    let bestMatch = arabicMatches[0];
    for (const m of arabicMatches) {
      if (m[0].trim().length > bestMatch[0].trim().length) {
        bestMatch = m;
      }
    }
    const ar = bestMatch[0].trim();
    if (ar.length >= 2) {
      // Remove the Arabic block from the title and clean up
      let fr = title.replace(bestMatch[0], '').trim();
      fr = fr.replace(/\s+/g, ' ');
      fr = fr.replace(/\s*-\s*$/, '');
      fr = fr.replace(/^\s*-\s*/, '');
      fr = fr.replace(/\s+-\s+/g, ' - ');
      fr = fr.replace(/\s+/g, ' ').trim();
      return { fr, ar };
    }
  }

  return { fr: title, ar: null };
}

/**
 * Detect if text contains Arabic characters.
 * Used to apply dir="rtl" / text-align: right for Arabic content.
 */
export function isArabic(text: string | null | undefined): boolean {
  if (!text) return false;
  // Arabic Unicode block U+0600-U+06FF, also includes Arabic Supplement U+0750-U+077F
  // and Arabic Presentation Forms U+FB50-U+FDFF, U+FE70-U+FEFF
  const arabicChars = (text.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g) || [])
    .length;
  // If more than 30% of chars are Arabic (after stripping digits/punct), it's Arabic
  const totalChars = (text.match(/[\w\u0600-\u06FF]/g) || []).length;
  if (totalChars === 0) return false;
  return arabicChars / totalChars >= 0.3;
}

/**
 * Detect direction (rtl or ltr) for a text.
 */
export function getDirection(text: string | null | undefined): 'rtl' | 'ltr' {
  return isArabic(text) ? 'rtl' : 'ltr';
}

/**
 * Get language code (ar, fr, en) based on text content.
 */
export function detectLanguage(text: string | null | undefined): 'ar' | 'fr' | 'en' {
  if (!text) return 'fr';
  const arabicChars = (text.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g) || [])
    .length;
  const latinChars = (text.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  if (arabicChars === 0 && latinChars === 0) return 'fr';
  // If at least 30% Arabic → ar
  if (arabicChars / (arabicChars + latinChars) >= 0.3) return 'ar';
  return 'fr';
}

/**
 * Get initials for a name, handling parentheses and special chars.
 * Returns 2-letter uppercase initials, skipping non-letter characters.
 *
 * Examples:
 *   getInitials('TunisieCollège', '(source originale)') → 'TC'
 *   getInitials('GHARBI', 'RIDHA') → 'GR'
 *   getInitials('محمّد', 'بن معلّم') → 'مب' (or 'MB')
 *   getInitials('A', 'B') → 'AB'
 */
export function getInitials(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  const getFirstLetter = (s: string | null | undefined): string => {
    if (!s) return '';
    // Find first alphabetic character (Unicode letters)
    const match = s.match(/[\p{L}]/u);
    return match ? match[0] : '';
  };

  const f = getFirstLetter(firstName);
  const l = getFirstLetter(lastName);
  return (f + l).toUpperCase();
}
