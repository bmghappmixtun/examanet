#!/usr/bin/env python3
"""
Bulk re-OCR degraded files → ResourceContentStaging table.

- Scans all non-Technologie resources
- Detects degradation
- Re-OCRs degraded files with Tesseract (ara+fra+eng)
- Cleans \\u200e RTL marks
- Stores in ResourceContentStaging (DOES NOT touch live DB)

Usage:
  # Test on 50 files
  python3 bulk_reocr_to_staging.py --limit 50

  # All files
  python3 bulk_reocr_to_staging.py --limit 10000

  # Specific IDs
  python3 bulk_reocr_to_staging.py --ids 1338,3282

  # Custom workers (parallel)
  python3 bulk_reocr_to_staging.py --limit 1000 --workers 4
"""
import os, json, time, argparse, sys, re, signal
from pathlib import Path
import urllib.request
import fitz
import pytesseract
from PIL import Image
import io
import multiprocessing as mp
from concurrent.futures import ProcessPoolExecutor, as_completed

NEON_API_KEY = os.environ.get('NEON_API_KEY', '')
NEON_PROJECT = 'little-silence-94324724'
BRANCH_ID = 'br-purple-recipe-as2x8yyo'
ROLE = 'edutunisie_app'
PROXY_BASE = 'https://examanet.com/api/blob-teacher/'
INTERNAL_TOKEN = 'devmanet-bulk-2026'
TESSERACT_CONFIG = '--oem 1 --psm 6'

# Subjects to skip (Technologie already done)
SKIP_SUBJECTS = ['technologie']
# Collège class slugs
COLLEGE_CLASSES = ['7eme', '8eme', '9eme']


def neon_query(sql):
    body = {'db_name': 'neondb', 'role_name': ROLE, 'query': sql, 'branch_id': BRANCH_ID}
    req = urllib.request.Request(
        f'https://console.neon.tech/api/v2/projects/{NEON_PROJECT}/query',
        data=json.dumps(body).encode(),
        headers={'Authorization': f'Bearer {NEON_API_KEY}', 'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())


def sql_escape(val):
    """Escape a value for inclusion in a raw SQL string.

    - NULL → 'NULL'
    - Else: wrap in single quotes, escape single quotes by doubling,
      escape backslashes. Newlines/tabs are FINE inside SQL string literals.
    """
    if val is None:
        return 'NULL'
    s = str(val)
    s = s.replace('\\', '\\\\')   # Escape backslashes FIRST
    s = s.replace("'", "''")      # Then escape single quotes
    return f"'{s}'"


def sanitize_text(s):
    """Remove control chars that break Neon HTTP API."""
    return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', s)


def clean_rtl_marks(text):
    """Remove \\u200e (LRM) and other Tesseract noise marks."""
    # LRM (Left-to-Right Mark) \u200e
    text = text.replace('\u200e', '')
    # RLM (Right-to-Left Mark) \u200f
    text = text.replace('\u200f', '')
    # Zero-width space \u200b
    text = text.replace('\u200b', '')
    # Zero-width non-joiner \u200c
    text = text.replace('\u200c', '')
    # Zero-width joiner \u200d
    text = text.replace('\u200d', '')
    # BOM \ufeff
    text = text.replace('\ufeff', '')
    # Word joiner \u2060
    text = text.replace('\u2060', '')
    # Collapse multiple spaces
    text = re.sub(r'  +', ' ', text)
    # Collapse multiple newlines
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def download_pdf(file_key):
    """Download PDF via Vercel proxy (bypasses IP ban)."""
    url = PROXY_BASE + file_key
    req = urllib.request.Request(url, headers={'X-Internal-Token': INTERNAL_TOKEN})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def ocr_pdf(pdf_bytes, max_pages=3, dpi=200, lang='ara+fra+eng'):
    """Run Tesseract on first N pages of a PDF."""
    try:
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        all_text = []
        pages_to_process = min(doc.page_count, max_pages)
        for i in range(pages_to_process):
            page = doc[i]
            pix = page.get_pixmap(dpi=dpi)
            img = Image.open(io.BytesIO(pix.tobytes('png')))
            try:
                page_text = pytesseract.image_to_string(img, lang=lang, config=TESSERACT_CONFIG)
            except Exception:
                page_text = pytesseract.image_to_string(img, lang='eng', config=TESSERACT_CONFIG)
            all_text.append(page_text)
        doc.close()
        return '\n\n--- PAGE BREAK ---\n\n'.join(all_text), pages_to_process
    except Exception as e:
        return f'TESSERACT_ERROR: {e}', 0


def is_arabic_char(ch):
    code = ord(ch)
    return (0x0600 <= code <= 0x06FF or
            0x0750 <= code <= 0x077F or
            0x08A0 <= code <= 0x08FF or
            0xFB50 <= code <= 0xFDFF or
            0xFE70 <= code <= 0xFEFF)


def is_greek_char(ch):
    return 0x0370 <= ord(ch) <= 0x03FF


def is_control_char(ch):
    return ord(ch) < 0x20 and ch not in '\n\r\t'


def detect_degradation(text, file_size=None):
    if not text or len(text.strip()) < 50:
        return True, 95, ['text_too_short']
    reasons = []
    score = 0
    arabic_count = 0
    greek_count = 0
    for ch in text:
        if is_arabic_char(ch):
            arabic_count += 1
        elif is_greek_char(ch):
            greek_count += 1
    if arabic_count > 50:
        greek_ratio = greek_count / arabic_count
        if greek_ratio > 0.15:
            score += 50
            reasons.append(f'greek_noise={greek_ratio:.2%}')
        elif greek_ratio > 0.05:
            score += 25
            reasons.append(f'greek_noise={greek_ratio:.2%}')
    if arabic_count > 50:
        pres_form_count = sum(1 for ch in text if 0xFB50 <= ord(ch) <= 0xFEFF)
        pres_ratio = pres_form_count / arabic_count
        if pres_ratio > 0.7:
            score += 20
            reasons.append(f'presentation_forms={pres_ratio:.2%}')
    control_count = sum(1 for ch in text if is_control_char(ch))
    if control_count > 0:
        score += 30
        reasons.append(f'control_chars={control_count}')
    has_school = bool(re.search(r'(?:المدرس|الثانوية|lycee|collège|college)', text, re.IGNORECASE))
    has_prof = bool(re.search(r'(?:ا?ل?أستاذ|الأستاذة|الأستاذ)', text))
    if not has_school and not has_prof and arabic_count > 100:
        score += 20
        reasons.append('no_header_markers')
    if len(text.strip()) < 200:
        score += 30
        reasons.append(f'short_text={len(text.strip())}')
    elif len(text.strip()) < 500:
        score += 10
        reasons.append(f'short_text={len(text.strip())}')
    latin_count = sum(1 for ch in text if ch.isascii() and ch.isalpha())
    if arabic_count > 100 and latin_count / arabic_count > 0.3:
        score += 15
        reasons.append(f'high_latin_ratio={latin_count / arabic_count:.2%}')
    rep_count = text.count('\ufffd') + text.count('???') + text.count('□')
    if rep_count > 10:
        score += 20
        reasons.append(f'replacement_chars={rep_count}')
    is_degraded = score >= 30
    return is_degraded, min(score, 100), reasons


def get_candidate_ids(limit=10000, offset=0, only_math_college=False, college_only=False, ids=None):
    """Get numericIds of resources to test.
    
    Filters:
    - Always excludes Technologie (already done)
    - If college_only: restricts to 7eme, 8eme, 9eme
    - If only_math_college: restricts to Math 7eme/8eme/9eme
    """
    if ids:
        return ids
    
    skip_clause = ", ".join(f"'{s}'" for s in SKIP_SUBJECTS)
    college_clause = ", ".join(f"'{c}'" for c in COLLEGE_CLASSES)
    
    where = f"AND s.slug NOT IN ({skip_clause})"
    
    if only_math_college:
        where += f" AND c.slug IN ({college_clause}) AND s.slug = 'mathematiques'"
    elif college_only:
        where += f" AND c.slug IN ({college_clause})"
    
    sql = f'''
    SELECT r."numericId"
    FROM "Resource" r
    JOIN "ResourceContent" rc ON rc."resourceId" = r.id
    JOIN "Subject" s ON s.id = r."subjectId"
    JOIN "Class" c ON c.id = r."classId"
    WHERE rc."fullText" IS NOT NULL
      {where}
    ORDER BY r."numericId"
    LIMIT {limit} OFFSET {offset}
    '''
    result = neon_query(sql)
    if result.get('response') and result['response'][0].get('data', {}).get('rows'):
        return [int(row[0]) for row in result['response'][0]['data']['rows']]
    return []


def fetch_resource(numeric_id):
    sql = f'''
    SELECT r.id, r."fileKey", rc."fullText", rc."pageCount", rc."extractionMethod",
           c.slug AS class_slug, s.slug AS subject_slug
    FROM "Resource" r
    JOIN "ResourceContent" rc ON rc."resourceId" = r.id
    LEFT JOIN "Class" c ON c.id = r."classId"
    LEFT JOIN "Subject" s ON s.id = r."subjectId"
    WHERE r."numericId" = {numeric_id}
    '''
    result = neon_query(sql)
    if not result.get('response') or not result['response'][0].get('data'):
        return None
    return result['response'][0]['data']['rows'][0]


def is_already_in_staging(numeric_id):
    sql = f'SELECT 1 FROM "ResourceContentStaging" WHERE "numericId" = {numeric_id} LIMIT 1'
    result = neon_query(sql)
    if result.get('response') and result['response'][0].get('data', {}).get('rows'):
        return True
    return False


def save_to_staging(numeric_id, resource_id, original_text, original_method, 
                    staging_text, page_count, score, reasons):
    """Save to ResourceContentStaging (UPSERT)."""
    # Sanitize and escape
    staging_safe = sanitize_text(staging_text)
    original_safe = sanitize_text(original_text) if original_text else ''
    original_safe = original_safe[:200000]  # Cap to avoid query size issues
    staging_safe = staging_safe[:200000]
    reasons_str = '|'.join(reasons)
    
    # Use sql_escape for all text fields
    sql = f'''
    INSERT INTO "ResourceContentStaging" 
        ("resourceId", "numericId", "originalText", "originalMethod", "stagingText", "stagingMethod", "pageCount", "degradationScore", "degradationReasons", "isApplied")
    VALUES 
        ({sql_escape(resource_id)}, {numeric_id}, {sql_escape(original_safe)}, {sql_escape(original_method or "")}, {sql_escape(staging_safe)}, {sql_escape('tesseract-5.3.0-ara+fra+eng')}, {page_count}, {score}, {sql_escape(reasons_str)}, FALSE)
    ON CONFLICT ("resourceId") DO UPDATE SET
        "stagingText" = EXCLUDED."stagingText",
        "pageCount" = EXCLUDED."pageCount",
        "degradationScore" = EXCLUDED."degradationScore",
        "degradationReasons" = EXCLUDED."degradationReasons",
        "extractedAt" = NOW()
    '''
    neon_query(sql)


def process_one(numeric_id, force_reocr=False, dry_run=False):
    """Process one resource: detect + re-OCR + save to staging."""
    r = fetch_resource(numeric_id)
    if not r:
        return {'id': numeric_id, 'status': 'NOT_FOUND'}
    resource_id, file_key, full_text, page_count, method, class_slug, subject_slug = r
    text = full_text or ''
    
    # Skip if subject in SKIP_SUBJECTS
    if subject_slug in SKIP_SUBJECTS:
        return {'id': numeric_id, 'status': 'SKIP_SUBJECT', 'subject': subject_slug}
    
    # Detect degradation
    is_deg, score, reasons = detect_degradation(text)
    
    if not is_deg and not force_reocr:
        return {'id': numeric_id, 'status': 'CLEAN', 'score': score, 'class': class_slug, 'subject': subject_slug}
    
    # Already in staging?
    if is_already_in_staging(numeric_id) and not force_reocr:
        return {'id': numeric_id, 'status': 'ALREADY_IN_STAGING', 'score': score, 'class': class_slug, 'subject': subject_slug}
    
    # Re-OCR
    try:
        pdf_bytes = download_pdf(file_key)
        new_text, pages = ocr_pdf(pdf_bytes, max_pages=3, dpi=200, lang='ara+fra+eng')
        new_text = new_text.strip()
        # Clean RTL marks
        new_text_clean = clean_rtl_marks(new_text)
        
        # Re-detect on cleaned text
        is_deg_new, score_new, reasons_new = detect_degradation(new_text_clean)
        improved = score_new < score
        
        if dry_run:
            return {
                'id': numeric_id, 'status': 'DRY_RUN_OCR_DONE', 
                'score_before': score, 'score_after': score_new,
                'improved': improved, 'class': class_slug, 'subject': subject_slug,
                'reasons_before': reasons, 'reasons_after': reasons_new,
                'chars_before': len(text), 'chars_after': len(new_text_clean),
            }
        
        # Save to staging
        save_to_staging(numeric_id, resource_id, text, method, new_text_clean, pages, score, reasons)
        return {
            'id': numeric_id, 'status': 'OCR_STAGED', 
            'score_before': score, 'score_after': score_new,
            'improved': improved, 'class': class_slug, 'subject': subject_slug,
            'reasons_before': reasons, 'reasons_after': reasons_new,
            'chars_before': len(text), 'chars_after': len(new_text_clean),
        }
    except Exception as e:
        return {'id': numeric_id, 'status': 'ERROR', 'error': str(e)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ids', help='comma-separated numericIds')
    ap.add_argument('--limit', type=int, default=50)
    ap.add_argument('--offset', type=int, default=0)
    ap.add_argument('--math-college-only', action='store_true', help='Only Math collège (7-9)')
    ap.add_argument('--college-only', action='store_true', help='All collège (7-9), skip lycée')
    ap.add_argument('--workers', type=int, default=1, help='Parallel workers')
    ap.add_argument('--force', action='store_true', help='Force re-OCR even if not degraded')
    ap.add_argument('--dry-run', action='store_true', default=True)
    ap.add_argument('--apply', action='store_true', help='Actually save to staging (overrides --dry-run)')
    args = ap.parse_args()
    
    dry_run = not args.apply
    force = args.force
    
    print(f"{'[DRY-RUN]' if dry_run else '[APPLY]'} Mode: {'dry-run' if dry_run else 'saving to staging'}")
    print(f"Filters: math-college-only={args.math_college_only}, college-only={args.college_only}")
    
    if args.ids:
        ids = [int(x) for x in args.ids.split(',')]
    else:
        ids = get_candidate_ids(
            args.limit, args.offset, 
            only_math_college=args.math_college_only,
            college_only=args.college_only,
        )
    
    if not ids:
        print("No IDs to process")
        return
    
    print(f"Processing {len(ids)} files (workers={args.workers}, force={force})")
    print(f"{'─' * 90}")
    
    start = time.time()
    results = []
    
    if args.workers > 1:
        # Parallel
        with ProcessPoolExecutor(max_workers=args.workers) as ex:
            futures = {ex.submit(process_one, nid, force, dry_run): nid for nid in ids}
            done_count = 0
            for fut in as_completed(futures):
                res = fut.result()
                results.append(res)
                done_count += 1
                # Log progress every 25 files or for OCR_STAGED
                if done_count % 25 == 0 or res['status'] in ('OCR_STAGED', 'ERROR'):
                    print(f"  [{done_count}/{len(ids)}] {res['status']} #{res['id']} (elapsed {time.time()-start:.0f}s)", flush=True)
    else:
        # Sequential
        for i, nid in enumerate(ids):
            res = process_one(nid, force, dry_run)
            results.append(res)
            if (i + 1) % 25 == 0 or res['status'] in ('OCR_STAGED', 'ERROR'):
                print(f"  [{i+1}/{len(ids)}] {res['status']} #{res['id']} (elapsed {time.time()-start:.0f}s)", flush=True)
    
    elapsed = time.time() - start
    
    # Summary
    print(f"\n{'=' * 90}")
    print(f"SUMMARY ({elapsed:.1f}s)")
    print(f"{'=' * 90}")
    
    by_status = {}
    for r in results:
        s = r['status']
        by_status.setdefault(s, []).append(r)
    
    for status, items in sorted(by_status.items()):
        print(f"  {status}: {len(items)}")
    
    if any(r['status'] in ('OCR_STAGED', 'DRY_RUN_OCR_DONE') for r in results):
        print(f"\nDetails (staged/dry-run OCRs):")
        for r in results:
            if r['status'] in ('OCR_STAGED', 'DRY_RUN_OCR_DONE'):
                improved = '✓' if r.get('improved') else '✗'
                reasons_b = ','.join(r.get('reasons_before', []))
                reasons_a = ','.join(r.get('reasons_after', []))
                print(f"  {improved} #{r['id']} ({r.get('class','?')}/{r.get('subject','?')}): {r.get('score_before','?')}→{r.get('score_after','?')}, chars {r.get('chars_before','?')}→{r.get('chars_after','?')}")
                print(f"     before: {reasons_b}")
                print(f"     after:  {reasons_a}")


if __name__ == '__main__':
    main()
