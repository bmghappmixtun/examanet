#!/usr/bin/env python3
"""
Bulk AI extraction for Devoirat Math resources - WORKER VERSION
Supports --worker-id N --total-workers M for parallel processing
Each worker processes (hash(resourceId) % M) = N subset of files
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

METADATA_PROMPT = """You are an expert Tunisian BAC teacher analyzing an educational document.

Given the text of a PDF resource (or OCR'd text from image-based PDF), extract structured metadata in JSON.

Context:
- This is a Tunisian school document for {{SUBJECT_NAME}} class {{LEVEL}}
- The document is in {{LANGUAGE}} but may mix French/Arabic

Return ONLY a JSON object (no markdown, no commentary) with these fields:
{
  "title": "Clear descriptive title",
  "summary": "2-3 sentence summary in French (or Arabic if content is Arabic)",
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

SUMMARY_PROMPT = """Write a clear 100-150 word summary in {{LANG}} of what this educational document covers and how it can help students.

Document text:
"""

def neon_query(sql):
    body = {
        'db_name': 'neondb',
        'role_name': ROLE,
        'query': sql,
        'branch_id': BRANCH_ID,
    }
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
    if val is None:
        return 'NULL'
    if isinstance(val, bool):
        return 'TRUE' if val else 'FALSE'
    if isinstance(val, (int, float)):
        return str(val)
    s = str(val).replace("\\", "\\\\").replace("'", "''")
    if len(s) > 50000:
        s = s[:50000]
    return f"'{s}'"

def sql_text_array(val):
    if not val:
        return "'{}'::text[]"
    items = ','.join(sql_escape(x) for x in val)
    return f"ARRAY[{items}]"

def extract_text_pymupdf(pdf_bytes):
    try:
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        text = ''
        for page in doc:
            text += page.get_text() + '\n'
        pages = doc.page_count
        doc.close()
        return text, len(text.strip()) < 100, pages
    except Exception:
        return None, True, 0

def render_pdf_pages(pdf_bytes, max_pages=8, dpi=180):
    try:
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        images = []
        zoom = dpi / 72.0
        mat = fitz.Matrix(zoom, zoom)
        for i in range(min(max_pages, doc.page_count)):
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

def ocr_with_vision(pdf_bytes):
    images = render_pdf_pages(pdf_bytes, max_pages=8, dpi=180)
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

def extract_metadata(text, subject, level):
    subject_name = {'mathematiques': 'Mathématiques', 'physique': 'Physique', 'svt': 'Sciences de la Vie et de la Terre'}.get(subject, subject)
    lang_detected = 'ar' if any('\u0600' <= c <= '\u06FF' for c in text[:500]) else 'fr'
    p = METADATA_PROMPT.replace('{{SUBJECT_NAME}}', subject_name).replace('{{LEVEL}}', level).replace('{{LANGUAGE}}', lang_detected)
    try:
        r = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[
                {'role': 'system', 'content': 'You are a precise JSON extractor. Output ONLY valid JSON, no markdown.'},
                {'role': 'user', 'content': p + '\n\n' + text[:7000]}
            ],
            temperature=0,
            max_tokens=1500,
        )
        meta = json.loads(r.choices[0].message.content)
        cost = r.usage.prompt_tokens * 0.00000015 + r.usage.completion_tokens * 0.0000006
        return meta, cost
    except Exception as e:
        return {'error': str(e)}, 0

def extract_summary(text, lang):
    p = SUMMARY_PROMPT.replace('{{LANG}}', 'ar' if lang == 'ar' else 'français')
    try:
        r = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[
                {'role': 'system', 'content': 'You are a pedagogical expert writing summaries for Tunisian BAC students.'},
                {'role': 'user', 'content': p + '\n\n' + text[:5000]}
            ],
            temperature=0.3,
            max_tokens=400,
        )
        return r.choices[0].message.content.strip(), r.usage.prompt_tokens * 0.00000015 + r.usage.completion_tokens * 0.0000006
    except Exception as e:
        return '', 0

def upsert_resource_data(resource_id, full_text, word_count, page_count, extraction_method, model_used, meta, summary, content_extraction_ms):
    rid_e = sql_escape(resource_id)
    full_text_e = sql_escape(full_text)
    
    neon_query(f"""
        INSERT INTO "ResourceContent" (id, "resourceId", "fullText", "pageCount", "wordCount", "extractionMethod", "extractionDurationMs", "modelUsed", "extractedAt")
        VALUES (gen_random_uuid()::text, {rid_e}, {full_text_e}, {page_count}, {word_count}, {sql_escape(extraction_method)}, {content_extraction_ms}, {sql_escape(model_used)}, NOW())
        ON CONFLICT ("resourceId") DO UPDATE SET
          "fullText" = EXCLUDED."fullText",
          "pageCount" = EXCLUDED."pageCount",
          "wordCount" = EXCLUDED."wordCount",
          "extractionMethod" = EXCLUDED."extractionMethod",
          "extractionDurationMs" = EXCLUDED."extractionDurationMs",
          "modelUsed" = EXCLUDED."modelUsed",
          "extractedAt" = NOW()
    """)
    
    if 'error' not in meta:
        type_upper = (meta.get('type') or 'OTHER').upper()
        subtype = meta.get('subtype')
        if subtype and subtype.lower() == type_upper.lower():
            subtype = None
        subject_name = meta.get('subject') or 'Mathématiques'
        level = meta.get('level') or 'BAC'
        year = meta.get('year')
        
        neon_query(f"""
            INSERT INTO "ResourceMetadata" (id, "resourceId", "profNames", "schoolName", "year", "type", "subtype", "subject", "level", "duration", "keyPoints", "topics", "difficulty", "estimatedTimeMinutes", "prerequisites", "keyInsights", "modelUsed", "extractedAt")
            VALUES (gen_random_uuid()::text, {rid_e}, {sql_text_array(meta.get('profNames', []))}, {sql_escape(meta.get('schoolName'))}, {sql_escape(year)}, {sql_escape(type_upper)}, {sql_escape(subtype.upper() if subtype else None)}, {sql_escape(subject_name)}, {sql_escape(level)}, {sql_escape(year)}, {sql_text_array(meta.get('keyPoints', []))}, {sql_text_array(meta.get('topics', []))}, {sql_escape(meta.get('difficulty', 'medium'))}, {sql_escape(meta.get('estimatedTimeMinutes'))}, {sql_text_array(meta.get('prerequisites', []))}, {sql_text_array(meta.get('keyInsights', []))}, {sql_escape(model_used)}, NOW())
            ON CONFLICT ("resourceId") DO UPDATE SET
              "profNames" = EXCLUDED."profNames",
              "schoolName" = EXCLUDED."schoolName",
              "year" = EXCLUDED."year",
              "type" = EXCLUDED."type",
              "subtype" = EXCLUDED."subtype",
              "subject" = EXCLUDED."subject",
              "level" = EXCLUDED."level",
              "duration" = EXCLUDED."duration",
              "keyPoints" = EXCLUDED."keyPoints",
              "topics" = EXCLUDED."topics",
              "difficulty" = EXCLUDED."difficulty",
              "estimatedTimeMinutes" = EXCLUDED."estimatedTimeMinutes",
              "prerequisites" = EXCLUDED."prerequisites",
              "keyInsights" = EXCLUDED."keyInsights",
              "modelUsed" = EXCLUDED."modelUsed",
              "extractedAt" = NOW()
        """)
        
        neon_query(f"""
            INSERT INTO "ResourceMetadataExtra" (id, "resourceId", title, summary, language, objet, "homeworkNumber", trimester, "forBacSection", "modelUsed", "extractedAt", "updatedAt")
            VALUES (gen_random_uuid()::text, {rid_e}, {sql_escape(meta.get('title', ''))}, {sql_escape(meta.get('summary', ''))}, {sql_escape(meta.get('language', 'fr'))}, {sql_escape(meta.get('objet'))}, {sql_escape(meta.get('homeworkNumber'))}, {sql_escape(meta.get('trimester'))}, {sql_text_array(meta.get('forBacSection', []))}, {sql_escape(model_used)}, NOW(), NOW())
            ON CONFLICT ("resourceId") DO UPDATE SET
              title = EXCLUDED.title,
              summary = EXCLUDED.summary,
              language = EXCLUDED.language,
              objet = EXCLUDED.objet,
              "homeworkNumber" = EXCLUDED."homeworkNumber",
              trimester = EXCLUDED.trimester,
              "forBacSection" = EXCLUDED."forBacSection",
              "modelUsed" = EXCLUDED."modelUsed",
              "extractedAt" = NOW(),
              "updatedAt" = NOW()
        """)
    
    if summary:
        neon_query(f"""
            INSERT INTO "ResourceSummary" (id, "resourceId", "summary", "modelUsed", "extractedAt")
            VALUES (gen_random_uuid()::text, {rid_e}, {sql_escape(summary)}, {sql_escape(model_used)}, NOW())
            ON CONFLICT ("resourceId") DO UPDATE SET
              "summary" = EXCLUDED."summary",
              "modelUsed" = EXCLUDED."modelUsed",
              "extractedAt" = NOW()
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
        log_func(f'  Download error for {rid}: {e}')
        return False, 0
    
    t0 = time.time()
    text, is_image_based, pages = extract_text_pymupdf(pdf_bytes)
    extraction_method = 'pymupdf'
    
    if is_image_based or text is None or len(text.strip()) < 50:
        log_func(f'  Image-based, using Vision OCR')
        text = ocr_with_vision(pdf_bytes)
        extraction_method = 'chatgpt-vision'
        if not text:
            return False, 0
    
    content_duration_ms = int((time.time() - t0) * 1000)
    word_count = len(text.split())
    
    meta, cost_meta = extract_metadata(text, subject, level)
    lang = 'ar' if any('\u0600' <= c <= '\u06FF' for c in text[:500]) else 'fr'
    summary, cost_sum = extract_summary(text, lang)
    total_cost = cost_meta + cost_sum
    
    if 'error' not in meta:
        try:
            ok = upsert_resource_data(rid, text, word_count, pages, extraction_method, 'gpt-4o-mini', meta, summary, content_duration_ms)
        except Exception as e:
            log_func(f'  DB error for {rid}: {e}')
            return False, total_cost
    else:
        ok = False
    
    if ok:
        log_func(f'  ✓ {rid} | {meta.get("title", "?")[:50]} | words={word_count} | {extraction_method} | ${total_cost:.4f}')
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
    
    # Per-worker files
    CHECKPOINT_FILE = Path(f'/workspace/edutunisie/pdf-test/bulk_math_w{worker_id}_progress.json')
    LOG_FILE = Path(f'/workspace/edutunisie/pdf-test/bulk_math_w{worker_id}.log')
    PROGRESS_FILE = Path(f'/workspace/edutunisie/pdf-test/bulk_math_w{worker_id}_progress.txt')
    
    def log(msg):
        ts = time.strftime('%H:%M:%S')
        line = f'[W{worker_id}/{total_workers} {ts}] {msg}'
        print(line, flush=True)
        with open(LOG_FILE, 'a') as f:
            f.write(line + '\n')
    
    def write_progress(done, total, current_id, total_cost):
        pct = round(done/total*100, 1) if total else 0
        with open(PROGRESS_FILE, 'w') as f:
            f.write(f'W{worker_id}: {done}/{total} ({pct}%) | current: {current_id} | cost: ${total_cost:.2f}\n')
    
    log(f'=== STARTING worker {worker_id}/{total_workers} ===')
    log('Fetching resources...')
    
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
    log(f'Got {total} resources (my share)')
    
    done_ids = set()
    if CHECKPOINT_FILE.exists():
        try:
            done_ids = set(json.loads(CHECKPOINT_FILE.read_text()))
        except:
            pass
    log(f'Already done: {len(done_ids)}')
    
    resources = [r for r in resources if r['id'] not in done_ids]
    remaining = len(resources)
    log(f'Remaining: {remaining}')
    
    if remaining == 0:
        log('All done!')
        return
    
    total_cost = 0
    processed = 0
    failed = 0
    
    write_progress(len(done_ids), total, '-', total_cost)
    
    for i, r in enumerate(resources, 1):
        overall_done = len(done_ids) + i
        log(f'[{overall_done}/{total}] {r["id"]} - {r.get("title", "?")[:40]}')
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
        
        time.sleep(0.3)  # Reduced from 0.5 for parallel speedup
    
    CHECKPOINT_FILE.write_text(json.dumps(list(done_ids)))
    write_progress(total, total, 'DONE', total_cost)
    log(f'COMPLETE: {processed} ok, {failed} failed, ${total_cost:.2f}')

if __name__ == '__main__':
    main()
