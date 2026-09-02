#!/usr/bin/env python3
"""Test Tesseract OCR on image-based PDF."""
import fitz
import subprocess
import time
from pathlib import Path

PDF = "ocr_test.pdf"

# Step 1: Convert PDF to images
print("Step 1: Converting PDF to images...")
doc = fitz.open(PDF)
images = []
for i, page in enumerate(doc):
    # Render at 300 DPI (good for OCR)
    pix = page.get_pixmap(dpi=300)
    img_path = f"page_{i+1}.png"
    pix.save(img_path)
    images.append(img_path)
    print(f"  Page {i+1}: {pix.width}x{pix.height}px")
doc.close()

# Step 2: Run Tesseract on each image
print("\nStep 2: Tesseract OCR (FR+ARA)...")
total_words = 0
for img in images:
    t0 = time.time()
    # Run with French + Arabic
    result = subprocess.run(
        ["tesseract", img, "-", "-l", "fra+ara", "--psm", "6"],
        capture_output=True, text=True, timeout=60
    )
    text = result.stdout.strip()
    words = len(text.split())
    total_words += words
    print(f"  {img}: {words} words in {time.time()-t0:.1f}s")
    if words > 0:
        print(f"    Sample: {text[:150]}...")

print(f"\n=== TOTAL: {total_words} words extracted ===")
