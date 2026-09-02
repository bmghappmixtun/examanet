#!/usr/bin/env python3
"""Extract text from a single PDF and output JSON to stdout.
Usage: python3 extract_one.py /path/to/file.pdf
Output: JSON {"text": "...", "method": "pymupdf|tesseract", "pageCount": N, "durationMs": N}
"""
import sys, json, re, time
from pathlib import Path
import fitz

def extract_pymupdf(pdf_path, max_pages=3):
    doc = fitz.open(pdf_path)
    all_text = []
    for i in range(min(doc.page_count, max_pages)):
        all_text.append(doc[i].get_text())
    page_count = doc.page_count
    doc.close()
    return '\n\n--- PAGE BREAK ---\n\n'.join(all_text), page_count

def extract_tesseract(pdf_path, max_pages=3, dpi=220):
    import pytesseract
    from PIL import Image
    import io
    doc = fitz.open(pdf_path)
    all_text = []
    for i in range(min(doc.page_count, max_pages)):
        page = doc[i]
        pix = page.get_pixmap(dpi=dpi)
        img = Image.open(io.BytesIO(pix.tobytes('png')))
        try:
            t = pytesseract.image_to_string(img, lang='ara+fra+eng', config='--oem 1 --psm 6')
        except Exception:
            t = pytesseract.image_to_string(img, lang='eng', config='--oem 1 --psm 6')
        all_text.append(t)
    page_count = doc.page_count
    doc.close()
    return '\n\n--- PAGE BREAK ---\n\n'.join(all_text), page_count

def text_quality(text):
    if not text: return 0
    t = text.strip()
    if len(t) < 50: return 5
    words = re.findall(r'\b\w{3,}\b', t)
    if len(words) < 20: return 10
    alnum = sum(1 for c in t if c.isalnum() or c.isspace())
    ratio = alnum / len(t) if t else 0
    score = min(100, len(words) // 5)
    if ratio > 0.7: score = min(100, score + 20)
    return score

if __name__ == '__main__':
    pdf_path = sys.argv[1]
    if not Path(pdf_path).exists():
        print(json.dumps({'error': 'file_not_found'}))
        sys.exit(1)
    
    t0 = time.time()
    
    # Try PyMuPDF
    mupdf_text, pc1 = extract_pymupdf(pdf_path)
    mupdf_score = text_quality(mupdf_text)
    
    if mupdf_score >= 30:
        text = mupdf_text
        method = 'pymupdf'
        page_count = pc1
    else:
        # Try Tesseract
        tess_text, pc2 = extract_tesseract(pdf_path)
        tess_score = text_quality(tess_text)
        if tess_score >= 30 or len(tess_text) > len(mupdf_text):
            text = tess_text
            method = 'tesseract'
            page_count = pc2
        else:
            text = mupdf_text
            method = 'pymupdf'
            page_count = pc1
    
    duration_ms = int((time.time() - t0) * 1000)
    print(json.dumps({
        'text': text,
        'method': method,
        'pageCount': page_count,
        'durationMs': duration_ms,
    }, ensure_ascii=False))
