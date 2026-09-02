#!/usr/bin/env python3
"""
Math collège DEVOIR bulk re-OCR — RATE LIMITED.

- Only Math collège (7eme/8eme/9eme) — skip lycée, skip other subjects
- Only DEVOIR types (excludes EXERCICE, EXAMEN, COURSE, RESUME)
- Skip files whose existing OCR is already clean (no degradation)
- Use existing text for clean files (just copy to staging)
- Re-OCR only degraded files (1 worker, delay 3s = ~20 req/min)
- Save to ResourceContentStaging (isApplied=FALSE)

Usage:  # By default, all types (devoirs + series + cours + resumes). Add --only-devoirs to filter.
  python3 bulk_reocr_math_devoirs.py --limit 200
  python3 bulk_reocr_math_devoirs.py --limit 10000
  python3 bulk_reocr_math_devoirs.py --class 9eme
"""
import os, json, time, argparse, sys, re
from pathlib import Path
import urllib.request
import fitz
import pytesseract
from PIL import Image
import io

NEON_API_KEY = os.environ.get('NEON_API_KEY', '')
NEON_PROJECT = 'little-silence-94324724'
BRANCH_ID = 'br-purple-recipe-as2x8yyo'
ROLE = 'edutunisie_app'
PROXY_BASE = 'https://examanet.com/api/blob-teacher/'
INTERNAL_TOKEN = 'devmanet-bulk-2026'
TESSERACT_CONFIG = '--oem 1 --psm 6'

# Delay between downloads (to stay under Vercel alert threshold)
DELAY_BETWEEN_DOWNLOADS = 3  # seconds


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
    if val is None: return 'NULL'
    s = str(val)
    s = s.replace('\\', '\\\\')
    s = s.replace("'", "''")
    return f"'{s}'"


def sanitize_text(s):
    return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', s)


def clean_rtl_marks(text):
    for mark in ['\u200e', '\u200f', '\u200b', '\u200c', '\u200d', '\ufeff', '\u2060']:
        text = text.replace(mark, '')
    text = re.sub(r'  +', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def download_pdf(file_key):
    url = PROXY_BASE + file_key
    req = urllib.request.Request(url, headers={'X-Internal-Token': INTERNAL_TOKEN})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def ocr_pdf(pdf_bytes, max_pages=3, dpi=200, lang='ara+fra+eng'):
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


# Degradation detection (same as bulk_reocr_to_staging.py)
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


def detect_degradation(text):
    if not text or len(text.strip()) < 50:
        return True, 95, ['text_too_short']
    reasons = []
    score = 0
    arabic_count = sum(1 for ch in text if is_arabic_char(ch))
    greek_count = sum(1 for ch in text if is_greek_char(ch))
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


def get_math_devoir_candidates(limit=10000, offset=0, class_filter=None, only_devoirs=False):
    """Get Math collège files (all types by default).
    
    Args:
        only_devoirs: if True, filter by DEVOIR/EXAMEN type in title.
                      if False (default), include all types (devoirs, séries, cours, résumés).
    """
    class_clause = f"AND c.slug = '{class_filter}'" if class_filter else "AND c.slug IN ('7eme', '8eme', '9eme')"
    
    if only_devoirs:
        type_clause = "AND LOWER(r.title) SIMILAR TO '%(devoir|فرض|مراقبة|تأليفي|contrôle|controle|examen|اختبار|امتحان)%'"
    else:
        type_clause = ""  # All types
    
    sql = f'''
    SELECT r."numericId"
    FROM "Resource" r
    JOIN "ResourceContent" rc ON rc."resourceId" = r.id
    JOIN "Subject" s ON s.id = r."subjectId"
    JOIN "Class" c ON c.id = r."classId"
    WHERE rc."fullText" IS NOT NULL
      AND s.slug = 'mathematiques'
      {class_clause}
      {type_clause}
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
           c.slug AS class_slug, s.slug AS subject_slug, r.title
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


def save_to_staging(numeric_id, resource_id, staging_text, page_count,
                    staging_method, original_text=None, original_method=None,
                    degradation_score=None, degradation_reasons=None):
    """Save to ResourceContentStaging (UPSERT).
    
    If original_text is None and degradation_score is None, this is a "copy existing" 
    (no re-OCR needed, just stage the good text).
    """
    staging_safe = sanitize_text(staging_text)[:200000]
    
    if original_text is None:
        # No re-OCR — just stage the existing good text
        original_clause = 'NULL'
        original_method_clause = 'NULL'
        score_clause = 'NULL'
        reasons_clause = 'NULL'
    else:
        original_safe = sanitize_text(original_text)[:200000]
        original_clause = sql_escape(original_safe)
        original_method_clause = sql_escape(original_method or '')
        score_clause = str(degradation_score or 0)
        reasons_clause = sql_escape('|'.join(degradation_reasons or []))
    
    sql = f'''
    INSERT INTO "ResourceContentStaging" 
        ("resourceId", "numericId", "originalText", "originalMethod", "stagingText", "stagingMethod", "pageCount", "degradationScore", "degradationReasons", "isApplied")
    VALUES 
        ({sql_escape(resource_id)}, {numeric_id}, {original_clause}, {original_method_clause}, {sql_escape(staging_safe)}, {sql_escape(staging_method)}, {page_count}, {score_clause}, {reasons_clause}, FALSE)
    ON CONFLICT ("resourceId") DO UPDATE SET
        "stagingText" = EXCLUDED."stagingText",
        "stagingMethod" = EXCLUDED."stagingMethod",
        "pageCount" = EXCLUDED."pageCount",
        "extractedAt" = NOW()
    '''
    neon_query(sql)


def process_one(numeric_id, force=False, dry_run=True, verbose=False):
    """Process one resource. Returns status dict.
    
    Strategy:
    1. Check if already in staging → skip
    2. Detect degradation on existing text
    3. If CLEAN → use existing text as staging (no re-OCR, no download)
    4. If DEGRADED → re-OCR with Tesseract (rate limited)
    """
    r = fetch_resource(numeric_id)
    if not r:
        return {'id': numeric_id, 'status': 'NOT_FOUND'}
    resource_id, file_key, full_text, page_count, method, class_slug, subject_slug, title = r
    text = full_text or ''
    
    if is_already_in_staging(numeric_id) and not force:
        return {'id': numeric_id, 'status': 'ALREADY_IN_STAGING'}
    
    is_deg, score, reasons = detect_degradation(text)
    
    if not is_deg and not force:
        # Clean — just stage the existing text
        if dry_run:
            return {
                'id': numeric_id, 'status': 'DRY_RUN_CLEAN_COPY',
                'class': class_slug, 'title': title[:60],
                'action': 'Would copy existing text (no download)',
            }
        save_to_staging(
            numeric_id=numeric_id,
            resource_id=resource_id,
            staging_text=text,
            page_count=page_count or 0,
            staging_method=method or 'existing',
        )
        return {
            'id': numeric_id, 'status': 'CLEAN_COPIED',
            'class': class_slug, 'title': title[:60],
        }
    
    # Degraded — need to re-OCR
    if dry_run:
        return {
            'id': numeric_id, 'status': 'DRY_RUN_OCR_NEEDED',
            'class': class_slug, 'title': title[:60],
            'score': score, 'reasons': reasons,
        }
    
    # Re-OCR
    try:
        time.sleep(DELAY_BETWEEN_DOWNLOADS)  # Rate limit
        pdf_bytes = download_pdf(file_key)
        new_text, pages = ocr_pdf(pdf_bytes, max_pages=3, dpi=200, lang='ara+fra+eng')
        new_text = new_text.strip()
        new_text_clean = clean_rtl_marks(new_text)
        
        is_deg_new, score_new, reasons_new = detect_degradation(new_text_clean)
        improved = score_new < score
        
        save_to_staging(
            numeric_id=numeric_id,
            resource_id=resource_id,
            staging_text=new_text_clean,
            page_count=pages,
            staging_method='tesseract-5.3.0-ara+fra+eng',
            original_text=text,
            original_method=method,
            degradation_score=score,
            degradation_reasons=reasons,
        )
        return {
            'id': numeric_id, 'status': 'OCR_STAGED',
            'class': class_slug, 'title': title[:60],
            'score_before': score, 'score_after': score_new,
            'improved': improved,
        }
    except Exception as e:
        return {'id': numeric_id, 'status': 'ERROR', 'error': str(e)}


def main():
    global DELAY_BETWEEN_DOWNLOADS
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=200)
    ap.add_argument('--offset', type=int, default=0)
    ap.add_argument('--class', dest='class_filter', help='Filter by class (7eme/8eme/9eme)')
    ap.add_argument('--only-devoirs', action='store_true', help='Filter only DEVOIR/EXAMEN types')
    ap.add_argument('--workers', type=int, default=1, help='Always 1 for rate limit safety')
    ap.add_argument('--dry-run', action='store_true', default=True)
    ap.add_argument('--apply', action='store_true', help='Save to staging (overrides --dry-run)')
    ap.add_argument('--delay', type=float, default=DELAY_BETWEEN_DOWNLOADS,
                    help=f'Seconds between downloads (default {DELAY_BETWEEN_DOWNLOADS})')

    args = ap.parse_args()
    
    dry_run = not args.apply
    DELAY_BETWEEN_DOWNLOADS = args.delay
    
    print(f"{'[DRY-RUN]' if dry_run else '[APPLY]'} Mode: {'dry-run' if dry_run else 'saving to staging'}")
    print(f"Target: Math collège ({'DEVOIR only' if args.only_devoirs else 'all types: devoirs, séries, cours, résumés'})")
    print(f"Rate limit: {DELAY_BETWEEN_DOWNLOADS}s between downloads (max ~20 req/min)")
    if args.class_filter:
        print(f"Class filter: {args.class_filter}")
    print(f"{'─' * 90}")
    
    ids = get_math_devoir_candidates(args.limit, args.offset, args.class_filter, only_devoirs=args.only_devoirs)
    
    if not ids:
        print("No Math collège DEVOIR files found")
        return
    
    print(f"Found {len(ids)} Math collège DEVOIR files")
    
    start = time.time()
    results = []
    
    # Always sequential (1 worker) for rate limit safety
    for i, nid in enumerate(ids):
        r = process_one(nid, dry_run=dry_run)
        results.append(r)
        # Log every 25 or on interesting status
        if (i + 1) % 25 == 0 or r['status'] in ('OCR_STAGED', 'ERROR'):
            elapsed = time.time() - start
            print(f"  [{i+1}/{len(ids)}] {r['status']} #{r['id']} (elapsed {elapsed:.0f}s)", flush=True)
    
    # Summary
    print(f"\n{'=' * 90}")
    print(f"SUMMARY ({time.time()-start:.1f}s)")
    print(f"{'=' * 90}")
    
    by_status = {}
    for r in results:
        by_status.setdefault(r['status'], []).append(r)
    
    for status, items in sorted(by_status.items()):
        print(f"  {status}: {len(items)}")
    
    # Estimate for full run
    if dry_run:
        n_clean = len(by_status.get('DRY_RUN_CLEAN_COPY', []))
        n_ocr_needed = len(by_status.get('DRY_RUN_OCR_NEEDED', []))
        n_already = len(by_status.get('ALREADY_IN_STAGING', []))
        n_total = len(results)
        
        if n_ocr_needed > 0:
            est_time_min = (n_ocr_needed * DELAY_BETWEEN_DOWNLOADS) / 60
            print(f"\n📊 DRY-RUN analysis:")
            print(f"   Already in staging: {n_already}")
            print(f"   Clean (no re-OCR):  {n_clean} → would just copy existing text")
            print(f"   Degraded (re-OCR):  {n_ocr_needed} → would download + Tesseract")
            print(f"   Estimated time:     {est_time_min:.0f} min ({n_ocr_needed * DELAY_BETWEEN_DOWNLOADS:.0f}s at {DELAY_BETWEEN_DOWNLOADS}s/download)")
            print(f"   Estimated req rate: {60/DELAY_BETWEEN_DOWNLOADS:.1f} req/min (safe)")


if __name__ == '__main__':
    main()
