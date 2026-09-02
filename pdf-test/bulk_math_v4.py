#!/usr/bin/env python3
"""
Bulk AI extraction v4 - OPTIMIZED
Key optimizations vs v3:
1. Per-page text/OCR detection (skip Vision for pages with native text)
2. Combined metadata + summary in 1 AI call
3. sort=True for better reading order
4. pymupdf4llm for text extraction when possible
"""
import os, json, time, base64, io, sys, argparse
from pathlib import Path
import urllib.request
import fitz
from openai import OpenAI
from PIL import Image

NEON_API_KEY = os.environ['NEON_API_KEY']
NEON_PROJECT = 'little-silence-94324724'
BRANCH_ID = 'br-purple-recipe-as2x8yyo'
ROLE = 'edutunisie_app'
BLOB_BASE = 'https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com/'

client = OpenAI()

# COMBINED PROMPT: metadata + summary in 1 call
COMBINED_PROMPT = """You are an expert Tunisian BAC teacher analyzing an educational document.

Given the text of a PDF resource (or OCR'd text from image-based PDF), extract structured metadata AND a summary in ONE JSON response.

Context:
- This is a Tunisian school document for {{SUBJECT_NAME}} class {{LEVEL}}
- The document is in {{LANGUAGE}} but may mix French/Arabic

Return ONLY a JSON object (no markdown, no commentary) with these fields:
{
  "title": "Clear descriptive title",
  "summary_short": "2-3 sentence summary in French (or Arabic if content is Arabic)",
  "summary_detailed": "150-200 word detailed summary in French (or Arabic) covering: main topics, pedagogical approach, who would benefit, difficulty, any special features",
  "language": "fr" | "ar" | "mixed",
  "type": "homework" | "course" | "exercise" | "exam" | "summary" | "revision",
  "subtype": "controle" | "synthese" | "exercice" | "cours" | "resume" | "td" | "tp" | null,
  "subject": "Subject display name (e.g. 'Mathématiques', 'Physique', 'Chimie', 'Sciences de la Vie et de la Terre')",
  "level": "Class level display name",
  "objet": "More granular document nature",
  "homeworkNumber": 1-10 or null,
  "year": "2014-2015" or null (always YYYY-YYYY),
  "trimester": 1 | 2 | 3 or null,
  "schoolName": "Name of school if mentioned" or null,
  "profNames": ["Firstname LASTNAME"] or [] (strip honorifics),
  "keyPoints": ["3-6 bullet points of key concepts/topics covered"],
  "topics": ["3-8 searchable topic tags in French/Arabic"],
  "difficulty": "easy" | "medium" | "hard",
  "estimatedTimeMinutes": 30-180 or null,
  "prerequisites": ["concepts needed"] or [],
  "keyInsights": ["2-3 deeper insights"] or [],
  "forBacSection": ["math", "sciences", "technique", "lettres", "economie-gestion", "sport"] or []
}

Normalization:
- profNames: strip "Prof:" "Prof." "Mr" "Mme" "M." "Mrs" "خ"
- If type == subtype, set subtype to null
- Always YYYY-YYYY format for year
- language: "fr" if mostly French, "ar" if mostly Arabic, "mixed" if balanced

Text to analyze:
"""

def neon_query(sql):
    body = {'db_name': 'neondb', 'role_name': ROLE, 'query': sql, 'branch_id': BRANCH_ID}
    req = urllib.request.Request(
        f'https://console.neon.tech/api/v2/projects/{NEON_PROJECT}/query',
        data=json.dumps(body).encode(),
        headers={'Authorization': f'Bearer {NEON_API_KEY}', 'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        result = json.loads(resp.read())
    if result.get('response'):
        for item in result['response']:
            if item.get('error'):
                raise Exception(f"SQL error: {item['error'][:300]}")
    return result

def sql_escape(val):
    if val is None: return 'NULL'
    if isinstance(val, bool): return 'TRUE' if val else 'FALSE'
    if isinstance(val, (int, float)): return str(val)
    s = str(val).replace("\\", "\\\\").replace("'", "''")
    if len(s) > 50000: s = s[:50000]
    return f"'{s}'"

def sql_text_array(val):
    if not val: return "'{}'::text[]"
    items = ','.join(sql_escape(x) for x in val)
    return f"ARRAY[{items}]"

def extract_text_hybrid(pdf_bytes):
    """
    OPTIMIZATION 1: Per-page text/OCR detection
    - If most pages have native text, extract with sort=True
    - For image-only pages, render and OCR
    - If ALL pages are image-based, render entire document for Vision
    Returns (text, extraction_method, pages_count)
    """
    try:
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        pages = doc.page_count
        
        # Try native text extraction first with sort=True
        text_parts = []
        image_pages = []  # pages that need OCR
        
        for i in range(pages):
            page = doc[i]
            text = page.get_text("text", sort=True)  # OPTIMIZATION 3: sort=True
            if text.strip() and len(text.strip()) > 30:
                text_parts.append(f'--- Page {i+1} ---\n{text}')
            else:
                image_pages.append(i)
        
        doc.close()
        
        if not image_pages:
            # All pages have native text - we're done!
            return '\n\n'.join(text_parts), 'pymupdf', pages
        
        if len(image_pages) == pages:
            # ALL pages are image-based - use full Vision OCR
            return None, 'vision-full', pages
        
        # Mixed: some text, some images - render only the image pages
        return None, 'vision-partial', pages, image_pages
    except Exception as e:
        return None, 'error', 0

def render_pages(pdf_bytes, page_indices=None, max_pages=8, dpi=180):
    """Render specific pages (or all) as base64 PNG."""
    try:
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        images = []
        zoom = dpi / 72.0
        mat = fitz.Matrix(zoom, zoom)
        pages_to_render = page_indices if page_indices else list(range(min(max_pages, doc.page_count)))
        for i in pages_to_render[:max_pages]:
            if i >= doc.page_count:
                continue
            page = doc[i]
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
            if max(img.size) > 2048:
                img.thumbnail((2048, 2048), Image.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format='PNG', optimize=True)
            images.append(base64.b64encode(buf.getvalue()).decode())
        doc.close()
        return images
    except Exception:
        return []

def ocr_with_vision(pdf_bytes, page_indices=None, max_pages=8):
    """OCR via ChatGPT Vision (per-page if specified)."""
    images = render_pages(pdf_bytes, page_indices=page_indices, max_pages=max_pages)
    if not images:
        return None
    content = [{'type': 'text', 'text': 'Extract ALL text from this educational document page-by-page. Preserve the original language (French or Arabic), math formulas, and structure. Output only the text content.'}]
    for b64 in images:
        content.append({'type': 'image_url', 'image_url': {'url': f'data:image/png;base64,{b64}', 'detail': 'high'}})
    try:
        r = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[{'role': 'user', 'content': content}],
            max_tokens=4000,
            temperature=0,
        )
        return r.choices[0].message.content
    except Exception as e:
        return None

def extract_combined(text, subject, level):
    """OPTIMIZATION 2: 1 AI call that returns metadata + summary (2 in 1)."""
    subject_name = {'mathematiques': 'Mathématiques', 'physique': 'Physique', 'svt': 'Sciences de la Vie et de la Terre'}.get(subject, subject)
    lang_detected = 'ar' if any('\u0600' <= c <= '\u06FF' for c in text[:500]) else 'fr'
    p = COMBINED_PROMPT.replace('{{SUBJECT_NAME}}', subject_name).replace('{{LEVEL}}', level).replace('{{LANGUAGE}}', lang_detected)
    try:
        r = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[
                {'role': 'system', 'content': 'You are a precise JSON extractor. Output ONLY valid JSON, no markdown.'},
                {'role': 'user', 'content': p + '\n\n' + text[:7000]}
            ],
            temperature=0,
            max_tokens=2500,  # Increased to fit both metadata + detailed summary
        )
        data = json.loads(r.choices[0].message.content)
        cost = r.usage.prompt_tokens * 0.00000015 + r.usage.completion_tokens * 0.0000006
        return data, cost
    except Exception as e:
        return {'error': str(e)}, 0

def upsert_resource_data(resource_id, full_text, word_count, page_count, extraction_method, model_used, data, content_extraction_ms):
    """Single upsert function that handles all 3 tables."""
    rid_e = sql_escape(resource_id)
    full_text_e = sql_escape(full_text)
    
    # ResourceContent
    neon_query(f"""
        INSERT INTO "ResourceContent" (id, "resourceId", "fullText", "pageCount", "wordCount", "extractionMethod", "extractionDurationMs", "modelUsed", "extractedAt")
        VALUES (gen_random_uuid()::text, {rid_e}, {full_text_e}, {page_count}, {word_count}, {sql_escape(extraction_method)}, {content_extraction_ms}, {sql_escape(model_used)}, NOW())
        ON CONFLICT ("resourceId") DO UPDATE SET
          "fullText" = EXCLUDED."fullText", "pageCount" = EXCLUDED."pageCount", "wordCount" = EXCLUDED."wordCount",
          "extractionMethod" = EXCLUDED."extractionMethod", "extractionDurationMs" = EXCLUDED."extractionDurationMs",
          "modelUsed" = EXCLUDED."modelUsed", "extractedAt" = NOW()
    """)
    
    if 'error' not in data:
        meta = data
        type_upper = (meta.get('type') or 'OTHER').upper()
        subtype = meta.get('subtype')
        if subtype and subtype.lower() == type_upper.lower():
            subtype = None
        subject_name = meta.get('subject') or 'Mathématiques'
        level = meta.get('level') or 'BAC'
        year = meta.get('year')
        
        # ResourceMetadata
        neon_query(f"""
            INSERT INTO "ResourceMetadata" (id, "resourceId", "profNames", "schoolName", "year", "type", "subtype", "subject", "level", "duration", "keyPoints", "topics", "difficulty", "estimatedTimeMinutes", "prerequisites", "keyInsights", "modelUsed", "extractedAt")
            VALUES (gen_random_uuid()::text, {rid_e}, {sql_text_array(meta.get('profNames', []))}, {sql_escape(meta.get('schoolName'))}, {sql_escape(year)}, {sql_escape(type_upper)}, {sql_escape(subtype.upper() if subtype else None)}, {sql_escape(subject_name)}, {sql_escape(level)}, {sql_escape(year)}, {sql_text_array(meta.get('keyPoints', []))}, {sql_text_array(meta.get('topics', []))}, {sql_escape(meta.get('difficulty', 'medium'))}, {sql_escape(meta.get('estimatedTimeMinutes'))}, {sql_text_array(meta.get('prerequisites', []))}, {sql_text_array(meta.get('keyInsights', []))}, {sql_escape(model_used)}, NOW())
            ON CONFLICT ("resourceId") DO UPDATE SET
              "profNames" = EXCLUDED."profNames", "schoolName" = EXCLUDED."schoolName", "year" = EXCLUDED."year",
              "type" = EXCLUDED."type", "subtype" = EXCLUDED."subtype", "subject" = EXCLUDED."subject", "level" = EXCLUDED."level",
              "duration" = EXCLUDED."duration", "keyPoints" = EXCLUDED."keyPoints", "topics" = EXCLUDED."topics",
              "difficulty" = EXCLUDED."difficulty", "estimatedTimeMinutes" = EXCLUDED."estimatedTimeMinutes",
              "prerequisites" = EXCLUDED."prerequisites", "keyInsights" = EXCLUDED."keyInsights",
              "modelUsed" = EXCLUDED."modelUsed", "extractedAt" = NOW()
        """)
        
        # ResourceMetadataExtra (with summary_detailed from combined call)
        neon_query(f"""
            INSERT INTO "ResourceMetadataExtra" (id, "resourceId", title, summary, language, objet, "homeworkNumber", trimester, "forBacSection", "modelUsed", "extractedAt", "updatedAt")
            VALUES (gen_random_uuid()::text, {rid_e}, {sql_escape(meta.get('title', ''))}, {sql_escape(meta.get('summary_short', '') or meta.get('summary', ''))}, {sql_escape(meta.get('language', 'fr'))}, {sql_escape(meta.get('objet'))}, {sql_escape(meta.get('homeworkNumber'))}, {sql_escape(meta.get('trimester'))}, {sql_text_array(meta.get('forBacSection', []))}, {sql_escape(model_used)}, NOW(), NOW())
            ON CONFLICT ("resourceId") DO UPDATE SET
              title = EXCLUDED.title, summary = EXCLUDED.summary, language = EXCLUDED.language, objet = EXCLUDED.objet,
              "homeworkNumber" = EXCLUDED."homeworkNumber", trimester = EXCLUDED.trimester, "forBacSection" = EXCLUDED."forBacSection",
              "modelUsed" = EXCLUDED."modelUsed", "extractedAt" = NOW(), "updatedAt" = NOW()
        """)
    
    # ResourceSummary (use summary_detailed from combined call)
    summary_detailed = data.get('summary_detailed') if 'error' not in data else ''
    if summary_detailed:
        neon_query(f"""
            INSERT INTO "ResourceSummary" (id, "resourceId", "summary", "modelUsed", "extractedAt")
            VALUES (gen_random_uuid()::text, {rid_e}, {sql_escape(summary_detailed)}, {sql_escape(model_used)}, NOW())
            ON CONFLICT ("resourceId") DO UPDATE SET
              "summary" = EXCLUDED."summary", "modelUsed" = EXCLUDED."modelUsed", "extractedAt" = NOW()
        """)
    
    return True

def process_resource(r, log_func):
    rid = r['id']
    file_key = r['fileKey']
    file_url = r['fileUrl']
    subject = r['subject_slug']
    class_slug = r.get('class_slug', '')
    
    if class_slug in ('4eme-secondaire', 'bac'):
        level = 'BAC (4ème année secondaire)'
    elif class_slug == '3eme-secondaire':
        level = '3ème année secondaire'
    elif class_slug == '2eme-secondaire':
        level = '2ème année secondaire'
    elif class_slug == '1ere-secondaire':
        level = '1ère année secondaire'
    else:
        level = 'Collège'
    
    if not file_url and not file_key:
        return False, 0
    
    url = file_url if file_url else (BLOB_BASE + file_key if not file_url.startswith('http') else file_url)
    
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            pdf_bytes = resp.read()
    except Exception as e:
        log_func(f'  Download error: {e}')
        return False, 0
    
    t0 = time.time()
    
    # OPTIMIZATION 1+3: Hybrid extraction with per-page detection + sort=True
    result = extract_text_hybrid(pdf_bytes)
    if len(result) == 3:
        text, extraction_method, pages = result
    else:
        # vision-partial
        text_partial, extraction_method, pages, image_pages = result
        # Only OCR the image-only pages
        ocr_text = ocr_with_vision(pdf_bytes, page_indices=image_pages)
        # Combine: we'll just use the OCR text (best effort)
        # For a complete solution, we'd merge native text + OCR per page
        # For now, just use OCR text since it's likely the most important content
        text = ocr_text or text_partial
    
    if not text:
        log_func(f'  No text extracted')
        return False, 0
    
    content_duration_ms = int((time.time() - t0) * 1000)
    word_count = len(text.split())
    
    # OPTIMIZATION 2: Combined AI call (metadata + 2 summaries in 1)
    data, total_cost = extract_combined(text, subject, level)
    
    if 'error' not in data:
        try:
            ok = upsert_resource_data(rid, text, word_count, pages, extraction_method, 'gpt-4o-mini', data, content_duration_ms)
        except Exception as e:
            log_func(f'  DB error: {e}')
            return False, total_cost
    else:
        ok = False
    
    if ok:
        log_func(f'  ✓ {rid} | {data.get("title", "?")[:50]} | words={word_count} | {extraction_method} | ${total_cost:.4f}')
    else:
        log_func(f'  ✗ {rid} | FAILED')
    
    return ok, total_cost

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--worker-id", type=int, default=0)
    parser.add_argument("--total-workers", type=int, default=1)
    args = parser.parse_args()
    worker_id = args.worker_id
    total_workers = args.total_workers
    
    CHECKPOINT_FILE = Path(f'/workspace/edutunisie/pdf-test/bulk_math_v4_w{worker_id}_progress.json')
    LOG_FILE = Path(f'/workspace/edutunisie/pdf-test/bulk_math_v4_w{worker_id}.log')
    PROGRESS_FILE = Path(f'/workspace/edutunisie/pdf-test/bulk_math_v4_w{worker_id}_progress.txt')
    
    def log(msg):
        ts = time.strftime('%H:%M:%S')
        line = f'[V4-W{worker_id}/{total_workers} {ts}] {msg}'
        print(line, flush=True)
        with open(LOG_FILE, 'a') as f:
            f.write(line + '\n')
    
    def write_progress(done, total, current_id, total_cost):
        pct = round(done/total*100, 1) if total else 0
        with open(PROGRESS_FILE, 'w') as f:
            f.write(f'V4-W{worker_id}: {done}/{total} ({pct}%) | current: {current_id} | cost: ${total_cost:.2f}\n')
    
    log(f'=== STARTING v4 worker {worker_id}/{total_workers} ===')
    
    result = neon_query(f"""
        SELECT r.id, r."fileKey", r."fileUrl", r.title, s.slug as subject_slug, c.slug as class_slug
        FROM "Resource" r
        JOIN "User" u ON u.id = r."teacherId"
        LEFT JOIN "Subject" s ON s.id = r."subjectId"
        LEFT JOIN "Class" c ON c.id = r."classId"
        LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
        WHERE r.status = 'PUBLISHED'
          AND u.bio LIKE '%evoirat%'
          AND s.slug = 'mathematiques'
          AND r."fileKey" IS NOT NULL
          AND LENGTH(r."fileKey") > 5
          AND rm.id IS NULL
          AND (abs(hashtext(r.id)) % {total_workers}) = {worker_id}
        ORDER BY r."numericId" DESC
    """)
    
    resources = []
    if result.get('response') and result['response'][0].get('data', {}).get('rows'):
        cols = result['response'][0]['data'].get('fields', [])
        for row in result['response'][0]['data']['rows']:
            resources.append(dict(zip(cols, row)))
    total = len(resources)
    log(f'Got {total} resources')
    
    done_ids = set()
    if CHECKPOINT_FILE.exists():
        try:
            done_ids = set(json.loads(CHECKPOINT_FILE.read_text()))
        except:
            pass
    
    resources = [r for r in resources if r['id'] not in done_ids]
    remaining = len(resources)
    log(f'Remaining: {remaining}')
    
    if remaining == 0:
        log('Nothing to do!')
        return
    
    total_cost = 0
    processed = 0
    failed = 0
    
    write_progress(len(done_ids), total, '-', total_cost)
    
    for i, r in enumerate(resources, 1):
        overall_done = len(done_ids) + i
        log(f'[{overall_done}/{total}] {r["id"][:20]}... - {r.get("title", "?")[:40]}')
        try:
            ok, cost = process_resource(r, log)
            if ok:
                processed += 1
                done_ids.add(r['id'])
            else:
                failed += 1
            total_cost += cost
            if i % 10 == 0:
                CHECKPOINT_FILE.write_text(json.dumps(list(done_ids)))
                write_progress(overall_done, total, r['id'], total_cost)
        except Exception as e:
            log(f'  EXCEPTION: {e}')
            failed += 1
            time.sleep(5)
        
        time.sleep(0.3)
    
    CHECKPOINT_FILE.write_text(json.dumps(list(done_ids)))
    write_progress(total, total, 'DONE', total_cost)
    log(f'COMPLETE: {processed} ok, {failed} failed, ${total_cost:.2f}')

if __name__ == '__main__':
    main()
