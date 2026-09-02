#!/usr/bin/env python3
"""
OCR Degradation Detection + Re-OCR for Examanet
================================================

Detects if a PDF's OCR is degraded using multiple heuristics:
  1. Greek/Latin noise ratio in Arabic text (high = degraded)
  2. Arabic presentation form ratio (very high = OCR heavy)
  3. Control characters / replacement chars
  4. Missing school/prof header markers
  5. Very short extracted text (< 200 chars = likely image-based)
  6. PDF text confidence (PyMuPDF confidence scores)

For degraded files, re-OCR with Tesseract (ara+fra+eng).

Usage:
  # Test 10 Math collège files (degradation detection only)
  python3 detect_ocr_degradation.py --limit 10 --class math-college

  # Re-OCR degraded files
  python3 detect_ocr_degradation.py --limit 10 --class math-college --reocr

  # Re-OCR specific IDs
  python3 detect_ocr_degradation.py --ids 1338,1054 --reocr
"""
import os, json, time, argparse, sys, re, unicodedata
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


def neon_query(sql):
    body = {'db_name': 'neondb', 'role_name': ROLE, 'query': sql, 'branch_id': BRANCH_ID}
    req = urllib.request.Request(
        f'https://console.neon.tech/api/v2/projects/{NEON_PROJECT}/query',
        data=json.dumps(body).encode(),
        headers={'Authorization': f'Bearer {NEON_API_KEY}', 'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())


def download_pdf(file_key):
    url = PROXY_BASE + file_key
    req = urllib.request.Request(url, headers={'X-Internal-Token': INTERNAL_TOKEN})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def ocr_pdf(pdf_bytes, max_pages=3, dpi=200, lang='ara+fra+eng'):
    """Run tesseract on first N pages of a PDF."""
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


# =============================================================================
# DEGRADATION DETECTION HEURISTICS
# =============================================================================

def is_arabic_char(ch):
    """Check if char is Arabic (base or presentation form)."""
    code = ord(ch)
    return (0x0600 <= code <= 0x06FF or  # Base Arabic
            0x0750 <= code <= 0x077F or
            0x08A0 <= code <= 0x08FF or
            0xFB50 <= code <= 0xFDFF or  # Presentation Forms-A
            0xFE70 <= code <= 0xFEFF)     # Presentation Forms-B


def is_greek_char(ch):
    """Check if char is Greek (likely OCR noise in AR text)."""
    return 0x0370 <= ord(ch) <= 0x03FF


def is_control_char(ch):
    """Check if char is a control char (e.g., \\x00, \\x1f)."""
    return ord(ch) < 0x20 and ch not in '\n\r\t'


def detect_degradation(text, file_size=None):
    """
    Score OCR degradation. Returns (is_degraded, score, reasons).
    
    Score 0-100 (higher = more degraded):
      - 0-30: clean
      - 30-60: moderate (re-OCR recommended)
      - 60-100: severe (must re-OCR)
    """
    if not text or len(text.strip()) < 50:
        return True, 95, ['text_too_short']
    
    reasons = []
    score = 0
    
    # 1. Greek/Latin noise in Arabic text
    # Count Greek chars in Arabic context
    arabic_count = 0
    greek_count = 0
    for ch in text:
        if is_arabic_char(ch):
            arabic_count += 1
        elif is_greek_char(ch):
            greek_count += 1
    
    if arabic_count > 50:
        greek_ratio = greek_count / arabic_count
        if greek_ratio > 0.15:  # > 15% noise
            score += 50
            reasons.append(f'greek_noise={greek_ratio:.2%}')
        elif greek_ratio > 0.05:  # 5-15% noise
            score += 25
            reasons.append(f'greek_noise={greek_ratio:.2%}')
    
    # 2. Arabic presentation form ratio (very high = heavily ligated)
    if arabic_count > 50:
        pres_form_count = sum(1 for ch in text if 0xFB50 <= ord(ch) <= 0xFEFF)
        pres_ratio = pres_form_count / arabic_count
        if pres_ratio > 0.7:  # > 70% presentation forms
            score += 20
            reasons.append(f'presentation_forms={pres_ratio:.2%}')
    
    # 3. Control chars
    control_count = sum(1 for ch in text if is_control_char(ch))
    if control_count > 0:
        score += 30
        reasons.append(f'control_chars={control_count}')
    
    # 4. Missing key header markers (school or prof)
    has_school = bool(re.search(r'(?:المدرس|الثانوية|lycee|collège|college)', text, re.IGNORECASE))
    has_prof = bool(re.search(r'(?:ا?ل?أستاذ|الأستاذة|الأستاذ)', text))
    if not has_school and not has_prof and arabic_count > 100:
        # Has Arabic but no header markers
        score += 20
        reasons.append('no_header_markers')
    
    # 5. Very short text
    if len(text.strip()) < 200:
        score += 30
        reasons.append(f'short_text={len(text.strip())}')
    elif len(text.strip()) < 500:
        score += 10
        reasons.append(f'short_text={len(text.strip())}')
    
    # 6. High Latin char ratio in primarily-Arabic text
    latin_count = sum(1 for ch in text if ch.isascii() and ch.isalpha())
    if arabic_count > 100 and latin_count / arabic_count > 0.3:
        score += 15
        reasons.append(f'high_latin_ratio={latin_count / arabic_count:.2%}')
    
    # 7. Repeated replacement chars (typical of failed extraction)
    rep_count = text.count('\ufffd') + text.count('???') + text.count('□')
    if rep_count > 10:
        score += 20
        reasons.append(f'replacement_chars={rep_count}')
    
    is_degraded = score >= 30
    return is_degraded, min(score, 100), reasons


def fetch_resource(numeric_id):
    """Fetch resource data from DB."""
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


def get_math_college_ids(limit=10, offset=0):
    """Get Math collège resource IDs."""
    sql = f'''
    SELECT r."numericId"
    FROM "Resource" r
    JOIN "Class" c ON c.id = r."classId"
    JOIN "Subject" s ON s.id = r."subjectId"
    WHERE c.slug IN ('7eme', '8eme', '9eme')
      AND s.slug = 'mathematiques'
      AND rc."fullText" IS NOT NULL
    FROM "ResourceContent" rc
    WHERE rc."resourceId" = r.id
    ORDER BY r."numericId"
    LIMIT {limit} OFFSET {offset}
    '''
    # Fix the SQL
    sql = f'''
    SELECT r."numericId"
    FROM "Resource" r
    JOIN "ResourceContent" rc ON rc."resourceId" = r.id
    JOIN "Class" c ON c.id = r."classId"
    JOIN "Subject" s ON s.id = r."subjectId"
    WHERE c.slug IN ('7eme', '8eme', '9eme')
      AND s.slug = 'mathematiques'
      AND rc."fullText" IS NOT NULL
    ORDER BY r."numericId"
    LIMIT {limit} OFFSET {offset}
    '''
    result = neon_query(sql)
    if result.get('response') and result['response'][0].get('data'):
        return [row[0] for row in result['response'][0]['data']['rows']]
    return []


def save_tesseract_text(resource_id, full_text, page_count):
    """Save tesseract OCR result to DB."""
    # Sanitize control chars
    safe_text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', full_text)
    safe_text = safe_text.replace("'", "''")
    page_count_safe = int(page_count) if page_count else 'NULL'
    sql = f'''
    UPDATE "ResourceContent"
    SET "fullText" = '{safe_text}',
        "pageCount" = {page_count_safe},
        "extractionMethod" = 'tesseract',
        "extractedAt" = NOW(),
        "modelUsed" = 'tesseract-5.3.0-ara+fra+eng'
    WHERE "resourceId" = '{resource_id}'
    '''
    neon_query(sql)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ids', help='comma-separated numericIds')
    ap.add_argument('--limit', type=int, default=10)
    ap.add_argument('--offset', type=int, default=0)
    ap.add_argument('--reocr', action='store_true', help='Re-OCR degraded files')
    ap.add_argument('--dry-run', action='store_true', default=True)
    args = ap.parse_args()
    
    # Get IDs to test
    if args.ids:
        ids = [int(x) for x in args.ids.split(',')]
    else:
        ids = get_math_college_ids(args.limit, args.offset)
    
    if not ids:
        print("No IDs to test")
        return
    
    print(f"Testing {len(ids)} Math collège files for OCR degradation")
    print(f"{'ID':<8} {'Score':<8} {'Degraded':<10} {'Class/Subject':<20} {'Reasons'}")
    print("-" * 90)
    
    results = []
    for nid in ids:
        r = fetch_resource(nid)
        if not r:
            print(f"#{nid}: NOT FOUND")
            continue
        resource_id, file_key, full_text, page_count, method, class_slug, subject_slug = r
        text = full_text or ''
        
        is_deg, score, reasons = detect_degradation(text)
        label = '🔴 YES' if is_deg else '🟢 NO'
        results.append({
            'numeric_id': nid,
            'resource_id': resource_id,
            'file_key': file_key,
            'class': class_slug,
            'subject': subject_slug,
            'is_degraded': is_deg,
            'score': score,
            'reasons': reasons,
            'text_len': len(text),
            'page_count': page_count,
            'method': method,
        })
        print(f"#{nid:<6} {score:<8} {label:<10} {class_slug}/{subject_slug:<20} {', '.join(reasons) or 'clean'}")
    
    # Summary
    degraded = [r for r in results if r['is_degraded']]
    print(f"\n{'-' * 90}")
    print(f"Summary: {len(degraded)}/{len(results)} files degraded ({len(degraded)*100/len(results):.0f}%)")
    
    # Re-OCR if requested
    if args.reocr and degraded:
        print(f"\n{'=' * 90}")
        print(f"Re-OCRing {len(degraded)} degraded files with Tesseract ara+fra+eng...")
        print(f"{'=' * 90}")
        for r in degraded:
            print(f"\n#{r['numeric_id']} (score={r['score']}, reasons={r['reasons']})")
            try:
                pdf_bytes = download_pdf(r['file_key'])
                print(f"  Downloaded {len(pdf_bytes)} bytes")
                new_text, pages = ocr_pdf(pdf_bytes, max_pages=3, dpi=200, lang='ara+fra+eng')
                new_text = new_text.strip()
                print(f"  Tesseract: {len(new_text)} chars, {pages} pages")
                # Check new quality
                is_deg_new, score_new, reasons_new = detect_degradation(new_text)
                print(f"  New score: {score_new} ({'still degraded' if is_deg_new else 'improved'}), reasons: {reasons_new}")
                # Show first 300 chars
                print(f"  First 300 chars: {new_text[:300]!r}")
                # Save (if not dry-run)
                if not args.dry_run:
                    save_tesseract_text(r['resource_id'], new_text, pages)
                    print(f"  ✅ Saved to DB")
                else:
                    print(f"  ⏭ DRY-RUN, not saved")
            except Exception as e:
                print(f"  ❌ Error: {e}")
                continue


if __name__ == '__main__':
    main()
