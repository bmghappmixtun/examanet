#!/usr/bin/env python3
"""Test AI description generation on 1 sample file."""

import os
import json
import subprocess
import requests
import sys

# Load env from edutunisie/.env
with open('/workspace/edutunisie/.env.local') as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        os.environ.setdefault(k, v.strip('"').strip("'"))

OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY')
print(f"API Key: {OPENAI_API_KEY[:20]}...")

API_BASE = "https://examanet.com"
SEED_TOKEN = "cffa7e495ff6a441d253b03b8cf1efa7"

# 1. Get a sample resource (Arabic, template description)
print("\n1. Fetching sample resource from DB...")
import asyncpg
import asyncio

async def get_sample():
    conn = await asyncpg.connect(os.environ['DATABASE_URL'].replace('?schema=public', ''))
    row = await conn.fetchrow('''
        SELECT id, title, "fileUrl", language, "descriptionSource"
        FROM "Resource" 
        WHERE language = 'ar' 
          AND "descriptionSource" = 'template-v3-multilingual'
          AND "fileUrl" IS NOT NULL
        LIMIT 1
    ''')
    await conn.close()
    return dict(row) if row else None

resource = asyncio.run(get_sample())
if not resource:
    print("❌ No sample found")
    exit(1)

print(f"  Title: {resource['title'][:80]}")
print(f"  Lang: {resource['language']}")
print(f"  URL: {resource['fileUrl'][:80]}...")

# 2. Download PDF
print("\n2. Downloading PDF...")
resp = requests.get(resource['fileUrl'], timeout=30)
print(f"  Status: {resp.status_code}, Size: {len(resp.content)} bytes")
pdf_bytes = resp.content

# 3. Extract text with pdftotext
print("\n3. Extracting text with pdftotext...")
with open('/tmp/sample.pdf', 'wb') as f:
    f.write(pdf_bytes)

result = subprocess.run(['pdftotext', '/tmp/sample.pdf', '-'], capture_output=True, text=True, timeout=30)
text = result.stdout
print(f"  Extracted: {len(text)} chars")
print(f"  First 200 chars: {text[:200]}")

# 4. Call OpenAI
print("\n4. Calling OpenAI GPT-4o-mini...")
prompt = f"""Tu es un assistant pédagogique expert. Analyse ce document éducatif tunisien et génère une description intelligente.

Langue du document : {resource['language']}
Titre : {resource['title']}

Texte extrait du PDF :
{text[:3000]}

Génère :
1. **Description HTML** (multilingue selon la langue) avec :
   - Matière, classe, type, année
   - Résumé intelligent (2-3 phrases)
   - Concepts/exercices principaux détectés
2. **Meta description** (155 caractères max, optimisée SEO)

Réponds UNIQUEMENT en JSON valide :
{{
  "description": "<strong>...</strong>...",
  "metaDescription": "..."
}}
"""

resp = requests.post(
    'https://api.openai.com/v1/chat/completions',
    headers={
        'Authorization': f'Bearer {OPENAI_API_KEY}',
        'Content-Type': 'application/json'
    },
    json={
        'model': 'gpt-4o-mini',
        'messages': [
            {'role': 'system', 'content': 'Tu es un assistant pédagogique expert en éducation tunisienne. Tu réponds UNIQUEMENT en JSON valide.'},
            {'role': 'user', 'content': prompt}
        ],
        'temperature': 0.3,
        'max_tokens': 1000,
    },
    timeout=60
)

if resp.status_code != 200:
    print(f"  ❌ API error: {resp.status_code}")
    print(resp.text[:500])
    exit(1)

result = resp.json()
content = result['choices'][0]['message']['content']
usage = result.get('usage', {})

print(f"  ✅ Success")
print(f"  Tokens: {usage.get('total_tokens', '?')}")
print(f"  Cost (est): ${usage.get('total_tokens', 0) * 0.00000015:.5f}")

# Parse JSON
try:
    # Strip markdown code blocks if any
    if '```json' in content:
        content = content.split('```json')[1].split('```')[0].strip()
    elif '```' in content:
        content = content.split('```')[1].split('```')[0].strip()
    
    parsed = json.loads(content)
    print(f"\n5. Generated description:")
    print(f"   Description ({len(parsed.get('description', ''))} chars):")
    print(f"   {parsed.get('description', '')[:500]}")
    print(f"\n   Meta ({len(parsed.get('metaDescription', ''))} chars):")
    print(f"   {parsed.get('metaDescription', '')}")
except Exception as e:
    print(f"\n❌ JSON parse error: {e}")
    print(f"Raw content: {content[:500]}")
