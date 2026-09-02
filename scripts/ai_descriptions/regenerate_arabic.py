#!/usr/bin/env python3
"""Regenerate AI descriptions for Arabic resources that have French content."""

import os, json, asyncio, asyncpg, requests, subprocess, time, hashlib, re
from concurrent.futures import ThreadPoolExecutor, as_completed

# Load env
for env_file in ['/workspace/edutunisie/.env.local', '/workspace/edutunisie/.env']:
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                k, v = line.split('=', 1)
                os.environ.setdefault(k, v.strip('"').strip("'"))

OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY')
DATABASE_URL = os.environ.get('DATABASE_URL').replace('?schema=public', '')

PROGRESS_FILE = '/workspace/scripts/ai_descriptions/regen_progress.json'
STATS = {'success': 0, 'failed': 0, 'no_text': 0}


def log(msg):
    ts = time.strftime('%H:%M:%S')
    print(f"[{ts}] {msg}", flush=True)


def download_and_extract(url):
    """Download PDF, try pdftotext then OCR."""
    try:
        resp = requests.get(url, timeout=15, stream=True)
        if resp.status_code != 200:
            return None
        content = b''
        for chunk in resp.iter_content(8192):
            content += chunk
            if len(content) > 5 * 1024 * 1024:
                break
        if not content.startswith(b'%PDF'):
            return None
        
        url_hash = hashlib.md5(url.encode()).hexdigest()[:10]
        pdf_path = f'/tmp/regen_{url_hash}.pdf'
        with open(pdf_path, 'wb') as f:
            f.write(content)
        
        # Try pdftotext
        try:
            result = subprocess.run(
                ['timeout', '5', 'pdftotext', pdf_path, '-'],
                capture_output=True, text=True, timeout=8
            )
            text = (result.stdout or '').strip()
            if len(text) >= 50:
                os.remove(pdf_path)
                return text[:3500]
        except:
            pass
        
        # Fallback: OCR
        prefix = f'/tmp/regen_img_{url_hash}'
        subprocess.run(
            ['pdftoppm', '-png', '-r', '200', '-f', '1', '-l', '2', '-gray',
             pdf_path, prefix],
            capture_output=True, timeout=30
        )
        
        import glob
        images = sorted(glob.glob(f'{prefix}*.png'))
        if not images:
            try: os.remove(pdf_path)
            except: pass
            return None
        
        texts = []
        for img in images:
            try:
                result = subprocess.run(
                    ['tesseract', img, '-', '-l', 'ara+fra', '--psm', '6',
                     '--tessdata-dir', '/usr/share/tesseract-ocr/5/tessdata'],
                    capture_output=True, text=True, timeout=30
                )
                t = (result.stdout or '').strip()
                if t:
                    texts.append(t)
            except:
                pass
        
        # Cleanup
        try: os.remove(pdf_path)
        except: pass
        for img in images:
            try: os.remove(img)
            except: pass
        
        if not texts:
            return None
        return '\n---\n'.join(texts)[:3500]
    except Exception:
        return None


def call_openai_arabic(text, title):
    """Call GPT-4o-mini with strict Arabic prompt."""
    prompt = f"""Tu es un expert éducatif tunisien. Analyse ce document et génère une description en ARABE UNIQUEMENT.

Titre: {title}

Texte extrait:
{text}

IMPORTANT: 
- La description doit être ENTIÈREMENT en arabe
- Utilise les labels arabes: المادة، الصف، النوع، السنة الدراسية، ملخص، المفاهيم

Réponds en JSON strict avec cette structure:
{{"description": "<strong>المادة :</strong> ...<br><strong>الصف :</strong> ...<br><strong>النوع :</strong> ...<br><strong>السنة الدراسية :</strong> ...<br><strong>ملخص :</strong> ...<br><strong>المفاهيم/المهارات المكتسبة :</strong> ...", "metaDescription": "وصف مختصر بالعربية max 155 حرف"}}"""
    
    try:
        resp = requests.post(
            'https://api.openai.com/v1/chat/completions',
            headers={
                'Authorization': f'Bearer {OPENAI_API_KEY}',
                'Content-Type': 'application/json'
            },
            json={
                'model': 'gpt-4o-mini',
                'messages': [
                    {'role': 'system', 'content': 'Tu réponds en JSON valide, sans markdown. Le contenu doit être en arabe.'},
                    {'role': 'user', 'content': prompt}
                ],
                'temperature': 0.3,
                'max_tokens': 800,
                'response_format': {'type': 'json_object'}
            },
            timeout=30
        )
        if resp.status_code != 200:
            return None, 0, 0
        result = resp.json()
        content = result['choices'][0]['message']['content']
        tokens = result.get('usage', {}).get('total_tokens', 0)
        parsed = json.loads(content)
        return parsed, tokens, tokens * 0.00000015
    except Exception:
        return None, 0, 0


async def update_db(rid, description, meta, lang='ar'):
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        await conn.execute('''
            UPDATE "Resource" 
            SET description = $1, "metaDescription" = $2, 
                "descriptionSource" = 'gpt-4o-mini-arabic-v1',
                "descriptionGeneratedAt" = NOW(), language = $3
            WHERE id = $4::text
        ''', description, meta[:200], lang, rid)
    finally:
        await conn.close()


async def process_one(resource, progress):
    rid = resource['id']
    if rid in progress.get('done', []):
        return 'skipped'
    
    text = download_and_extract(resource['fileUrl'])
    if not text:
        STATS['no_text'] += 1
        return 'no_text'
    
    result, tokens, cost = call_openai_arabic(text, resource['title'])
    if not result or 'description' not in result:
        STATS['failed'] += 1
        return 'no_ai'
    
    try:
        await update_db(
            rid,
            result['description'],
            result.get('metaDescription', ''),
            'ar'
        )
        progress.setdefault('done', []).append(rid)
        STATS['success'] += 1
        return f'success'
    except Exception:
        STATS['failed'] += 1
        return 'db_error'


def process_in_thread(resource, progress):
    return asyncio.run(process_one(resource, progress))


async def main():
    log('🔍 Finding Arabic resources with French content...')
    
    conn = await asyncpg.connect(DATABASE_URL)
    rows = await conn.fetch('''
        SELECT id, slug, title, "fileUrl"
        FROM "Resource" 
        WHERE description LIKE '%<strong>Matière:</strong>%'
          AND (language = 'ar' OR title ~ '[\\u0600-\\u06FF]')
          AND "fileUrl" IS NOT NULL
        ORDER BY id
    ''')
    resources = [dict(r) for r in rows]
    await conn.close()
    
    log(f'Found {len(resources)} Arabic resources with French descriptions')
    
    # Load progress
    progress = {}
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            progress = json.load(f)
    
    remaining = [r for r in resources if r['id'] not in progress.get('done', [])]
    log(f'Already done: {len(progress.get("done", []))}, Remaining: {len(remaining)}')
    
    if not remaining:
        log('🎉 All done!')
        return
    
    start = time.time()
    processed = 0
    last_save = time.time()
    
    # 4 workers (OCR is slow)
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(process_in_thread, r, progress): r for r in remaining}
        for future in as_completed(futures):
            processed += 1
            result = future.result()
            
            if processed % 20 == 0:
                elapsed = time.time() - start
                rate = processed / elapsed if elapsed > 0 else 0
                eta_sec = (len(remaining) - processed) / rate if rate > 0 else 0
                log(f'[{processed}/{len(remaining)}] ✅{STATS["success"]} ❌{STATS["failed"]} ⚠️{STATS["no_text"]} | ETA {eta_sec/60:.0f}min | last: {result}')
            
            if time.time() - last_save > 30:
                with open(PROGRESS_FILE, 'w') as f:
                    json.dump(progress, f)
                last_save = time.time()
    
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress, f)
    
    elapsed = time.time() - start
    log(f'\n📊 FINAL: ✅{STATS["success"]} ❌{STATS["failed"]} ⚠️{STATS["no_text"]} | {elapsed/60:.1f} min')


if __name__ == '__main__':
    asyncio.run(main())
