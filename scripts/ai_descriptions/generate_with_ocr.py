#!/usr/bin/env python3
"""AI description generator with OCR fallback for scanned PDFs."""

import os
import sys
import json
import time
import asyncio
import asyncpg
import requests
import subprocess
import hashlib
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
DATABASE_URL = os.environ.get('DATABASE_URL')

PROGRESS_FILE = '/workspace/scripts/ai_descriptions/progress_ocr.json'
BROKEN_FILE = '/workspace/scripts/ai_descriptions/broken_files.json'

STATS = {'success': 0, 'ocr_used': 0, 'broken': 0, 'failed': 0}


def log(msg):
    ts = time.strftime('%H:%M:%S')
    print(f"[{ts}] {msg}", flush=True)


def pdf_to_images(pdf_path, output_prefix, dpi=200, max_pages=2):
    """Convert PDF to PNG images."""
    try:
        subprocess.run(
            ['pdftoppm', '-png', '-r', str(dpi), '-f', '1', '-l', str(max_pages), 
             '-gray',  # grayscale for better OCR
             pdf_path, output_prefix],
            capture_output=True, timeout=30
        )
        import glob
        return sorted(glob.glob(f'{output_prefix}*.png'))
    except Exception:
        return []


def ocr_images(image_paths, lang='fra'):
    """OCR multiple images and combine."""
    texts = []
    for img in image_paths:
        try:
            result = subprocess.run(
                ['tesseract', img, '-', '-l', lang, '--psm', '6',
                 '--tessdata-dir', '/usr/share/tesseract-ocr/5/tessdata'],
                capture_output=True, text=True, timeout=30
            )
            t = (result.stdout or '').strip()
            if t:
                texts.append(t)
        except Exception:
            pass
    return '\n---\n'.join(texts)


def download_and_extract(url, lang='fra'):
    """Download PDF, try pdftotext first, then OCR fallback."""
    # Map ISO 639-1 to ISO 639-2 for tesseract
    lang_map = {'fr': 'fra', 'ar': 'ara', 'en': 'eng'}
    lang = lang_map.get(lang, lang)
    try:
        resp = requests.get(url, timeout=15, stream=True)
        if resp.status_code != 200:
            return None, 'download_failed'
        content = b''
        for chunk in resp.iter_content(8192):
            content += chunk
            if len(content) > 5 * 1024 * 1024:  # 5MB cap
                break
        if not content.startswith(b'%PDF'):
            return None, 'not_pdf'
        
        # Save to unique temp file
        url_hash = hashlib.md5(url.encode()).hexdigest()[:10]
        pdf_path = f'/tmp/ocr_{url_hash}.pdf'
        with open(pdf_path, 'wb') as f:
            f.write(content)
        
        # Try pdftotext first (fast path)
        try:
            result = subprocess.run(
                ['timeout', '5', 'pdftotext', pdf_path, '-'],
                capture_output=True, text=True, timeout=8
            )
            text = (result.stdout or '').strip()
            if len(text) >= 50:
                try:
                    os.remove(pdf_path)
                except:
                    pass
                return text[:3500], 'pdftotext'
        except Exception:
            pass
        
        # Fallback: OCR
        log(f"    [OCR] Fallback for {url_hash} (lang={lang})")
        prefix = f'/tmp/ocr_img_{url_hash}'
        images = pdf_to_images(pdf_path, prefix, dpi=200, max_pages=2)
        if not images:
            try:
                os.remove(pdf_path)
            except:
                pass
            return None, 'no_images'
        
        ocr_text = ocr_images(images, lang=lang)
        
        # Cleanup
        try:
            os.remove(pdf_path)
            for img in images:
                os.remove(img)
        except:
            pass
        
        if len(ocr_text) < 30:
            return None, 'ocr_empty'
        
        STATS['ocr_used'] += 1
        return ocr_text[:3500], 'ocr'
    except Exception as e:
        return None, f'exception: {str(e)[:50]}'


def call_openai(text, title, lang):
    """Call GPT-4o-mini."""
    prompt = f"""Analyse ce document éducatif tunisien et génère une description intelligente.

Langue: {lang}
Titre: {title}

Texte extrait:
{text}

Réponds UNIQUEMENT en JSON strict:
{{"description": "<strong>Matière:</strong> X<br><strong>Classe:</strong> Y<br><strong>Type:</strong> Z<br><strong>Résumé:</strong> ...<br><strong>Concepts:</strong> a, b, c", "metaDescription": "max 155 chars SEO"}}"""

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
                    {'role': 'system', 'content': 'Tu réponds UNIQUEMENT en JSON valide, sans markdown.'},
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


async def update_db(rid, description, meta, lang):
    conn = await asyncpg.connect(DATABASE_URL.replace('?schema=public', ''))
    try:
        await conn.execute('''
            UPDATE "Resource" 
            SET description = $1, "metaDescription" = $2, 
                "descriptionSource" = 'gpt-4o-mini-ocr-v1',
                "descriptionGeneratedAt" = NOW(), language = $3
            WHERE id = $4::text
        ''', description, meta[:200], lang, rid)
    finally:
        await conn.close()


async def mark_broken(rid):
    """Mark a resource as having a broken/corrupted file."""
    conn = await asyncpg.connect(DATABASE_URL.replace('?schema=public', ''))
    try:
        # Add a marker in tags or descriptionSource
        await conn.execute('''
            UPDATE "Resource" 
            SET description = COALESCE(description, $1),
                "metaDescription" = COALESCE("metaDescription", $2),
                "descriptionSource" = 'broken-pdf-watermark-bug',
                "descriptionGeneratedAt" = NOW()
            WHERE id = $3::text
        ''', 
        '⚠️ Ce fichier PDF semble corrompu (vide après nettoyage du watermark). Veuillez le réimporter depuis la source.',
        'Fichier non disponible - PDF corrompu',
        rid)
    finally:
        await conn.close()


async def process_one_sync(resource, progress, broken_list):
    """Process one resource."""
    rid = resource['id']
    if rid in progress.get('done', []):
        return 'skipped'
    
    # Detect language hint from title
    lang_hint = resource.get('language') or 'fr'
    
    text, source = download_and_extract(resource['fileUrl'], lang=lang_hint)
    if not text:
        # Mark as broken
        try:
            await mark_broken(rid)
            broken_list.append(rid)
            STATS['broken'] += 1
            return 'broken'
        except Exception:
            STATS['failed'] += 1
            return 'mark_broken_failed'
    
    # Detect actual language from text
    arabic = sum(1 for c in text if '\u0600' <= c <= '\u06FF')
    latin = sum(1 for c in text if c.isascii() and c.isalpha())
    actual_lang = 'ar' if arabic > latin * 0.3 else lang_hint
    
    result, tokens, cost = call_openai(text, resource['title'], actual_lang)
    if not result or 'description' not in result:
        STATS['failed'] += 1
        return 'no_ai'
    
    try:
        await update_db(
            rid,
            result['description'],
            result.get('metaDescription', ''),
            actual_lang
        )
        progress.setdefault('done', []).append(rid)
        STATS['success'] += 1
        return f'success ({source})'
    except Exception:
        STATS['failed'] += 1
        return 'db_error'


def process_one_in_thread(resource, progress, broken_list):
    return asyncio.run(process_one_sync(resource, progress, broken_list))


async def main():
    # Load categorization from Phase 1
    corrupted_ids = []
    scanned_ids = []
    text_ids = []
    
    if os.path.exists('/workspace/imports/corrupted_pdfs.json'):
        with open('/workspace/imports/corrupted_pdfs.json') as f:
            corrupted_ids = [c['id'] for c in json.load(f)]
    if os.path.exists('/workspace/imports/scanned_pdfs.json'):
        with open('/workspace/imports/scanned_pdfs.json') as f:
            scanned_ids = [c['id'] for c in json.load(f)]
    if os.path.exists('/workspace/imports/has_text_pdfs.json'):
        with open('/workspace/imports/has_text_pdfs.json') as f:
            text_ids = [c['id'] for c in json.load(f)]
    
    log(f"📋 Loaded: {len(corrupted_ids)} corrupted, {len(scanned_ids)} scanned, {len(text_ids)} text")
    
    # Get all template resources from DB
    conn = await asyncpg.connect(DATABASE_URL.replace('?schema=public', ''))
    try:
        rows = await conn.fetch('''
            SELECT id, title, "fileUrl", language
            FROM "Resource" 
            WHERE "descriptionSource" = 'template-v3-multilingual'
              AND "fileUrl" IS NOT NULL
            ORDER BY "createdAt" DESC
        ''')
        resources = [dict(r) for r in rows]
    finally:
        await conn.close()
    
    log(f"📦 Found {len(resources)} template resources")
    
    # Load progress
    progress = {}
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            progress = json.load(f)
    
    broken_list = []
    if os.path.exists(BROKEN_FILE):
        with open(BROKEN_FILE) as f:
            broken_list = json.load(f)
    
    remaining = [r for r in resources if r['id'] not in progress.get('done', []) 
                 and r['id'] not in broken_list]
    log(f"📊 Already done: {len(progress.get('done', []))}, Broken: {len(broken_list)}, Remaining: {len(remaining)}")
    
    if not remaining:
        log("🎉 All done!")
        return
    
    start = time.time()
    processed = 0
    last_save = time.time()
    
    # 4 workers (OCR is slow, can't do more)
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(process_one_in_thread, r, progress, broken_list): r for r in remaining}
        for future in as_completed(futures):
            processed += 1
            result = future.result()
            
            if processed % 10 == 0:
                elapsed = time.time() - start
                rate = processed / elapsed if elapsed > 0 else 0
                eta_sec = (len(remaining) - processed) / rate if rate > 0 else 0
                log(f"[{processed}/{len(remaining)}] ✅{STATS['success']} 📄{STATS['ocr_used']} ⚠️{STATS['broken']} ❌{STATS['failed']} | "
                    f"ETA {eta_sec/60:.0f}min | last: {result}")
            
            # Save progress every 30 sec
            if time.time() - last_save > 30:
                with open(PROGRESS_FILE, 'w') as f:
                    json.dump(progress, f)
                with open(BROKEN_FILE, 'w') as f:
                    json.dump(broken_list, f)
                last_save = time.time()
    
    # Final save
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress, f)
    with open(BROKEN_FILE, 'w') as f:
        json.dump(broken_list, f)
    
    elapsed = time.time() - start
    log(f"\n{'='*60}")
    log(f"📊 FINAL: ✅{STATS['success']} 📄OCR:{STATS['ocr_used']} ⚠️broken:{STATS['broken']} ❌failed:{STATS['failed']}")
    log(f"⏱️ Total: {elapsed/60:.1f} min")
    log(f"💰 Est. cost: ${STATS['success'] * 0.00025:.2f}")


if __name__ == '__main__':
    asyncio.run(main())
