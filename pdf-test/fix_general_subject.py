#!/usr/bin/env python3
"""
Fix generalSubject for all college files - BATCH version.
1. Extract topic from title (after last ':') — batch UPDATE
2. Re-run FR ones in AR (for AR subjects)
"""
import os, json, time, re
from pathlib import Path
import openai
import sys

sys.path.insert(0, '/workspace/edutunisie/pdf-test')
from bulk_math_v5 import neon_query, sql_escape, sanitize_text

PROGRESS_FILE = '/tmp/fix-gs-progress.json'


def ar_ratio(s):
    if not s: return 0
    ar = len(re.findall(r'[\u0600-\u06FF]', s))
    return ar / len(s) if s else 0


def step1_extract_topics_batch():
    """Step 1: Extract topic from title, batch update with single CASE WHEN."""
    print('=== STEP 1: Extract topic from title (batch UPDATE) ===', flush=True)
    
    # Get all college files
    r = neon_query('''
SELECT r."numericId", r.id, r.title, s.slug as subject
FROM "Resource" r
JOIN "Subject" s ON s.id = r."subjectId"
JOIN "Class" c ON c.id = r."classId"
WHERE r.status = 'PUBLISHED' AND c.slug IN ('7eme','8eme','9eme')
ORDER BY r."numericId"
''')
    items = []
    for row in r['response'][0]['data']['rows']:
        title = row[2]
        if not title or ':' not in title: continue
        parts = title.rsplit(':', 1)
        topic = parts[1].strip()
        if len(topic) < 3 or len(topic) > 200: continue
        items.append((row[1], topic))  # (resource_id, topic)
    
    print(f'Items with extractable topic: {len(items)}', flush=True)
    
    # Batch update in chunks of 100
    CHUNK = 100
    updated = 0
    for i in range(0, len(items), CHUNK):
        chunk = items[i:i+CHUNK]
        # Build UPDATE FROM VALUES
        values = ','.join(f"('{rid}', {sql_escape(topic)})" for rid, topic in chunk)
        sql = f'''
UPDATE "ResourceMetadata" rm
SET "generalSubject" = v.new_gs
FROM (VALUES {values}) AS v(id, new_gs)
WHERE rm."resourceId" = v.id
'''
        try:
            r2 = neon_query(sql)
            if r2.get('response') and r2['response'][0].get('error'):
                print(f'Chunk {i//CHUNK + 1}: ERROR {r2["response"][0]["error"][:200]}', flush=True)
            else:
                updated += len(chunk)
                if (i // CHUNK + 1) % 10 == 0:
                    print(f'  Updated {updated}/{len(items)}', flush=True)
        except Exception as e:
            print(f'Chunk {i//CHUNK + 1}: {e}', flush=True)
    
    print(f'\nStep 1: {updated} generalSubject updated', flush=True)


def step2_rerun_fr_in_ar():
    """Step 2: For AR subjects with FR attributes, re-run GPT in AR."""
    print('\n=== STEP 2: Re-run FR attributes in AR ===', flush=True)
    
    # Find files with FR generalSubject or summary for AR subjects
    r = neon_query('''
SELECT r.id, r."numericId", s.slug as subject
FROM "Resource" r
JOIN "Subject" s ON s.id = r."subjectId"
JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
LEFT JOIN "ResourceSummary" rs ON rs."resourceId" = r.id
WHERE r.status = 'PUBLISHED' AND c.slug IN ('7eme','8eme','9eme')
  AND s.slug NOT IN ('francais', 'anglais', 'histoire-geographie')
''')
    all_files = [(row[0], int(row[1]), row[2]) for row in r['response'][0]['data']['rows']]
    
    # Get current values
    fr_files = []
    for rid, nid, subj in all_files:
        r2 = neon_query(f'SELECT rm."generalSubject", rs.summary FROM "ResourceMetadata" rm LEFT JOIN "ResourceSummary" rs ON rs."resourceId" = rm."resourceId" WHERE rm."resourceId" = \'{rid}\'')
        rows = r2['response'][0].get('data', {}).get('rows', [])
        if rows:
            gs, su = rows[0][0] or '', rows[0][1] or ''
            if (gs and ar_ratio(gs) < 0.3) or (su and ar_ratio(su) < 0.3):
                fr_files.append((rid, nid, subj))
    
    # Dedupe
    seen = set()
    unique = []
    for rid, nid, subj in fr_files:
        if rid not in seen:
            seen.add(rid)
            unique.append((rid, nid, subj))
    
    print(f'Files with FR attributes (for AR subjects): {len(unique)}', flush=True)
    
    PROMPT_AR = """Tu es un expert pédagogique tunisien. Analyse le texte extrait d'un PDF scolaire tunisien (collège).

**LANGUE OBLIGATOIRE : TOUS les champs texte doivent être en ARABE**.

Retourne UNIQUEMENT ce JSON:
{
  "general_subject": "3-6 mots EN ARABE",
  "summary": "3 lignes (\\n) EN ARABE, 30-50 mots"
}

TEXTE:
"""
    
    client = openai.OpenAI(api_key=os.environ['OPENAI_API_KEY'])
    ok = 0
    fail = 0
    
    for i, (rid, nid, subj) in enumerate(unique):
        r2 = neon_query(f'SELECT "fullText" FROM "ResourceContent" WHERE "resourceId" = \'{rid}\'')
        rows2 = r2['response'][0].get('data', {}).get('rows', [])
        if not rows2 or not rows2[0][0]:
            continue
        text = rows2[0][0][:3500]
        
        try:
            resp = client.chat.completions.create(
                model='gpt-4o-mini',
                messages=[
                    {'role': 'system', 'content': 'Tu réponds uniquement en JSON valide. Tous les champs texte en ARABE.'},
                    {'role': 'user', 'content': PROMPT_AR + text}
                ],
                temperature=0.1,
                max_tokens=500,
            )
            content = resp.choices[0].message.content.strip()
            if content.startswith('```'):
                content = content.split('```')[1]
                if content.startswith('json'):
                    content = content[4:]
                content = content.strip()
            attrs = json.loads(content)
            
            if attrs.get('general_subject'):
                sql = f'''UPDATE "ResourceMetadata" SET "generalSubject" = {sql_escape(attrs["general_subject"])} WHERE "resourceId" = \'{rid}\''''
                neon_query(sql)
            if attrs.get('summary'):
                sql = f'''UPDATE "ResourceSummary" SET "summary" = {sql_escape(attrs["summary"])} WHERE "resourceId" = \'{rid}\''''
                neon_query(sql)
            ok += 1
            if (i+1) % 20 == 0:
                print(f'  [{i+1}/{len(unique)}] ok={ok} fail={fail}', flush=True)
        except Exception as e:
            fail += 1
    
    print(f'\nStep 2: {ok} ok, {fail} fail', flush=True)


if __name__ == '__main__':
    step1_extract_topics_batch()
    step2_rerun_fr_in_ar()
