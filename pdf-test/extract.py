#!/usr/bin/env python3
"""Extract text from PDFs using PyMuPDF, with header/footer detection."""
import fitz
import json
import sys
from pathlib import Path

def extract_pdf(pdf_path):
    """Extract text from PDF with metadata."""
    doc = fitz.open(pdf_path)
    pages = []
    full_text = []
    header_text = []
    footer_text = []
    body_text = []

    for i, page in enumerate(doc):
        text = page.get_text("text")
        if not text.strip():
            pages.append({"page": i+1, "text": "", "isEmpty": True})
            continue

        lines = text.split('\n')
        # Header = first 3 lines, footer = last 3 lines (heuristic)
        if len(lines) > 6:
            header = '\n'.join(lines[:3])
            footer = '\n'.join(lines[-3:])
            body = '\n'.join(lines[3:-3])
        else:
            header = '\n'.join(lines[:2])
            footer = '\n'.join(lines[-2:]) if len(lines) > 2 else ""
            body = '\n'.join(lines[2:-2] if len(lines) > 4 else lines[2:])

        pages.append({
            "page": i+1,
            "header": header.strip(),
            "body": body.strip(),
            "footer": footer.strip(),
            "charCount": len(text),
        })
        full_text.append(text)
        header_text.append(header)
        footer_text.append(footer)
        body_text.append(body)

    doc.close()

    return {
        "pageCount": len(pages),
        "fullText": "\n\n--- PAGE BREAK ---\n\n".join(full_text),
        "headerText": "\n".join([p["header"] for p in pages if p.get("header")]),
        "footerText": "\n".join([p["footer"] for p in pages if p.get("footer")]),
        "bodyText": "\n\n--- PAGE BREAK ---\n\n".join(body_text),
        "wordCount": sum(len(p.get("body", "").split()) for p in pages),
        "pages": pages,
    }

if __name__ == "__main__":
    pdfs = sorted(Path(".").glob("*.pdf"))
    results = {}
    for pdf in pdfs:
        try:
            data = extract_pdf(pdf)
            results[pdf.stem] = data
            print(f"✓ {pdf.name}: {data['pageCount']}p, {data['wordCount']} words")
        except Exception as e:
            print(f"✗ {pdf.name}: ERROR {e}")
            results[pdf.stem] = {"error": str(e)}

    with open("extracted.json", "w") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\n→ Saved to extracted.json ({sum(r.get('pageCount', 0) for r in results.values())} pages total)")
