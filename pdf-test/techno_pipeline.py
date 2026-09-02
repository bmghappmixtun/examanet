#!/usr/bin/env python3
"""
Full pipeline for Technologie college files.
1. Download PDF
2. Extract text (PyMuPDF → Tesseract)
3. GPT-4o-mini: extract attributes + system_name + summary
4. Write to: ResourceContent, ResourceMetadata, ResourceSummary
"""
import os, json, time, subprocess, fitz, re
from pathlib import Path
import pytesseract
from PIL import Image
import io
import openai
import urllib.request
import sys

# === CONFIG ===
NEON_API_KEY = os.environ['NEON_API_KEY']
NEON_PROJECT = 'little-silence-94324724'
BRANCH_ID = 'br-purple-recipe-as2x8yyo'  # Use main branch by default
ROLE = 'edutunisie_app'
PROXY_BASE = 'https://examanet.com/api/blob-teacher/'
INTERNAL_TOKEN = 'devmanet-bulk-2026'

# Use same branch as bulk_math_v5.py
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
from bulk_math_v5 import neon_query, sql_escape, sanitize_text


def download_pdf(file_key, out_path):
    """Download PDF from Vercel proxy."""
    url = PROXY_BASE + file_key
    req = urllib.request.Request(url, headers={'X-Internal-Token': INTERNAL_TOKEN})
    with urllib.request.urlopen(req, timeout=30) as resp:
        Path(out_path).write_bytes(resp.read())

# === PROGRESS ===
PROGRESS_FILE = '/tmp/techno-pipeline-progress.json'
CACHE_DIR = Path('/tmp/techno-pipeline')
CACHE_DIR.mkdir(exist_ok=True)
TEXT_DIR = CACHE_DIR / 'text'
TEXT_DIR.mkdir(exist_ok=True)

# === TESSERACT CONFIG ===
TESS_CONFIG = '--oem 1 --psm 6'
TESS_LANG = 'ara+fra+eng'

# === PROMPTS ===
PROMPT_ATTRS = """Tu es un expert pédagogique tunisien. Analyse le texte extrait d'un PDF de TECHNOLOGIE pour collège tunisien (7ème/8ème/9ème) et extrais les informations structurées en JSON.

RÈGLES:
1. **Langues**: si le texte est principalement en français, *_fr rempli. Si en arabe, *_ar rempli. Champs partagés: number, year, file_type, system_name, general_subject, summary, language.
2. **is_pilote** : true UNIQUEMENT si "Collège pilote"/"النموذجية"/"Pilote". false si "Ecole préparatoire"/"Collège" sans pilote. null si aucun nom d'école.
3. **file_type** : DEVOIR_SYNTHESE | DEVOIR_CONTROLE | DEVOIR_MAISON | COURS | EXERCICE | REVISION | EXAMEN | RESUME | AUTRE.
4. **teachers** : array de {name_fr, name_ar}. 1-2 profs max.
5. **number** : "N°1"/"عدد 1"/null.
6. **year** : "2018-2019" (sans parenthèses)/null. NE PAS inventer.
7. **school_name_fr / school_name_ar** : nom complet ou null.
8. **title** : titre canonique dans la langue d'interface du site. Format: "Type + Numéro + Matière + Classe + Année + Prof + Sujet". PAS DE CROCHETS [].
9. **system_name** : nom du système/produit technique étudié (الفرن الكهربائي, القاطع, قاطعة أنابيب, لافتة إشهارية, ثاقبة أوراق, مروحة, مضخة, مطحنة, غسالة, مكيف, سخان). null si c'est un exercice théorique pur (dessin technique, schéma, montage).
10. **general_subject** : 3-6 mots décrivant le sujet.
11. **summary** : exactement 3 lignes (\\n), 30-50 mots, dans la langue du texte.
12. **language** : "fr" | "ar" | "en"

Retourne UNIQUEMENT ce JSON (pas de markdown):
{
  "school_name_fr": null,
  "school_name_ar": null,
  "is_pilote": null,
  "teachers": [],
  "file_type": "DEVOIR",
  "number": null,
  "year": null,
  "title": "...",
  "system_name": null,
  "general_subject": "...",
  "summary": "...",
  "language": "ar"
}

TEXTE EXTRAIT DU PDF:
"""


def load_progress():
    if Path(PROGRESS_FILE).exists():
        return json.loads(Path(PROGRESS_FILE).read_text())
    return {'done': [], 'failed': [], 'started': time.time()}


def save_progress(prog):
    prog['updated'] = time.time()
    Path(PROGRESS_FILE).write_text(json.dumps(prog, ensure_ascii=False))


def extract_text_pymupdf(pdf_path, max_pages=3):
    try:
        doc = fitz.open(pdf_path)
        all_text = []
        for i in range(min(doc.page_count, max_pages)):
            all_text.append(doc[i].get_text())
        doc.close()
        return '\n\n--- PAGE BREAK ---\n\n'.join(all_text)
    except Exception as e:
        return ''


def extract_text_tesseract(pdf_path, max_pages=3, dpi=220, lang=TESS_LANG):
    try:
        doc = fitz.open(pdf_path)
        all_text = []
        for i in range(min(doc.page_count, max_pages)):
            page = doc[i]
            pix = page.get_pixmap(dpi=dpi)
            img = Image.open(io.BytesIO(pix.tobytes('png')))
            try:
                t = pytesseract.image_to_string(img, lang=lang, config=TESS_CONFIG)
            except Exception:
                t = pytesseract.image_to_string(img, lang='eng', config=TESS_CONFIG)
            all_text.append(t)
        doc.close()
        return '\n\n--- PAGE BREAK ---\n\n'.join(all_text)
    except Exception as e:
        return ''


def text_quality(text):
    if not text:
        return 0
    t = text.strip()
    if len(t) < 50:
        return 5
    words = re.findall(r'\b\w{3,}\b', t)
    if len(words) < 20:
        return 10
    alphanumeric = sum(1 for c in t if c.isalnum() or c.isspace())
    ratio = alphanumeric / len(t) if t else 0
    score = min(100, len(words) // 5)
    if ratio > 0.7:
        score = min(100, score + 20)
    return score


def extract_text_best(pdf_path, max_pages=3):
    """Try PyMuPDF then Tesseract, return best."""
    t0 = time.time()
    mupdf_text = extract_text_pymupdf(pdf_path, max_pages)
    mupdf_score = text_quality(mupdf_text)
    mupdf_time = time.time() - t0
    
    t1 = time.time()
    tess_text = extract_text_tesseract(pdf_path, max_pages)
    tess_score = text_quality(tess_text)
    tess_time = time.time() - t1
    
    if mupdf_score >= tess_score and mupdf_score >= 30:
        return mupdf_text, 'pymupdf', mupdf_time + tess_time
    if tess_score >= 30:
        return tess_text, 'tesseract', mupdf_time + tess_time
    if len(tess_text) > len(mupdf_text):
        return tess_text, 'tesseract', mupdf_time + tess_time
    return mupdf_text, 'pymupdf', mupdf_time + tess_time


def gpt_extract(text, client, max_retries=3):
    """Send text to GPT-4o-mini for structured extraction."""
    for attempt in range(max_retries):
        try:
            text_trim = text[:3500]
            resp = client.chat.completions.create(
                model='gpt-4o-mini',
                messages=[
                    {'role': 'system', 'content': 'Tu réponds uniquement en JSON valide, sans markdown.'},
                    {'role': 'user', 'content': PROMPT_ATTRS + text_trim}
                ],
                temperature=0.1,
                max_tokens=900,
            )
            content = resp.choices[0].message.content.strip()
            if content.startswith('```'):
                content = content.split('```')[1]
                if content.startswith('json'):
                    content = content[4:]
                content = content.strip()
            return json.loads(content)
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(2 + attempt * 2)
            else:
                raise


def find_resource_id(numeric_id):
    """Find the cuid id from numericId."""
    r = neon_query(f'SELECT id FROM "Resource" WHERE "numericId" = {numeric_id}')
    if r['response'][0].get('data', {}).get('rows'):
        return r['response'][0]['data']['rows'][0][0]
    return None


def write_resource_content(resource_id, full_text, method, duration_ms, word_count):
    """Write OCR text to ResourceContent."""
    if not full_text or len(full_text.strip()) < 50:
        return False
    full_text = sanitize_text(full_text)
    if len(full_text) > 50000:
        full_text = full_text[:50000]
    
    # UPSERT
    sql = f'''
INSERT INTO "ResourceContent" ("id", "resourceId", "fullText", "extractionMethod", "extractionDurationMs", "wordCount", "extractedAt", "modelUsed")
VALUES (gen_random_uuid()::text, '{resource_id}', {sql_escape(full_text)}, {sql_escape(method)}, {int(duration_ms)}, {word_count}, NOW(), {sql_escape('pymupdf+tesseract+gpt-4o-mini')})
ON CONFLICT ("resourceId") DO UPDATE SET
  "fullText" = EXCLUDED."fullText",
  "extractionMethod" = EXCLUDED."extractionMethod",
  "extractionDurationMs" = EXCLUDED."extractionDurationMs",
  "wordCount" = EXCLUDED."wordCount",
  "extractedAt" = NOW(),
  "modelUsed" = EXCLUDED."modelUsed"
'''
    # DEBUG: print first 500 chars
    if os.environ.get('DEBUG_SQL'):
        print('SQL:', sql[:500], flush=True)
    r = neon_query(sql)
    if r.get('response') and r['response'][0].get('error'):
        if os.environ.get('DEBUG_SQL'):
            print('ERROR at:', sql[max(0, r['response'][0].get('error', '').find('near')-100):][:500], flush=True)
        raise Exception(f"SQL error: {r['response'][0]['error'][:300]}")
    return True


def write_resource_metadata(resource_id, attrs, page_count):
    """Write extracted attributes to ResourceMetadata."""
    teachers_json = json.dumps(attrs.get('teachers', []), ensure_ascii=False)
    teachers_json = sanitize_text(teachers_json)[:5000]
    summary = sanitize_text(attrs.get('summary', ''))[:5000]
    general_subject = sanitize_text(attrs.get('general_subject', ''))[:500]
    system_name = sanitize_text(attrs.get('system_name', ''))[:200] if attrs.get('system_name') else None
    school_fr = sanitize_text(attrs.get('school_name_fr', ''))[:200] if attrs.get('school_name_fr') else None
    school_ar = sanitize_text(attrs.get('school_name_ar', ''))[:200] if attrs.get('school_name_ar') else None
    
    # Build the values for the SQL
    # Note: sql_escape adds quotes already, so don't double-quote
    teachers_array = ','.join(
        sql_escape(t.get('name_fr') or t.get('name_ar') or '')
        for t in attrs.get('teachers', [])
    ) or "''"
    
    sql = f'''
INSERT INTO "ResourceMetadata" ("id", "resourceId", "profNames", "schoolName", "year", "type", "subject", "generalSubject", "systemName", "keyPoints", "extractedAt", "modelUsed")
VALUES (gen_random_uuid()::text, '{resource_id}', ARRAY[{teachers_array}]::text[],
    {sql_escape(school_fr) if school_fr else 'NULL'},
    {sql_escape(attrs.get('year', '')) if attrs.get('year') else 'NULL'},
    {sql_escape(attrs.get('file_type', '')) if attrs.get('file_type') else 'NULL'},
    NULL,
    {sql_escape(general_subject) if general_subject else 'NULL'},
    {sql_escape(system_name) if system_name else 'NULL'},
    ARRAY[{sql_escape(general_subject) if general_subject else "''"}]::text[],
    NOW(),
    {sql_escape('gpt-4o-mini-v2')}
)
ON CONFLICT ("resourceId") DO UPDATE SET
  "profNames" = EXCLUDED."profNames",
  "schoolName" = EXCLUDED."schoolName",
  "year" = EXCLUDED."year",
  "type" = EXCLUDED."type",
  "subject" = EXCLUDED."subject",
  "generalSubject" = EXCLUDED."generalSubject",
  "systemName" = EXCLUDED."systemName",
  "keyPoints" = EXCLUDED."keyPoints",
  "extractedAt" = NOW(),
  "modelUsed" = EXCLUDED."modelUsed"
'''
    r = neon_query(sql)
    return True


def write_resource_summary(resource_id, summary):
    """Write AI summary to ResourceSummary."""
    if not summary:
        return False
    summary = sanitize_text(summary)[:10000]
    
    sql = f'''
INSERT INTO "ResourceSummary" ("id", "resourceId", "summary", "extractedAt", "modelUsed")
VALUES (gen_random_uuid()::text, '{resource_id}', {sql_escape(summary)}, NOW(), {sql_escape('gpt-4o-mini-v2')})
ON CONFLICT ("resourceId") DO UPDATE SET
  "summary" = EXCLUDED."summary",
  "extractedAt" = NOW(),
  "modelUsed" = EXCLUDED."modelUsed"
'''
    r = neon_query(sql)
    return True


def process_file(item, client, idx, total):
    """Process one file end-to-end."""
    nid = item['nid']
    pdf = CACHE_DIR / f'{nid}.pdf'
    
    print(f'\n[{idx}/{total}] #{nid}', flush=True)
    
    # 1. Download
    if not pdf.exists() or pdf.stat().st_size < 1000:
        try:
            download_pdf(item['fileKey'], str(pdf))
        except Exception as e:
            print(f'  ✗ Download failed: {e}', flush=True)
            return False
    
    # 2. Extract text
    text_cache = TEXT_DIR / f'{nid}.txt'
    if text_cache.exists() and text_cache.stat().st_size > 100:
        text = text_cache.read_text()
        # parse header
        header = text.split('\n')[0]
        method = header.split('METHOD: ')[1].strip() if 'METHOD:' in header else 'cached'
        text = '\n'.join(text.split('\n')[3:])
    else:
        t0 = time.time()
        text, method, duration = extract_text_best(str(pdf), max_pages=3)
        # cache
        with open(text_cache, 'w') as f:
            f.write(f'# METHOD: {method}\n# DURATION: {time.time()-t0:.1f}s\n# LEN: {len(text)}\n\n')
            f.write(text)
    
    if not text or len(text.strip()) < 50:
        print(f'  ⚠ Text too short, skipping GPT', flush=True)
        return False
    
    word_count = len(re.findall(r'\b\w+\b', text))
    print(f'  📄 {method}, {len(text)}c, {word_count}w', flush=True)
    
    # 3. GPT extraction
    try:
        attrs = gpt_extract(text, client)
        print(f'  🤖 GPT: type={attrs.get("file_type")}, sys={attrs.get("system_name") or "—"}, year={attrs.get("year") or "—"}', flush=True)
    except Exception as e:
        print(f'  ✗ GPT failed: {str(e)[:80]}', flush=True)
        return False
    
    # 4. Write to DB
    resource_id = find_resource_id(nid)
    if not resource_id:
        print(f'  ✗ Resource not found', flush=True)
        return False
    
    try:
        # Content
        write_resource_content(resource_id, text, method, int(duration*1000) if 'duration' in dir() else 0, word_count)
        # Metadata
        write_resource_metadata(resource_id, attrs, 0)
        # Summary
        write_resource_summary(resource_id, attrs.get('summary', ''))
        print(f'  ✓ DB write OK', flush=True)
        return True
    except Exception as e:
        print(f'  ✗ DB write failed: {str(e)[:200]}', flush=True)
        return False


def main():
    items = json.loads(Path('/tmp/techno-all-ids.json').read_text())
    prog = load_progress()
    
    client = openai.OpenAI(api_key=os.environ['OPENAI_API_KEY'])
    
    print(f'Pipeline: {len(items)} Technologie collège files', flush=True)
    print(f'Already done: {len(prog["done"])}, failed: {len(prog["failed"])}', flush=True)
    
    total = len(items)
    ok = 0
    fail = 0
    skipped = 0
    
    for i, item in enumerate(items):
        nid = item['nid']
        if nid in prog['done']:
            skipped += 1
            continue
        if nid in prog['failed']:
            # try again
            prog['failed'].remove(nid)
        
        if process_file(item, client, i+1, total):
            prog['done'].append(nid)
            ok += 1
        else:
            prog['failed'].append(nid)
            fail += 1
        
        # save every 10
        if (i+1) % 10 == 0:
            save_progress(prog)
            elapsed = time.time() - prog['started']
            rate = (i+1) / elapsed * 60 if elapsed > 0 else 0
            print(f'\n--- Progress: {i+1}/{total} done, {ok} ok, {fail} fail, {skipped} skipped, {rate:.1f} files/min ---', flush=True)
    
    save_progress(prog)
    print(f'\n=== Final: {ok} ok, {fail} fail, {skipped} skipped ===', flush=True)


if __name__ == '__main__':
    main()
