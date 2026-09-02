#!/usr/bin/env python3
"""Bulk extraction pipeline for Technologie files.
- Downloads PDFs from Vercel Blob
- Extracts text with PyMuPDF
- Runs AI extraction (metadata + summary)
- Stores in ResourceContent, ResourceMetadata, ResourceSummary tables
"""
import json
import os
import sys
import time
import urllib.request
from pathlib import Path
from openai import OpenAI
import fitz

# Import extraction
sys.path.insert(0, '.')
from extract import extract_pdf
from ai_extract import process_pdf, normalize_year

# Neon API
NEON_API_KEY = os.environ.get("NEON_API_KEY", "")
NEON_PROJECT = "little-silence-94324724"
NEON_BRANCH = "br-purple-recipe-as2x8yyo"
NEON_BASE = "https://console.neon.tech/api/v2/projects"

# OpenAI
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))


def run_sql(query, params=None):
    """Run SQL via Neon API."""
    if params:
        # Substitute parameters safely
        for k, v in params.items():
            v_escaped = str(v).replace("'", "''")
            query = query.replace(f":{k}", f"'{v_escaped}'")

    payload = json.dumps({
        "db_name": "neondb",
        "role_name": "edutunisie_app",
        "query": query,
        "branch_id": NEON_BRANCH,
    })
    req = urllib.request.Request(
        f"{NEON_BASE}/{NEON_PROJECT}/query",
        data=payload.encode(),
        headers={
            "Authorization": f"Bearer {NEON_API_KEY}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def array_literal(arr):
    """Convert Python list to PG array literal."""
    if not arr:
        return "ARRAY[]::text[]"
    if isinstance(arr, str):
        # AI sometimes returns JSON-encoded string
        try:
            arr = json.loads(arr)
        except Exception:
            return "ARRAY[]::text[]"
    if not isinstance(arr, list):
        return "ARRAY[]::text[]"
    items = ",".join(f"'{str(s).replace(chr(39), chr(39)+chr(39))}'" for s in arr)
    return f"ARRAY[{items}]::text[]"


def text_or_null(s):
    """Convert to SQL text literal or NULL."""
    if s is None or s == "":
        return "NULL"
    return f"'{str(s).replace(chr(39), chr(39)+chr(39))}'"


def int_or_null(n):
    if n is None:
        return "NULL"
    return str(int(n))


def download_pdf(url, out_path):
    """Download PDF to local file."""
    try:
        urllib.request.urlretrieve(url, out_path)
        return True
    except Exception as e:
        print(f"  Download error: {e}")
        return False


def store_results(numeric_id, content_data, metadata, summary):
    """Upsert all 3 tables for one resource."""
    # 1. ResourceContent (text brut)
    content_sql = f"""
    INSERT INTO "ResourceContent" ("id", "resourceId", "fullText", "pageCount", "wordCount", "extractionMethod", "extractionDurationMs", "modelUsed")
    SELECT gen_random_uuid()::text, r.id, {text_or_null(content_data.get('fullText'))}, {int_or_null(content_data.get('pageCount'))}, {int_or_null(content_data.get('wordCount'))}, {text_or_null(content_data.get('method'))}, {int_or_null(content_data.get('durationMs'))}, {text_or_null('pymupdf+gpt-4o-mini')}
    FROM "Resource" r WHERE r."numericId" = {numeric_id}
    ON CONFLICT ("resourceId") DO UPDATE SET
      "fullText" = EXCLUDED."fullText",
      "pageCount" = EXCLUDED."pageCount",
      "wordCount" = EXCLUDED."wordCount",
      "extractedAt" = NOW()
    RETURNING "resourceId"
    """

    # 2. ResourceMetadata
    meta_sql = f"""
    INSERT INTO "ResourceMetadata" (
      "id", "resourceId", "profNames", "schoolName", "year", "type", "subtype",
      "subject", "dossierTechnique", "systemName", "duration", "level",
      "keyPoints", "topics", "difficulty", "estimatedTimeMinutes",
      "prerequisites", "keyInsights", "modelUsed"
    )
    SELECT
      gen_random_uuid()::text, r.id,
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
      {text_or_null('gpt-4o-mini')}
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

    # 3. ResourceSummary
    summary_text = summary.get("summary", "") if isinstance(summary, dict) else ""
    summ_sql = f"""
    INSERT INTO "ResourceSummary" ("id", "resourceId", "summary", "modelUsed")
    SELECT gen_random_uuid()::text, r.id, {text_or_null(summary_text)}, {text_or_null('gpt-4o-mini')}
    FROM "Resource" r WHERE r."numericId" = {numeric_id}
    ON CONFLICT ("resourceId") DO UPDATE SET
      "summary" = EXCLUDED."summary",
      "extractedAt" = NOW()
    RETURNING "resourceId"
    """

    # Execute all 3
    r1 = run_sql(content_sql)
    r2 = run_sql(meta_sql)
    r3 = run_sql(summ_sql)

    return r1.get("success") and r2.get("success") and r3.get("success")


def process_one(numeric_id, url, work_dir):
    """Process one PDF: download + extract + AI + store."""
    pdf_path = work_dir / f"{numeric_id}.pdf"
    t0 = time.time()

    # Download
    if not download_pdf(url, pdf_path):
        return {"error": "download_failed", "duration": time.time() - t0}

    # Extract text
    try:
        data = extract_pdf(str(pdf_path))
    except Exception as e:
        return {"error": f"extract_failed: {e}", "duration": time.time() - t0}

    if data.get("wordCount", 0) == 0:
        return {"error": "image_based", "duration": time.time() - t0, "pageCount": data.get("pageCount")}

    # AI extraction
    try:
        result = process_pdf(str(numeric_id), data, "HOMEWORK", "Technologie", "")
    except Exception as e:
        return {"error": f"ai_failed: {e}", "duration": time.time() - t0}

    metadata = result.get("metadata", {})
    summary = result.get("summary", {})

    if "error" in metadata:
        return {"error": f"metadata_error: {metadata['error']}", "duration": time.time() - t0}

    # Normalize year
    if "year" in metadata:
        metadata["year"] = normalize_year(metadata.get("year"))

    # Store
    content_data = {
        "fullText": data.get("fullText", ""),
        "pageCount": data.get("pageCount"),
        "wordCount": data.get("wordCount"),
        "method": "pymupdf",
        "durationMs": int((time.time() - t0) * 1000),
    }

    success = store_results(numeric_id, content_data, metadata, summary)
    return {
        "success": success,
        "duration": round(time.time() - t0, 2),
        "systemName": metadata.get("systemName"),
        "dossierTechnique": metadata.get("dossierTechnique"),
        "tokens": result.get("tokens_used", 0),
    }


def main():
    # Read 434 IDs
    with open("tech_ids.json") as f:
        all_ids = [line.strip().split("\t") for line in f if line.strip()]

    # Check progress file
    progress_file = Path("bulk_progress.json")
    if progress_file.exists():
        with open(progress_file) as f:
            progress = json.load(f)
        done_ids = set(progress.get("done", []))
        errors = progress.get("errors", [])
    else:
        progress = {"done": [], "errors": []}
        done_ids = set()
        errors = []

    work_dir = Path("bulk_pdfs")
    work_dir.mkdir(exist_ok=True)

    # Stats
    start = time.time()
    n_processed = 0
    n_success = 0
    n_errors = 0
    total_cost = 0.0
    n_system_extracted = 0
    n_image_based = 0

    print(f"Starting bulk extraction of {len(all_ids)} Technologie files")
    print(f"Already done: {len(done_ids)}")

    for i, (id_str, url) in enumerate(all_ids):
        numeric_id = int(id_str)
        if numeric_id in done_ids:
            continue

        result = process_one(numeric_id, url, work_dir)
        n_processed += 1

        if result.get("error"):
            n_errors += 1
            errors.append({"id": numeric_id, "error": result["error"]})
            if "image_based" in result.get("error", ""):
                n_image_based += 1
        else:
            n_success += 1
            progress["done"].append(numeric_id)
            if result.get("systemName"):
                n_system_extracted += 1
            tokens = result.get("tokens", 0)
            # GPT-4o-mini: $0.15/M input, $0.60/M output, average ~$0.4/M
            cost = tokens * 0.0000004
            total_cost += cost

        # Save progress every 5
        if n_processed % 5 == 0:
            progress["errors"] = errors
            with open(progress_file, "w") as f:
                json.dump(progress, f, indent=2)

        elapsed = time.time() - start
        rate = n_processed / elapsed * 60 if elapsed > 0 else 0
        remaining = (len(all_ids) - len(done_ids) - n_processed) / rate if rate > 0 else 0
        sys_e = result.get("systemName", "-") or "-"
        print(f"[{i+1}/{len(all_ids)}] {id_str}: {'✓' if result.get('success') else '✗ ' + result.get('error','')[:30]} | sys={sys_e[:20]} | {result.get('duration', 0):.1f}s | {rate:.1f}/min | ~{remaining:.0f}min left | ${total_cost:.2f}")

    # Final save
    progress["errors"] = errors
    with open(progress_file, "w") as f:
        json.dump(progress, f, indent=2)

    print(f"\n=== DONE ===")
    print(f"Total processed this run: {n_processed}")
    print(f"Success: {n_success}, Errors: {n_errors} ({n_image_based} image-based)")
    print(f"System names extracted: {n_system_extracted}")
    print(f"Cost this run: ${total_cost:.2f}")
    print(f"Time: {(time.time() - start) / 60:.1f} min")
    print(f"Total done: {len(progress['done'])} / {len(all_ids)}")


if __name__ == "__main__":
    main()
