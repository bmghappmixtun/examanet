#!/usr/bin/env python3
"""Quick test of OCR pipeline on 3 files (one of each type)."""

import os
import sys
import json
import asyncio

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

sys.path.insert(0, '/workspace/edutunisie/scripts/ai_descriptions')
from generate_with_ocr import download_and_extract, call_openai


async def main():
    # Get 3 sample files from each category
    import asyncpg
    DATABASE_URL = os.environ.get('DATABASE_URL').replace('?schema=public', '')
    conn = await asyncpg.connect(DATABASE_URL)
    
    # 1 with text + 1 scanned + 1 corrupted
    with_text = json.load(open('/workspace/imports/has_text_pdfs.json'))[0]
    scanned = json.load(open('/workspace/imports/scanned_pdfs.json'))[0]
    corrupted = json.load(open('/workspace/imports/corrupted_pdfs.json'))[0]
    
    for label, pdf_id in [('WITH_TEXT', with_text['id']), ('SCANNED', scanned['id']), ('CORRUPTED', corrupted['id'])]:
        row = await conn.fetchrow('SELECT title, "fileUrl", language FROM "Resource" WHERE id = $1', pdf_id)
        if not row:
            continue
        print(f"\n{'='*60}")
        print(f"🧪 {label}: {row['title'][:60]}")
        print(f"ID: {pdf_id}")
        print(f"Lang: {row['language']}")
        
        text, source = download_and_extract(row['fileUrl'], lang=row['language'])
        if text:
            print(f"✅ Extracted {len(text)} chars via {source}")
            print(f"Sample: {text[:200]}...")
            
            # Call GPT
            result, tokens, cost = call_openai(text[:3000], row['title'], row['language'])
            if result:
                print(f"\n🤖 GPT-4o-mini result ({tokens} tokens, ${cost:.4f}):")
                print(f"  description: {result.get('description', '')[:200]}...")
                print(f"  meta: {result.get('metaDescription', '')[:100]}")
            else:
                print("❌ GPT call failed")
        else:
            print(f"❌ No text extracted ({source})")
    
    await conn.close()


if __name__ == '__main__':
    asyncio.run(main())
