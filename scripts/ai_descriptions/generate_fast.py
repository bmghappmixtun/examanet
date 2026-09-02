#!/usr/bin/env python3
"""Fast batch AI description generator - simplified."""

import os
import sys
import json
import time
import asyncio
import asyncpg
import requests
import subprocess
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

PROGRESS_FILE = '/workspace/scripts/ai_descriptions/progress.json'
TMP_PDF = '/tmp/_fast.pdf'

STATS = {'success': 0, 'failed': 0}
print_lock = None


def log(msg):
    ts = time.strftime('%H:%M:%S')
    print(f"[{ts}] {msg}", flush=True)


def download_and_extract(url):
    """Download PDF (max 3MB) and extract text."""
    try:
        resp = requests.get(url, timeout=10, stream=True)
        if resp.status_code != 200:
            return None
        content = b''
        for chunk in resp.iter_content(8192):
            content += chunk
            if len(content) > 3 * 1024 * 1024:
                return None
        if not content.startswith(b'%PDF'):
            return None
        with open(TMP_PDF, 'wb') as f:
            f.write(content)
        # Use timeout + ignore errors
        result = subprocess.run(
            ['timeout', '5', 'pdftotext', TMP_PDF, '-'],
            capture_output=True, text=True, timeout=8
        )
        text = (result.stdout or '').strip()
        if len(text) < 50:
            return None
        return text[:3500]
    except Exception:
        return None


def call_openai(text, title, lang):
    """Call GPT-4o-mini."""
    prompt = f"""Analyse ce document éducatif tunisien et génère une description intelligente.

Langue: {lang}
Titre: {title}

Texte:
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
                "descriptionSource" = 'gpt-4o-mini-batch-v1',
                "descriptionGeneratedAt" = NOW(), language = $3
            WHERE id = $4::text
        ''', description, meta[:200], lang, rid)
    finally:
        await conn.close()


async def process_one_sync(resource, progress):
    """Process one resource synchronously (called from thread)."""
    rid = resource['id']
    if rid in progress.get('done', []):
        return 'skipped'
    
    text = download_and_extract(resource['fileUrl'])
    if not text:
        progress.setdefault('failed', []).append(rid)
        return 'no_text'
    
    # Detect language
    arabic = sum(1 for c in text if '\u0600' <= c <= '\u06FF')
    latin = sum(1 for c in text if c.isascii() and c.isalpha())
    actual_lang = 'ar' if arabic > latin * 0.3 else (resource.get('language') or 'fr')
    
    result, tokens, cost = call_openai(text, resource['title'], actual_lang)
    if not result or 'description' not in result:
        progress.setdefault('failed', []).append(rid)
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
        return 'success'
    except Exception:
        progress.setdefault('failed', []).append(rid)
        STATS['failed'] += 1
        return 'db_error'


def process_one_in_thread(resource, progress):
    """Wrapper to run async in thread."""
    return asyncio.run(process_one_sync(resource, progress))


async def main():
    log("Fetching resources...")
    conn = await asyncpg.connect(DATABASE_URL.replace('?schema=public', ''))
    try:
        rows = await conn.fetch('''
            SELECT id, title, "fileUrl", language
            FROM "Resource" 
            WHERE ("descriptionSource" = 'template-v3-multilingual' 
                   OR "descriptionSource" IS NULL)
              AND "fileUrl" IS NOT NULL
            ORDER BY "createdAt" DESC
            LIMIT 5000
        ''')
        resources = [dict(r) for r in rows]
    finally:
        await conn.close()
    log(f"Found {len(resources)} resources")
    
    # Load progress
    progress = {}
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            progress = json.load(f)
    
    remaining = [r for r in resources if r['id'] not in progress.get('done', [])]
    log(f"Already done: {len(progress.get('done', []))}, Remaining: {len(remaining)}")
    
    if not remaining:
        log("🎉 All done!")
        return
    
    start = time.time()
    processed = 0
    last_save = time.time()
    
    # Use ThreadPoolExecutor with async inside
    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {executor.submit(process_one_in_thread, r, progress): r for r in remaining}
        for future in as_completed(futures):
            processed += 1
            result = future.result()
            
            if processed % 20 == 0:
                elapsed = time.time() - start
                rate = processed / elapsed if elapsed > 0 else 0
                eta_sec = (len(remaining) - processed) / rate if rate > 0 else 0
                log(f"[{processed}/{len(remaining)}] ✅{STATS['success']} ❌{STATS['failed']} | "
                    f"ETA {eta_sec/60:.0f}min | last: {result}")
            
            # Save progress every 30 sec
            if time.time() - last_save > 30:
                with open(PROGRESS_FILE, 'w') as f:
                    json.dump(progress, f)
                last_save = time.time()
    
    # Final save
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress, f)
    
    elapsed = time.time() - start
    log(f"\n{'='*60}")
    log(f"📊 FINAL: ✅{STATS['success']} ❌{STATS['failed']} | {elapsed/60:.1f} min")


if __name__ == '__main__':
    asyncio.run(main())
