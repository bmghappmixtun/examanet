#!/usr/bin/env python3
"""OCR pipeline for image-based PDFs using Tesseract."""
import fitz
import subprocess
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, '.')
from ai_extract import process_pdf, normalize_year

NEON_API_KEY = os.environ.get("NEON_API_KEY", "")
NEON_PROJECT = "little-silence-94324724"
NEON_BRANCH = "br-purple-recipe-as2x8yyo"
NEON_BASE = "https://console.neon.tech/api/v2/projects"


def run_sql(query):
    payload = json.dumps({
        "db_name": "neondb",
        "role_name": "edutunisie_app",
        "query": query,
        "branch_id": NEON_BRANCH,
    })
    req = urllib.request.Request(
        f"{NEON_BASE}/{NEON_PROJECT}/query",
        data=payload.encode(),
        headers={"Authorization": f"Bearer {NEON_API_KEY}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def array_literal(arr):
    if not arr:
        return "ARRAY[]::text[]"
    if isinstance(arr, str):
        try: arr = json.loads(arr)
        except: return "ARRAY[]::text[]"
    if not isinstance(arr, list):
        return "ARRAY[]::text[]"
    items = ",".join(f"'{str(s).replace(chr(39), chr(39)+chr(39))}'" for s in arr)
    return f"ARRAY[{items}]::text[]"


def text_or_null(s):
    if s is None or s == "":
        return "NULL"
    return f"'{str(s).replace(chr(39), chr(39)+chr(39))}'"


def int_or_null(n):
    if n is None: return "NULL"
    return str(int(n))


def ocr_pdf(pdf_path, work_dir):
    """Convert PDF to images and OCR each page with Tesseract."""
    doc = fitz.open(pdf_path)
    full_text_parts = []
    header_parts = []
    footer_parts = []
    body_parts = []
    page_data = []
    total_words = 0

    for i, page in enumerate(doc):
        # Convert to high-res image
        pix = page.get_pixmap(dpi=300)
        img_path = work_dir / f"page_{i+1}.png"
        pix.save(str(img_path))

        # OCR with French + Arabic
        try:
            result = subprocess.run(
                ["tesseract", str(img_path), "-", "-l", "fra+ara", "--psm", "6"],
                capture_output=True, text=True, timeout=120
            )
            text = result.stdout.strip()
        except Exception as e:
            text = f"[OCR error: {e}]"

        # Clean up image
        img_path.unlink()

        words = len(text.split())
        total_words += words
        full_text_parts.append(text)

        # Split header/body/footer (rough heuristic)
        lines = text.split('\n')
        if len(lines) > 6:
            header_parts.append('\n'.join(lines[:3]))
            footer_parts.append('\n'.join(lines[-3:]))
            body_parts.append('\n'.join(lines[3:-3]))
        else:
            header_parts.append('\n'.join(lines[:2]))
            footer_parts.append('')
            body_parts.append('\n'.join(lines[2:]))

        page_data.append({
            "page": i+1,
            "text": text,
            "wordCount": words,
        })

    doc.close()

    return {
        "pageCount": len(page_data),
        "wordCount": total_words,
        "fullText": "\n\n--- PAGE BREAK ---\n\n".join(full_text_parts),
        "headerText": "\n".join(header_parts),
        "footerText": "\n".join(footer_parts),
        "bodyText": "\n\n--- PAGE BREAK ---\n\n".join(body_parts),
        "pages": page_data,
    }


def store_results(numeric_id, content_data, metadata, summary):
    content_sql = f"""
    INSERT INTO "ResourceContent" ("id", "resourceId", "fullText", "pageCount", "wordCount", "extractionMethod", "extractionDurationMs", "modelUsed")
    SELECT gen_random_uuid()::text, r.id, {text_or_null(content_data.get('fullText'))}, {int_or_null(content_data.get('pageCount'))}, {int_or_null(content_data.get('wordCount'))}, 'tesseract-ocr', {int_or_null(content_data.get('durationMs'))}, {text_or_null('pymupdf+tesseract+gpt-4o-mini')}
    FROM "Resource" r WHERE r."numericId" = {numeric_id}
    ON CONFLICT ("resourceId") DO UPDATE SET
      "fullText" = EXCLUDED."fullText",
      "pageCount" = EXCLUDED."pageCount",
      "wordCount" = EXCLUDED."wordCount",
      "extractionMethod" = 'tesseract-ocr',
      "extractedAt" = NOW()
    RETURNING "resourceId"
    """
    meta_sql = f"""
    INSERT INTO "ResourceMetadata" ("id", "resourceId", "profNames", "schoolName", "year", "type", "subtype", "subject", "dossierTechnique", "systemName", "duration", "level", "keyPoints", "topics", "difficulty", "estimatedTimeMinutes", "prerequisites", "keyInsights", "modelUsed")
    SELECT gen_random_uuid()::text, r.id,
      {array_literal(metadata.get('profNames'))},
      {text_or_null(metadata.get('schoolName'))},
      {text_or_null(metadata.get('year'))},
      {text_or_null(metadata.get('type'))},
      {text_or_null(metadata.get('subtype'))},
      {text_or_null(metadata.get('subject'))},
      {text_or_null(metadata.get('dossierTechnique'))},
      {text_or_null(metadata.get('systemName'))},
      {text_or_null(metadata.get('duration'))},
      {text_or_null(metadata.get('level'))},
      {array_literal(metadata.get('keyPoints'))},
      {array_literal(metadata.get('topics'))},
      {text_or_null(metadata.get('difficulty'))},
      {int_or_null(metadata.get('estimatedTimeMinutes'))},
      {array_literal(metadata.get('prerequisites'))},
      {array_literal(metadata.get('keyInsights'))},
      'gpt-4o-mini'
    FROM "Resource" r WHERE r."numericId" = {numeric_id}
    ON CONFLICT ("resourceId") DO UPDATE SET
      "profNames" = EXCLUDED."profNames",
      "schoolName" = EXCLUDED."schoolName",
      "year" = EXCLUDED."year",
      "type" = EXCLUDED."type",
      "subtype" = EXCLUDED."subtype",
      "subject" = EXCLUDED."subject",
      "dossierTechnique" = EXCLUDED."dossierTechnique",
      "systemName" = EXCLUDED."systemName",
      "duration" = EXCLUDED."duration",
      "level" = EXCLUDED."level",
      "keyPoints" = EXCLUDED."keyPoints",
      "topics" = EXCLUDED."topics",
      "difficulty" = EXCLUDED."difficulty",
      "estimatedTimeMinutes" = EXCLUDED."estimatedTimeMinutes",
      "prerequisites" = EXCLUDED."prerequisites",
      "keyInsights" = EXCLUDED."keyInsights",
      "extractedAt" = NOW()
    RETURNING "resourceId"
    """
    summary_text = summary.get("summary", "") if isinstance(summary, dict) else ""
    summ_sql = f"""
    INSERT INTO "ResourceSummary" ("id", "resourceId", "summary", "modelUsed")
    SELECT gen_random_uuid()::text, r.id, {text_or_null(summary_text)}, 'gpt-4o-mini'
    FROM "Resource" r WHERE r."numericId" = {numeric_id}
    ON CONFLICT ("resourceId") DO UPDATE SET "summary" = EXCLUDED."summary", "extractedAt" = NOW()
    RETURNING "resourceId"
    """
    r1 = run_sql(content_sql)
    r2 = run_sql(meta_sql)
    r3 = run_sql(summ_sql)
    return r1.get("success") and r2.get("success") and r3.get("success")


def process_one(numeric_id, url, work_dir):
    pdf_path = work_dir / f"{numeric_id}.pdf"
    t0 = time.time()

    # Download
    try:
        urllib.request.urlretrieve(url, str(pdf_path))
    except Exception as e:
        return {"error": f"download_failed: {e}", "duration": time.time() - t0}

    # OCR
    try:
        data = ocr_pdf(str(pdf_path), work_dir)
    except Exception as e:
        return {"error": f"ocr_failed: {e}", "duration": time.time() - t0}

    if data.get("wordCount", 0) < 20:
        pdf_path.unlink()
        return {"error": "ocr_empty", "duration": time.time() - t0}

    # AI extraction
    try:
        result = process_pdf(str(numeric_id), data, "HOMEWORK", "Technologie", "")
    except Exception as e:
        pdf_path.unlink()
        return {"error": f"ai_failed: {e}", "duration": time.time() - t0}

    metadata = result.get("metadata", {})
    summary = result.get("summary", {})

    if "error" in metadata:
        pdf_path.unlink()
        return {"error": f"metadata_error: {metadata['error']}", "duration": time.time() - t0}

    if "year" in metadata:
        metadata["year"] = normalize_year(metadata.get("year"))

    content_data = {
        "fullText": data.get("fullText", ""),
        "pageCount": data.get("pageCount"),
        "wordCount": data.get("wordCount"),
        "durationMs": int((time.time() - t0) * 1000),
    }

    success = store_results(numeric_id, content_data, metadata, summary)
    pdf_path.unlink()

    return {
        "success": success,
        "duration": round(time.time() - t0, 2),
        "systemName": metadata.get("systemName"),
        "dossierTechnique": metadata.get("dossierTechnique"),
        "wordCount": data.get("wordCount"),
        "tokens": result.get("tokens_used", 0),
    }


def main():
    # Get list of image-based IDs
    with open("tech_ids.json") as f:
        ids = {line.split("\t")[0]: line.split("\t")[1].strip() for line in f if line.strip()}

    with open("bulk_progress.json") as f:
        progress = json.load(f)
    image_based_ids = [str(e["id"]) for e in progress["errors"] if "image_based" in e.get("error", "")]

    # Filter to those with URLs
    to_process = [(id_str, ids[id_str]) for id_str in image_based_ids if id_str in ids]
    print(f"Image-based to process: {len(to_process)}")

    work_dir = Path("ocr_pdfs")
    work_dir.mkdir(exist_ok=True)

    # Progress
    progress_file = Path("ocr_progress.json")
    if progress_file.exists():
        with open(progress_file) as f:
            ocr_progress = json.load(f)
        done = set(ocr_progress.get("done", []))
        errors = ocr_progress.get("errors", [])
    else:
        ocr_progress = {"done": [], "errors": []}
        done = set()
        errors = []

    start = time.time()
    n_done = 0
    n_success = 0
    n_errors = 0
    total_cost = 0.0

    for i, (id_str, url) in enumerate(to_process):
        numeric_id = int(id_str)
        if numeric_id in done:
            continue

        result = process_one(numeric_id, url, work_dir)
        n_done += 1

        if result.get("error"):
            n_errors += 1
            errors.append({"id": numeric_id, "error": result["error"]})
        else:
            n_success += 1
            ocr_progress["done"].append(numeric_id)
            tokens = result.get("tokens", 0)
            total_cost += tokens * 0.0000004

        # Save every 3
        if n_done % 3 == 0:
            ocr_progress["errors"] = errors
            with open(progress_file, "w") as f:
                json.dump(ocr_progress, f, indent=2)

        elapsed = time.time() - start
        rate = n_done / elapsed * 60 if elapsed > 0 else 0
        remaining = (len(to_process) - len(done) - n_done) / rate if rate > 0 else 0
        sys_e = (result.get("systemName") or "-")[:25]
        wc = result.get("wordCount", 0)
        print(f"[{i+1}/{len(to_process)}] {id_str}: {'✓' if result.get('success') else '✗ ' + str(result.get('error',''))[:25]} | {wc:>4}w | sys={sys_e:<25} | {result.get('duration', 0):.1f}s | {rate:.1f}/min | ~{remaining:.0f}min")

    ocr_progress["errors"] = errors
    with open(progress_file, "w") as f:
        json.dump(ocr_progress, f, indent=2)

    print(f"\n=== OCR DONE ===")
    print(f"Processed: {n_done}, Success: {n_success}, Errors: {n_errors}")
    print(f"Cost: ${total_cost:.2f}, Time: {(time.time()-start)/60:.1f} min")


if __name__ == "__main__":
    main()
