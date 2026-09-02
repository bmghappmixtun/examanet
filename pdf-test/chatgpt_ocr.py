#!/usr/bin/env python3
"""ChatGPT Vision OCR for the 4 image-based PDFs that Tesseract couldn't read.

Strategy: convert each PDF page to a high-res image, send to GPT-4o vision with
a prompt to extract all text. Aggregate the text and run through the same
AI extraction pipeline.
"""
import base64
import json
import os
import sys
import time
import urllib.request
from pathlib import Path
from openai import OpenAI
import fitz

sys.path.insert(0, '.')
from ai_extract import process_pdf, normalize_year

NEON_API_KEY = os.environ.get("NEON_API_KEY", "")
NEON_PROJECT = "little-silence-94324724"
NEON_BRANCH = "br-purple-recipe-as2x8yyo"
NEON_BASE = "https://console.neon.tech/api/v2/projects"

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))


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
    if not arr: return "ARRAY[]::text[]"
    if isinstance(arr, str):
        try: arr = json.loads(arr)
        except: return "ARRAY[]::text[]"
    if not isinstance(arr, list): return "ARRAY[]::text[]"
    items = ",".join(f"'{str(s).replace(chr(39), chr(39)+chr(39))}'" for s in arr)
    return f"ARRAY[{items}]::text[]"


def text_or_null(s):
    if s is None or s == "": return "NULL"
    return f"'{str(s).replace(chr(39), chr(39)+chr(39))}'"


def int_or_null(n):
    if n is None: return "NULL"
    return str(int(n))


def pdf_page_to_base64(pdf_path, page_num, dpi=200):
    """Convert a PDF page to a base64-encoded image (smaller than 300dpi to fit Vision)."""
    doc = fitz.open(pdf_path)
    page = doc[page_num]
    pix = page.get_pixmap(dpi=dpi)
    img_bytes = pix.tobytes("png")
    doc.close()
    return base64.b64encode(img_bytes).decode()


def gpt4o_ocr_image(b64_image, page_num=1, max_retries=5):
    """Send image to GPT-4o vision, ask to extract all text. With retry on rate limit."""
    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": f"""Extrais TOUT le texte visible sur cette page d'un document scolaire tunisien (page {page_num}).
Garde la mise en forme (titres, listes, paragraphes).
Garde les formules mathématiques en notation simple (ex: x², racine, fraction).
Si la page contient un schéma/dessin sans texte, indique "[schéma sans texte]".
Retourne UNIQUEMENT le texte extrait, rien d'autre."""
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{b64_image}",
                                    "detail": "high"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=2000,
                temperature=0.1,
            )
            return response.choices[0].message.content.strip(), response.usage.total_tokens
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "rate_limit" in err_str.lower():
                # Extract wait time from error message
                import re
                m = re.search(r'in (\d+)ms', err_str)
                wait = int(m.group(1)) / 1000 if m else 15
                wait = max(wait, 5)
                print(f"    [rate limit] attempt {attempt+1}/{max_retries}, waiting {wait:.1f}s...")
                time.sleep(wait)
            else:
                raise
    return f"[OCR failed after {max_retries} attempts]", 0


def ocr_pdf_chatgpt(pdf_path, work_dir):
    """Convert each PDF page to image, OCR with ChatGPT, aggregate."""
    doc = fitz.open(pdf_path)
    page_count = len(doc)
    doc.close()

    full_text_parts = []
    header_parts = []
    footer_parts = []
    body_parts = []
    total_words = 0
    total_tokens = 0
    page_data = []

    for i in range(page_count):
        print(f"  Page {i+1}/{page_count}...")
        t0 = time.time()
        try:
            b64 = pdf_page_to_base64(pdf_path, i, dpi=200)
            text, tokens = gpt4o_ocr_image(b64, i+1)
            total_tokens += tokens
        except Exception as e:
            print(f"    Error: {e}")
            text = f"[OCR error page {i+1}: {e}]"
            tokens = 0

        words = len(text.split())
        total_words += words
        full_text_parts.append(text)

        # Split header/footer
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
            "duration": round(time.time() - t0, 2),
            "tokens": tokens,
        })
        print(f"    {words} words in {time.time()-t0:.1f}s ({tokens} tokens)")

    return {
        "pageCount": page_count,
        "wordCount": total_words,
        "fullText": "\n\n--- PAGE BREAK ---\n\n".join(full_text_parts),
        "headerText": "\n".join(header_parts),
        "footerText": "\n".join(footer_parts),
        "bodyText": "\n\n--- PAGE BREAK ---\n\n".join(body_parts),
        "pages": page_data,
        "totalTokens": total_tokens,
    }


def store_results(numeric_id, content_data, metadata, summary):
    content_sql = f"""
    INSERT INTO "ResourceContent" ("id", "resourceId", "fullText", "pageCount", "wordCount", "extractionMethod", "extractionDurationMs", "modelUsed")
    SELECT gen_random_uuid()::text, r.id, {text_or_null(content_data.get('fullText'))}, {int_or_null(content_data.get('pageCount'))}, {int_or_null(content_data.get('wordCount'))}, 'gpt-4o-vision-ocr', {int_or_null(content_data.get('durationMs'))}, 'gpt-4o-mini'
    FROM "Resource" r WHERE r."numericId" = {numeric_id}
    ON CONFLICT ("resourceId") DO UPDATE SET
      "fullText" = EXCLUDED."fullText",
      "pageCount" = EXCLUDED."pageCount",
      "wordCount" = EXCLUDED."wordCount",
      "extractionMethod" = 'gpt-4o-vision-ocr',
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

    # OCR with ChatGPT
    try:
        data = ocr_pdf_chatgpt(str(pdf_path), work_dir)
    except Exception as e:
        pdf_path.unlink()
        return {"error": f"ocr_failed: {e}", "duration": time.time() - t0}

    if data.get("wordCount", 0) < 30:
        pdf_path.unlink()
        return {"error": f"ocr_empty: only {data.get('wordCount')} words", "duration": time.time() - t0}

    # AI extraction (metadata + summary)
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
        "tokens": result.get("tokens_used", 0) + data.get("totalTokens", 0),
    }


def main():
    failed_ids = ["12437", "12550", "13168", "13389"]
    with open("tech_ids.json") as f:
        ids = {line.split("\t")[0]: line.split("\t")[1].strip() for line in f if line.strip()}

    work_dir = Path("chatgpt_ocr_pdfs")
    work_dir.mkdir(exist_ok=True)

    total_cost = 0.0
    n_success = 0
    n_errors = 0

    for id_str in failed_ids:
        url = ids.get(id_str)
        if not url:
            print(f"{id_str}: no URL")
            continue

        print(f"\n=== {id_str} ===")
        result = process_one(int(id_str), url, work_dir)

        if result.get("error"):
            n_errors += 1
            print(f"  ✗ {result['error'][:80]}")
        else:
            n_success += 1
            total_cost += result.get("tokens", 0) * 0.0000004
            sys_name = result.get('systemName') or '-'
            print(f"  ✓ {result.get('wordCount')} words, sys={sys_name[:30]}, {result.get('duration'):.1f}s")

    print(f"\n=== TOTAL ===")
    print(f"Success: {n_success}/{len(failed_ids)}, Errors: {n_errors}")
    print(f"Cost: ${total_cost:.2f}")


if __name__ == "__main__":
    main()
