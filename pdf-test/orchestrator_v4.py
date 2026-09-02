"""
Examanet Bulk Extraction Orchestrator v4 — Pre-extraction + improved metadata (2026-07-31)

Improvements over v3:
  1. **Pre-extraction with regex** — runs BEFORE the model to handle OCR-degraded text:
     - Year pattern: \d{4}\s*-\s*\d{4} or \d{4}/\d{4}
     - Duration: "مدة" or "مدّة" or "durée" + number + "دقيقة/ساعة"
     - Prof: "Mr/Mme/Mlle/الأستاذ" + next 2-4 words (AR + FR)
     - School: "المدرس" or "Lycée/Collège/École" + next 2-6 words
  2. **Model call with hints** — passes the regex findings to the agent so it
     can CONFIRM or REFINE the values
  3. **Better fullText coverage** — 6000 chars instead of 4000 (more header context)
  4. **Prof name normalization** — handles "M." vs "Mr" vs "الأستاذ" prefixes,
     extracts just the name (without title)
  5. **More OCR-tolerant** regex — accepts Greek/Latin char noise in Arabic

Total: still 3 model calls per resource, with better inputs.
"""
import os
import sys
import json
import time
import argparse
import importlib.util
import re
import unicodedata
import types
from typing import List, Optional, Tuple

# === Bootstrap bulk_math_v5 with stubs ===
_openai_stub = types.ModuleType('openai')
_openai_stub.OpenAI = lambda: None
sys.modules['openai'] = _openai_stub
sys.modules['fitz'] = types.ModuleType('fitz')
sys.modules['PIL'] = types.ModuleType('PIL')
sys.modules['PIL'].Image = types.ModuleType('Image')

_bulk_spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
_bulk = importlib.util.module_from_spec(_bulk_spec)
_bulk_spec.loader.exec_module(_bulk)

# === Import agents SDK ===
del sys.modules['openai']
from pydantic import BaseModel, Field
from agents import (
    Agent, Runner, function_tool, RunContextWrapper,
    set_tracing_disabled, GuardrailFunctionOutput,
    output_guardrail, OutputGuardrailTripwireTriggered,
)
set_tracing_disabled(True)


# =============================================================================
# OCR-tolerant text utilities
# =============================================================================
# Regex character class for Arabic + Arabic presentation forms
# Arabic base: \u0600-\u06FF, \u0750-\u077F, \u08A0-\u08FF, \uFB50-\uFDFF, \uFE70-\uFEFF
# Greek (OCR noise): \u0370-\u03FF
# Latin (OCR noise): \u0041-\u007A
# We accept all of these for OCR tolerance
ARABIC_RE = r'[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]'
GREEK_RE = r'[\u0370-\u03FF]'
LATIN_RE = r'[A-Za-zÀ-ÿ]'
AR_OR_NOISE_RE = r'[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0370-\u03FF]'
def normalize_arabic(s: str) -> str:
    """Normalize Arabic text: remove diacritics, normalize alef/ya variants."""
    if not s:
        return ''
    # Normalize common Arabic character variants
    s = s.replace('إ', 'ا').replace('أ', 'ا').replace('آ', 'ا')  # alef variants → alef
    s = s.replace('ى', 'ي').replace('ؤ', 'و')  # ya/hamza on wa → ya/wa
    s = re.sub(r'[\u064B-\u065F\u0670]', '', s)  # remove diacritics
    return s


def is_likely_arabic(s: str) -> bool:
    """Check if a string contains Arabic chars (with OCR tolerance)."""
    if not s:
        return False
    # Count Arabic Unicode block chars
    arabic_count = sum(1 for c in s if '\u0600' <= c <= '\u06FF')
    # Also accept if has Greek/Latin noise but at least 1 Arabic
    return arabic_count >= 1


def clean_extracted_text(s: str) -> str:
    """Clean extracted text from OCR garbage."""
    if not s:
        return ''
    # Normalize spaces
    s = re.sub(r'\s+', ' ', s)
    return s.strip()


# =============================================================================
# Pre-extraction with regex (handles OCR-degraded text)
# =============================================================================
def pre_extract_metadata(text: str, title: str = '') -> dict:
    """Extract metadata from text using OCR-tolerant regex patterns.

    Returns dict with pre-extracted hints for the model.
    """
    hints = {
        'year': None,
        'duration': None,
        'prof_candidate': None,
        'school_candidate': None,
        'date_candidate': None,
    }

    if not text:
        return hints

    # Normalize OCR noise in a copy for matching
    text_norm = text
    # Keep original for output, normalized for matching

    # 1. YEAR: look for "2014-2015" or "2014 / 2015" or "(2015)"
    year_patterns = [
        r'\((\d{4})\s*[/-]\s*(\d{4})\)',  # (2014-2015)
        r'\b(\d{4})\s*[/-]\s*(\d{4})\b',  # 2014-2015 or 2014/2015
        r'(?:سنة|عام)\s*(?:دراسية)?\s*(\d{4})\s*[/-]\s*(\d{4})',  # سنة دراسية 2014-2015
    ]
    for pat in year_patterns:
        m = re.search(pat, text)
        if m:
            y1, y2 = m.group(1), m.group(2)
            if 2000 < int(y1) < 2030 and 2000 < int(y2) < 2030:
                hints['year'] = f"{y1}-{y2}"
                break

    # 2. DURATION: look for "مدّة/مدة" or "durée" + number
    duration_patterns = [
        # Arabic: "مدة العمل: 55 دقيقة" or "المدة: ساعة"
        r'(?:مدة|مدّة)\s*(?:العمل|االإنجاز)?\s*[:=]?\s*(\d+)\s*(دقيقة|دق|ساعة|ساعات|د)',
        r'(\d+)\s*(دقيقة|دق|ساعة|ساعات)\b',
        # French: "Durée: 1h" or "2 heures"
        r'[Dd]ur[eé]e?\s*[:=]?\s*(\d+)\s*(h|heure|heures|mn|min|minutes?)?',
        r'(\d+)\s*(?:h|heures?|mn|min|minutes?)\b',
    ]
    for pat in duration_patterns:
        m = re.search(pat, text)
        if m:
            try:
                num = m.group(1)
                unit = m.group(2) if m.lastindex and m.lastindex >= 2 and m.group(2) else ""
            except (IndexError, AttributeError):
                continue
            if not num:
                continue
            unit = unit.lower() if unit else ''
            if unit.startswith('ساعة') or unit.startswith('h'):
                hints['duration'] = f"{num} heure{'s' if int(num) > 1 else ''}"
            elif unit.startswith('دقيقة') or unit.startswith('دق') or unit.startswith('mn') or unit.startswith('min'):
                hints['duration'] = f"{num} minute{'s' if int(num) > 1 else ''}"
            else:
                hints['duration'] = f"{num} min"
            break

    # 3. PROF: look for Mr/Mme/Mlle/الأستاذ + next 2-4 words
    # OCR-tolerant: accept Greek chars and Latin chars mixed with Arabic
    prof_patterns = [
        # AR: الأستاذ (with OCR tolerance, include feminine ة, allow colon on either side)
        # Use greedy + lookahead to stop at separator, but POST-FILTER for label words
        r'(?:ال?أ?ستاذ[ة]?|ال?أ?ستا?ذ)[^\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF\s]{0,3}\s*((?:[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]){2,30}(?:\s+(?:[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]){2,30}){0,3})(?=[:\s,;]|$|[\n\r])',
        # Simpler fallback (no suffix)
        r'(?:ال?أ?ستاذ)\s*[:،]?\s*((?:[\u0600-\u06FF]|\s){3,60})',
        # FR: Mr/Mme/Mlle/M. followed by name
        r'\b(Mr|Mme|Mlle|M\.|M\.\-?me|Pr)\s+([A-Z\u0600-\u06FF][\w\sà-ÿ\'\.\-]{2,60})',
        # Reversed: name BEFORE "الأستاذ" (OCR sometimes flips order)
        r'((?:[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]){2,30}(?:\s+(?:[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]){2,30}){0,3})\s*[^\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF\s]{0,3}\s*(?:ال?أ?ستاذ[ة]?|ال?أ?ستا?ذ)',
    ]
    # Words that mark the END of a prof name (labels that follow)
    PROF_END_MARKERS = {'التوقيت', 'الإنجاز', 'المدة', 'العمل', 'الفوج', 'القسم', 'التاريخ', 'الفصل', 'المؤسسة', 'المستوى'}
    NON_PROF_WORDS = {
        'فرض', 'مراقبة', 'تأليفي', 'اختبار', 'سلسلة', 'تمارين', 'درس', 'الدرس',
        'devoir', 'examen', 'contrôle', 'série', 'exercices', 'cours',
        'عدد', 'تمرين', 'الفرض', 'السنة', 'الفصل', 'السنة', 'الثامنة', 'التاسعة', 'السابعة',
        'أساسي', 'اولى', 'ثانية', 'ثالثة', 'رابعة', 'مدة', 'المدة', 'العمل',
        'الحل', 'الاصلاح', 'الأصلاح', 'التصحيح',
    }
    for pat in prof_patterns:
        m = re.search(pat, text, re.MULTILINE)
        if m:
            if m.lastindex == 1:
                raw_name = m.group(1).strip()
            else:
                raw_name = m.group(2).strip() if m.lastindex >= 2 else ''
            if not raw_name:
                continue
            
            # Truncate at PROF_END_MARKERS (label words that follow the prof)
            words = raw_name.split()
            truncated = []
            for w in words:
                if w in PROF_END_MARKERS:
                    break
                truncated.append(w)
            raw_name = ' '.join(truncated)
            if len(raw_name.split()) < 2:
                continue
            
            # Clean: take Arabic words
            arabic_words = re.findall(r'[\u0600-\u06FF]+', raw_name)
            arabic_words_filtered = [w for w in arabic_words if w not in NON_PROF_WORDS and len(w) > 1]
            if 2 <= len(arabic_words_filtered) <= 5:
                hints['prof_candidate'] = ' '.join(arabic_words_filtered[:4])
                break
            
            latin_words = re.findall(r'[A-Za-zÀ-ÿ]+', raw_name)
            latin_words_filtered = [w for w in latin_words if w.lower() not in {'devoir', 'examen', 'mr', 'mme', 'mlle', 'cours', 'serie', 'exercices'}]
            if 2 <= len(latin_words_filtered) <= 4:
                hints['prof_candidate'] = ' '.join(latin_words_filtered[:4])
                break
            
            mixed = re.findall(r'[\u0600-\u06FF]+|[A-Za-zÀ-ÿ]+', raw_name)
            mixed_filtered = [w for w in mixed if w not in NON_PROF_WORDS and len(w) > 1]
            if 2 <= len(mixed_filtered) <= 5:
                hints['prof_candidate'] = ' '.join(mixed_filtered[:4])
                break

    # 3b. PROF (no prefix): if not found, look at first 15 lines of text
    # Some Tunisian PDFs have prof name with no "الأستاذ" prefix
    if not hints.get('prof_candidate'):
        first_lines = [l.strip() for l in text.split('\n')[:20] if l.strip()]
        # More aggressive stop words (labels, form fields, section headers)
        EXTRA_STOP = NON_PROF_WORDS | {
            'الإسم', 'اللقب', 'الأول', 'الثاني', 'الثالث', 'الرابع',
            'التاريخ', 'الفوج', 'القسم', 'المؤسسة', 'تلاميذ',
            'العمل', 'الأعمال', 'الفرنسية', 'العربية', 'المادة', 'السنة', 'الفصل',
            'Décembre', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
            'Septembre', 'Octobre', 'Novembre', 'décembre', 'janvier', 'février',
            'mars', 'avril', 'mai', 'juin', 'septembre', 'octobre', 'novembre',
            'التمرين', 'الأسئلة', 'الجواب', 'السؤال', 'الجواب', 'الإجابة',
            'الورقة', 'الصفحة', 'تابع', 'ينجز', 'أنجز', 'تمرين', 'أسئلة',
        }
        # Prof label words that may appear at the end of the line (OCR-reversed)
        PROF_LABEL_REVERSED = {'الستاذ', 'االستاذ', 'االستاذة', 'الستاذة', 'ستاذ', 'استاذ', 'الاستاذ', 'الاستاذة', 'الاستا', 'االستا'}
        for i, line in enumerate(first_lines):
            # Prof is 2-4 Arabic words, not containing class/school/type words
            words = re.findall(r'[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]+', line)
            # If last word is prof label (reversed order), drop it
            if words and words[-1] in PROF_LABEL_REVERSED:
                words = words[:-1]
            # Normalize words for stop-word check (presentation forms → base forms)
            def normalize_ar(w):
                # Comprehensive mapping: Arabic presentation forms → base forms
                mapping = {
                    'ﺍ': 'ا', 'ﺎ': 'ا', 'ﺃ': 'ا', 'ﺄ': 'ا', 'ﺇ': 'ا', 'ﺈ': 'ا', 'ﺁ': 'ا',
                    'ﺏ': 'ب', 'ﺐ': 'ب', 'ﺑ': 'ب', 'ﺒ': 'ب',
                    'ﺕ': 'ت', 'ﺖ': 'ت', 'ﺗ': 'ت', 'ﺘ': 'ت',
                    'ﺙ': 'ث', 'ﺚ': 'ث', 'ﺛ': 'ث', 'ﺜ': 'ث',
                    'ﺝ': 'ج', 'ﺞ': 'ج', 'ﺟ': 'ج', 'ﺠ': 'ج',
                    'ﺡ': 'ح', 'ﺢ': 'ح', 'ﺣ': 'ح', 'ﺤ': 'ح',
                    'ﺥ': 'خ', 'ﺦ': 'خ', 'ﺧ': 'خ', 'ﺨ': 'خ',
                    'ﺩ': 'د', 'ﺪ': 'د',
                    'ﺫ': 'ذ', 'ﺬ': 'ذ',
                    'ﺭ': 'ر', 'ﺮ': 'ر',
                    'ﺯ': 'ز', 'ﺰ': 'ز',
                    'ﺱ': 'س', 'ﺲ': 'س', 'ﺳ': 'س', 'ﺴ': 'س',
                    'ﺵ': 'ش', 'ﺶ': 'ش', 'ﺷ': 'ش', 'ﺸ': 'ش',
                    'ﺹ': 'ص', 'ﺺ': 'ص', 'ﺻ': 'ص', 'ﺼ': 'ص',
                    'ﺽ': 'ض', 'ﺾ': 'ض', 'ﺿ': 'ض', 'ﻀ': 'ض',
                    'ﻁ': 'ط', 'ﻂ': 'ط', 'ﻃ': 'ط', 'ﻄ': 'ط',
                    'ﻅ': 'ظ', 'ﻆ': 'ظ', 'ﻇ': 'ظ', 'ﻈ': 'ظ',
                    'ﻉ': 'ع', 'ﻊ': 'ع', 'ﻋ': 'ع', 'ﻌ': 'ع',
                    'ﻍ': 'غ', 'ﻎ': 'غ', 'ﻏ': 'غ', 'ﻐ': 'غ',
                    'ﻑ': 'ف', 'ﻒ': 'ف', 'ﻓ': 'ف', 'ﻔ': 'ف',
                    'ﻕ': 'ق', 'ﻖ': 'ق', 'ﻗ': 'ق', 'ﻘ': 'ق',
                    'ﻙ': 'ك', 'ﻚ': 'ك', 'ﻛ': 'ك', 'ﻜ': 'ك',
                    'ﻝ': 'ل', 'ﻞ': 'ل', 'ﻟ': 'ل', 'ﻠ': 'ل',
                    'ﻡ': 'م', 'ﻢ': 'م', 'ﻣ': 'م', 'ﻤ': 'م',
                    'ﻥ': 'ن', 'ﻦ': 'ن', 'ﻧ': 'ن', 'ﻨ': 'ن',
                    'ﻩ': 'ه', 'ﻪ': 'ه', 'ﻫ': 'ه', 'ﻬ': 'ه',
                    'ﻭ': 'و', 'ﻮ': 'و',
                    'ﻯ': 'ي', 'ﻰ': 'ي', 'ﻱ': 'ي', 'ﻲ': 'ي', 'ﻳ': 'ي', 'ﻴ': 'ي',
                    # Lam-Alef ligatures
                    'ﻻ': 'لا', 'ﻼ': 'لا', 'ﻷ': 'لأ', 'ﻸ': 'لأ', 'ﻹ': 'لإ', 'ﻺ': 'لإ',
                }
                for k, v in mapping.items():
                    w = w.replace(k, v)
                return w
            words_normalized = [normalize_ar(w) for w in words]
            words_filtered = [w for w, nw in zip(words, words_normalized) if nw not in EXTRA_STOP and len(w) > 1]
            if 2 <= len(words_filtered) <= 4:
                # Skip school lines (use normalized check)
                line_normalized = normalize_ar(line)
                if not any(w in line_normalized for w in ['مدرس', 'إعدادي', 'ثانوي', 'lycee', 'college', 'ecole', 'مدة', 'المدة']):
                    if not any(w in line_normalized for w in ['السنة', 'أساسي', 'الفرض', 'مراقبة', 'العدد', 'الدق', 'دقيقة']):
                        if not any(w in line_normalized for w in ['الاسم', 'الإسم', 'واللقب', 'اللقب', 'التمرين']):
                            if any(len(w) >= 3 for w in words_filtered):
                                hints['prof_candidate'] = ' '.join(words_filtered)
                                break

    # 4. SCHOOL: look for "المدرس" or "Lycée/Collège/École" + next 2-6 words
    # OCR-tolerant: المدرسة can become المدرسΔ, المدرسϵ, etc.
    school_patterns = [
        # AR: المدرسة (with OCR tolerance for any chars after)
        r'(?:ال?أ?مدرس[ةه]?)\s*[^' + AR_OR_NOISE_RE + r'\s]{0,3}\s*((?:' + AR_OR_NOISE_RE + r')+(?:\s+(?:' + AR_OR_NOISE_RE + r')+){1,6})',
        # Fallback: simpler
        r'(?:ال?أ?مدرس[ةه]?)\s*[:،]?\s*((?:' + AR_OR_NOISE_RE + r'|\s){3,80})',
        # FR: Lycée/Collège/École + name
        r'\b(Lycée|Coll[eè]ge|[ÉE]cole|[ÉE]cole\s+(?:primaire|secondaire|préparatoire)|Institution|Inst\.)\s+([A-Z][\w\sà-ÿ\'\.\-]{3,60})',
    ]
    SCHOOL_STOP = {'و', 'في', 'من', 'إلى', 'ب', 'تعليم', 'اعدادي', 'ثانوي', 'الثانوية', 'تونسية', 'تونس'}
    for pat in school_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            if m.lastindex == 1:
                raw = m.group(1).strip()
            else:
                raw = m.group(2).strip() if m.lastindex >= 2 else ''
            
            if not raw:
                continue
            
            if is_likely_arabic(raw):
                # Take Arabic words
                words = re.findall(r'[\u0600-\u06FF]+', raw)
                school_words = [w for w in words if w not in SCHOOL_STOP and len(w) > 1][:6]
                if 2 <= len(school_words) <= 6:
                    hints['school_candidate'] = ' '.join(school_words)
                    break
            else:
                clean = re.sub(r'\s+', ' ', raw).strip()
                latin_words = re.findall(r'[A-Za-zÀ-ÿ]+', clean)
                if 2 <= len(latin_words) <= 6:
                    hints['school_candidate'] = ' '.join(latin_words)
                    break

    # 5. DATE: 04/10/2015 or similar (could indicate exam date)
    date_pattern = r'\b(\d{1,2})[/](\d{1,2})[/](\d{4})\b'
    m = re.search(date_pattern, text)
    if m:
        d, mo, y = m.group(1), m.group(2), m.group(3)
        hints['date_candidate'] = f"{d}/{mo}/{y}"

    return hints


# =============================================================================
# Schemas (same as v3)
# =============================================================================
class SubjectOutput(BaseModel):
    generalSubject: str = Field(..., min_length=3, max_length=80)
    isArabic: bool


class KeyPoint(BaseModel):
    text: str = Field(..., min_length=2, max_length=40)
    isArabic: bool


class KeyPointsOutput(BaseModel):
    keyPoints: List[KeyPoint] = Field(..., min_length=3, max_length=5)
    isArabic: bool


class MetadataOutput(BaseModel):
    profFirstNameFr: Optional[str] = None
    profLastNameFr: Optional[str] = None
    profFirstNameAr: Optional[str] = None
    profLastNameAr: Optional[str] = None
    schoolNameFr: Optional[str] = None
    schoolNameAr: Optional[str] = None
    resourceType: str = 'OTHER'
    academicYear: Optional[str] = None
    trimestre: Optional[str] = None
    duration: Optional[str] = None
    confidence: float = Field(0.0, ge=0, le=1)


# === Generic words for keyPoint guardrail ===
GENERIC_KP_WORDS = {
    'فرض', 'الفرض', 'مراقبة', 'اختبار', 'تأليفي', 'سلسلة',
    'devoir', 'examen', 'contrôle', 'série',
    'المدرسة', 'الإعدادية', 'النموذجية', 'المعهد', 'الثانوية',
    'السنة', 'أساسي', 'الثامنة', 'التاسعة', 'السابعة',
    'الرياضيات', 'الفيزياء', 'الفرنسية',
    '2010', '2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019', '2020',
    'الإجابة', 'صحيحة', 'التمرين', 'مدرس', 'تعليم', 'الأساسي',
}


@output_guardrail
async def anti_generic_kp_guardrail(ctx, agent, output):
    if not isinstance(output, KeyPointsOutput):
        return GuardrailFunctionOutput(output_info={}, tripwire_triggered=False)
    generic_count = 0
    for kp in output.keyPoints:
        for word in GENERIC_KP_WORDS:
            if word in kp.text:
                generic_count += 1
                break
    threshold = max(1, int(len(output.keyPoints) * 0.3))
    triggered = generic_count >= threshold
    return GuardrailFunctionOutput(
        output_info={'generic_count': generic_count, 'threshold': threshold},
        tripwire_triggered=triggered,
    )


# === Pre-fetch helper ===
def fetch_resource_data(numericId: int) -> dict:
    r = _bulk.neon_query(f'''
        SELECT r.id, r.title, r.language, c.slug as cls, s.slug as subj,
               rc."fullText" as text
        FROM "Resource" r
        JOIN "Class" c ON c.id = r."classId"
        LEFT JOIN "Subject" s ON s.id = r."subjectId"
        LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
        WHERE r."numericId" = {int(numericId)}
    ''')
    data = r.get('response', [{}])[0].get('data', {})
    fields = data.get('fields', [])
    rows = data.get('rows', [])
    if not rows:
        return {'error': f'Resource {numericId} not found'}
    return dict(zip(fields, rows[0]))


# === Specialist agents ===
subject_agent = Agent(
    name="SubjectAgent",
    instructions="""Tu es un expert en synthèse pédagogique tunisienne pour le collège.

OBJECTIF: extraire le **sujet général** (3-6 mots, même langue que le texte, concept spécifique).

EXEMPLES BONS: "Les fonctions logarithmes népériens", "La tectonique des plaques",
"الثورة الفرنسية 1789", "الضوء والعدسات", "حماية الدارات الكهربائية"
EXEMPLES À ÉVITER: "Mathématiques", "Exercices de maths", "الرياضيات"

Renvoie UNIQUEMENT le sujet général.""",
    output_type=SubjectOutput,
    model="gpt-4o-mini",
    model_settings=__import__('agents').ModelSettings(service_tier="flex"),
)

keypoints_agent = Agent(
    name="KeyPointsAgent",
    instructions="""Tu es un expert en extraction de concepts-clés pour affichage en badges UI.

OBJECTIF: extraire 3 à 5 concepts COURTS (2-3 mots chacun) en AR ou FR.

⚠️ RÈGLE CRITIQUE: NE JAMAIS inclure de métadonnées (type d'exercice, nom d'école, classe, matière, année, prof).
UNIQUEMENT des concepts PÉDAGOGIQUES (théorèmes, formules, notions).

EXEMPLES BONS (AR): "حماية الدارات", "زاويتان متكاملتان", "قوى الأعداد", "عوامل أولية"
EXEMPLES BONS (FR): "Logarithme népérien", "Théorème de Pythagore"
EXEMPLES À ÉVITER: "الفرض 1", "المدرسة الإعدادية", "الرياضيات السابعة", "تمارين" (trop générique)""",
    output_type=KeyPointsOutput,
    model="gpt-4o-mini",
    model_settings=__import__('agents').ModelSettings(service_tier="flex"),
    output_guardrails=[anti_generic_kp_guardrail],
)

metadata_agent = Agent(
    name="MetadataExtractorAgent",
    instructions="""Tu es un expert en extraction de métadonnées à partir de PDFs éducatifs tunisiens OCR-dégradés.

OBJECTIF: extraire les métadonnées structurées du texte. Le texte peut être partiellement dégradé par l'OCR (caractères grecs/latins mélangés avec l'arabe, par ex. "المدرسΔ" = "المدرسة", "اأستΎذ" = "أستاذ", "55 Δدقيق" = "55 دقيقة").

⚠️ RÈGLE CLEF: si des HINTS sont fournis (issus d'une regex), CONFIRME-LES ou CORRIGE-LES, mais ne les ignores pas.

CHAMPS À EXTRAIRE:

1. **profName**:
   - profFirstNameFr + profLastNameFr (en français/latin)
   - profFirstNameAr + profLastNameAr (en arabe)
   - Cherche "Mr/Mme/Mlle" (FR) ou "الأستاذ" (AR) suivi du nom
   - Les caractères OCR (Δ, Ϭ, Ύ, ϡ, ϱ) sont des corruptions de lettres arabes
   - Si 2 profs avec trait d'union, c'est 2 profs distincts (seulement leurs noms de famille)

2. **schoolName**:
   - schoolNameFr (en français) + schoolNameAr (en arabe)
   - Cherche "Lycée/Collège/École" (FR) ou "المدرسة الإعدادية" (AR) suivi du nom
   - L'école est généralement dans le HEADER (premiers 1000 caractères)

3. **resourceType**: DEVOIR, EXAM, EXERCISE, COURSE, SUMMARY, ou OTHER
   - DEVOIR si "فرض" ou "devoir"/"contrôle"
   - EXAM si "اختبار" ou "examen"
   - EXERCISE si "تمارين" ou "série"/"exercices"
   - COURSE si "درس" ou "cours"

4. **academicYear** (ex: "2014-2015"): cherche 2 années consécutives

5. **trimestre** (1, 2, 3, ou null): cherche "الفصل" ou "trimestre"

6. **duration**: ex "55 minutes", "1 heure", "ساعة واحدة"

7. **confidence** (0-1)

⚠️ IMPORTANT: Si le texte est OCR-dégradé, RECONSTRUIS le mot probable (المدرسΔ → المدرسة).
Si tu ne trouves pas une info, mets null. Confidence < 0.5 si incertain.""",
    output_type=MetadataOutput,
    model="gpt-4o-mini",
    model_settings=__import__('agents').ModelSettings(service_tier="flex"),
)


# === Manual orchestrator ===
def run_orchestrator(numericId: int) -> dict:
    t0 = time.time()
    
    # Step 0: Pre-fetch
    resource = fetch_resource_data(numericId)
    if 'error' in resource:
        raise ValueError(resource['error'])
    text = (resource.get('text') or '')[:6000]  # 6000 chars for better header coverage
    title = resource.get('title') or ''
    language = resource.get('language') or 'fr'
    cls = resource.get('cls') or ''
    subj = resource.get('subj') or ''
    
    # Step 0.5: Pre-extract with regex (NEW in v4)
    pre_hints = pre_extract_metadata(text, title)
    
    # Step 1: Subject
    t1 = time.time()
    subject_prompt = f"""Resource #{numericId}
Titre: {title}
Classe: {cls} | Matière: {subj} | Langue: {language}

Texte (6000 premiers caractères):
{text}

→ Sujet général (3-6 mots):"""
    subject_result = Runner.run_sync(subject_agent, input=subject_prompt, max_turns=2)
    subject_out: SubjectOutput = subject_result.final_output
    t_subject = int((time.time() - t1) * 1000)
    
    # Step 2: KeyPoints
    t2 = time.time()
    kp_guardrail_triggered = False
    kp_guardrail_info = None
    try:
        kp_result = Runner.run_sync(
            keypoints_agent,
            input=f"""Resource #{numericId} (classe={cls}, matière={subj}, langue={language})
Texte (3000 premiers caractères):
{text[:3000]}

→ 3-5 concepts pédagogiques COURTS (2-3 mots), PAS de métadonnées:""",
            max_turns=2,
        )
        kp_out: KeyPointsOutput = kp_result.final_output
    except OutputGuardrailTripwireTriggered as e:
        kp_guardrail_triggered = True
        kp_guardrail_info = str(e)
        kp_result = Runner.run_sync(
            keypoints_agent,
            input=f"""⚠️ ATTENTION: ta réponse précédente contenait des MÉTADONNÉES (rejetée).

Resource #{numericId} (matière={subj}, classe={cls}, langue={language})
Texte (3000 caractères):
{text[:3000]}

→ UNIQUEMENT des concepts PÉDAGOGIQUES, 2-3 mots:""",
            max_turns=2,
        )
        kp_out: KeyPointsOutput = kp_result.final_output
    t_kp = int((time.time() - t2) * 1000)
    
    # Step 3: Metadata (with pre-extracted hints)
    t3 = time.time()
    hints_str = '\n'.join(f"  - {k}: {v}" for k, v in pre_hints.items() if v)
    metadata_prompt = f"""Resource #{numericId}
Titre: {title}
Classe: {cls} | Matière: {subj} | Langue: {language}

⚠️ HINTS PRÉ-EXTRAITS (regex sur le texte OCR-dégradé) — confirme ou corrige:
{hints_str if hints_str else '  (aucun hint trouvé, cherche dans le texte)'}

Texte (6000 premiers caractères, peut être OCR-dégradé):
{text}

→ Extrais les métadonnées. RECONSTRUIS les mots OCR-dégradés (المدرسΔ → المدرسة, اأستΎذ → الأستاذ, 55Δدقيق → 55 دقيقة). Si les hints sont valides, utilise-les. Confidence basée sur la qualité OCR."""
    metadata_result = Runner.run_sync(metadata_agent, input=metadata_prompt, max_turns=2)
    metadata_out: MetadataOutput = metadata_result.final_output
    t_meta = int((time.time() - t3) * 1000)
    
    total_ms = int((time.time() - t0) * 1000)
    
    # Post-processing: if model returned null but hint is valid, use hint
    if not metadata_out.schoolNameAr and pre_hints.get('school_candidate'):
        metadata_out.schoolNameAr = pre_hints['school_candidate']
        metadata_out.confidence = min(metadata_out.confidence, 0.7)
    if not metadata_out.profLastNameAr and pre_hints.get('prof_candidate'):
        metadata_out.profLastNameAr = pre_hints['prof_candidate']
        metadata_out.confidence = min(metadata_out.confidence, 0.7)
    if not metadata_out.academicYear and pre_hints.get('year'):
        metadata_out.academicYear = pre_hints['year']
    if not metadata_out.duration and pre_hints.get('duration'):
        metadata_out.duration = pre_hints['duration']
    
    return {
        'numericId': numericId,
        'generalSubject': subject_out.generalSubject,
        'generalSubjectIsAr': subject_out.isArabic,
        'keyPoints': [kp.text for kp in kp_out.keyPoints],
        'keyPointsIsAr': kp_out.isArabic,
        'kp_guardrail_triggered': kp_guardrail_triggered,
        'kp_guardrail_info': kp_guardrail_info,
        'metadata': {
            'profFirstNameFr': metadata_out.profFirstNameFr,
            'profLastNameFr': metadata_out.profLastNameFr,
            'profFirstNameAr': metadata_out.profFirstNameAr,
            'profLastNameAr': metadata_out.profLastNameAr,
            'schoolNameFr': metadata_out.schoolNameFr,
            'schoolNameAr': metadata_out.schoolNameAr,
            'resourceType': metadata_out.resourceType,
            'academicYear': metadata_out.academicYear,
            'trimestre': metadata_out.trimestre,
            'duration': metadata_out.duration,
            'confidence': metadata_out.confidence,
        },
        'pre_hints': pre_hints,
        'subjectMs': t_subject,
        'keypointsMs': t_kp,
        'metadataMs': t_meta,
        'totalMs': total_ms,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=10)
    ap.add_argument('--offset', type=int, default=0)
    ap.add_argument('--ids', help='comma-separated list of numericIds to test')
    args = ap.parse_args()
    
    if args.ids:
        IDS = [int(x) for x in args.ids.split(',')]
    else:
        # Get random sample
        r = _bulk.neon_query(f'''
            SELECT r."numericId" FROM "Resource" r
            JOIN "Class" c ON c.id = r."classId"
            JOIN "Subject" s ON s.id = r."subjectId"
            WHERE s.slug = 'mathematiques' AND c.slug IN ('7eme','8eme','9eme')
              AND r."publishedAt" IS NOT NULL
            ORDER BY RANDOM() LIMIT {args.limit}
        ''')
        IDS = [row[0] for row in r['response'][0]['data']['rows']]
    
    print(f"Testing v4 (pre-extraction) on {len(IDS)} files...\n", flush=True)
    results = []
    total_ms = 0
    for nid in IDS:
        try:
            r = run_orchestrator(nid)
            total_ms += r['totalMs']
            results.append(r)
            m = r['metadata']
            hints = r['pre_hints']
            print(f"\n#{nid} ({r['totalMs']}ms) [{r.get('numericId')}]")
            print(f"  Pre-hints: {hints}")
            print(f"  Subject:   {r['generalSubject']} ({'AR' if r['generalSubjectIsAr'] else 'FR'})")
            print(f"  KeyPoints: {r['keyPoints']}")
            print(f"  Prof:      {m['profFirstNameFr'] or '?'} {m['profLastNameFr'] or '?'}  /  {m['profFirstNameAr'] or '?'} {m['profLastNameAr'] or '?'}")
            print(f"  School:    {m['schoolNameFr'] or '?'}  /  {m['schoolNameAr'] or '?'}")
            print(f"  Type/Year/Trim/Duration: {m['resourceType']} / {m['academicYear'] or '?'} / {m['trimestre'] or '?'} / {m['duration'] or '?'}")
            print(f"  Confidence: {m['confidence']:.2f}")
        except Exception as e:
            print(f"\n#{nid} ERROR: {e}")
            import traceback; traceback.print_exc()
    
    if results:
        print(f"\n{'═' * 100}")
        print(f"SUMMARY: {len(results)}/{len(IDS)} OK, avg {total_ms/len(results):.0f}ms")
        print(f"  Pre-hints found: year={sum(1 for r in results if r['pre_hints'].get('year'))} | "
              f"prof={sum(1 for r in results if r['pre_hints'].get('prof_candidate'))} | "
              f"school={sum(1 for r in results if r['pre_hints'].get('school_candidate'))} | "
              f"duration={sum(1 for r in results if r['pre_hints'].get('duration'))}")
        print(f"  Final detected: prof={sum(1 for r in results if r['metadata']['profLastNameAr'] or r['metadata']['profLastNameFr'])}/{len(results)} | "
              f"school={sum(1 for r in results if r['metadata']['schoolNameAr'])}/{len(results)} | "
              f"year={sum(1 for r in results if r['metadata']['academicYear'])}/{len(results)} | "
              f"duration={sum(1 for r in results if r['metadata']['duration'])}/{len(results)}")


if __name__ == '__main__':
    main()
