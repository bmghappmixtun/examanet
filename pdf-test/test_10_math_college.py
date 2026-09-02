#!/usr/bin/env python3
"""
Test 10 Math collège files: detect OCR degradation + re-OCR if needed
+ before/after comparison + summary
"""
import os, json, time, sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
from detect_ocr_degradation import (
    neon_query, download_pdf, ocr_pdf, detect_degradation,
    fetch_resource, save_tesseract_text,
)
import re

# 10 Math collège IDs (mix of clean + known degraded)
TEST_IDS = [1052, 2682, 2654, 2755, 718, 3282, 1338, 1077, 1054, 2095]

def main():
    print(f"Testing {len(TEST_IDS)} Math collège files")
    print(f"=" * 90)
    
    results = []
    for nid in TEST_IDS:
        r = fetch_resource(nid)
        if not r:
            print(f"#{nid}: NOT FOUND")
            continue
        resource_id, file_key, full_text, page_count, method, class_slug, subject_slug = r
        text = full_text or ''
        
        is_deg, score, reasons = detect_degradation(text)
        
        # Header
        print(f"\n{'─' * 90}")
        print(f"#{nid} ({class_slug}/{subject_slug}) - {len(text)} chars, {page_count} pages, method={method}")
        print(f"  Score: {score} | Degraded: {'YES' if is_deg else 'NO'} | Reasons: {', '.join(reasons) or 'clean'}")
        
        if not is_deg:
            print(f"  ⏭ Clean, skipping re-OCR")
            results.append({
                'id': nid, 'degraded': False, 'score_before': score,
                'score_after': score, 'improved': False, 'reocr_chars': 0,
            })
            continue
        
        # Re-OCR
        try:
            pdf_bytes = download_pdf(file_key)
            new_text, pages = ocr_pdf(pdf_bytes, max_pages=3, dpi=200, lang='ara+fra+eng')
            new_text = new_text.strip()
            is_deg_new, score_new, reasons_new = detect_degradation(new_text)
            improved = score_new < score
            
            print(f"  📥 Tesseract OCR: {len(new_text)} chars, {pages} pages")
            print(f"  📊 New score: {score_new} | Degraded: {'YES' if is_deg_new else 'NO'} | Reasons: {', '.join(reasons_new) or 'clean'}")
            print(f"  {'✅ IMPROVED' if improved else '⚠️ NOT IMPROVED'}")
            
            # Show comparison: first 200 chars of old vs new
            old_preview = text[:200].replace('\n', ' ')
            new_preview = new_text[:200].replace('\n', ' ')
            print(f"  OLD: {old_preview!r}")
            print(f"  NEW: {new_preview!r}")
            
            # Search for prof name in both
            # Look for "الأستاذ" or "Mr/Mme" patterns
            old_profs = re.findall(r'الأستاذ[ة]?\s*[:،]?\s*[\u0600-\u06FF\s]{2,80}', text)
            new_profs = re.findall(r'الأستاذ[ة]?\s*[:،]?\s*[\u0600-\u06FF\s]{2,80}', new_text)
            print(f"  📝 Old prof: {old_profs[0] if old_profs else 'NOT FOUND'}")
            print(f"  📝 New prof: {new_profs[0] if new_profs else 'NOT FOUND'}")
            
            results.append({
                'id': nid, 'degraded': True, 'score_before': score, 'score_after': score_new,
                'improved': improved, 'reocr_chars': len(new_text),
                'old_prof': old_profs[0] if old_profs else None,
                'new_prof': new_profs[0] if new_profs else None,
            })
        except Exception as e:
            print(f"  ❌ Error: {e}")
            results.append({
                'id': nid, 'degraded': True, 'score_before': score, 'score_after': score,
                'improved': False, 'reocr_chars': 0, 'error': str(e),
            })
    
    # Summary
    print(f"\n{'=' * 90}")
    print(f"SUMMARY")
    print(f"{'=' * 90}")
    print(f"Total tested: {len(results)}")
    print(f"Degraded: {sum(1 for r in results if r['degraded'])}/{len(results)} ({sum(1 for r in results if r['degraded'])*100/len(results):.0f}%)")
    if any(r['degraded'] for r in results):
        improved = [r for r in results if r.get('improved')]
        print(f"Improved after re-OCR: {len(improved)}/{sum(1 for r in results if r['degraded'])}")
        print(f"\nDetails:")
        for r in results:
            if r['degraded']:
                status = '✅' if r.get('improved') else '⚠️'
                prof_change = ''
                if r.get('old_prof') and r.get('new_prof'):
                    prof_change = f" | prof: {r['old_prof'][:30]}!r → {r['new_prof'][:30]!r}"
                elif r.get('new_prof'):
                    prof_change = f" | prof: NEW {r['new_prof'][:30]!r}"
                print(f"  {status} #{r['id']}: score {r['score_before']} → {r['score_after']}, chars {r['reocr_chars']}{prof_change}")


if __name__ == '__main__':
    main()
