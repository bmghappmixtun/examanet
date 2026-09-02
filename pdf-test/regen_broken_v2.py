#!/usr/bin/env python3
"""Regen v2: avoid $$ collision with AR text."""
import os, json, re, importlib.util
import concurrent.futures
from openai import OpenAI

spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

PROGRESS = '/workspace/edutunisie/pdf-test/regen_broken_progress.json'
done = {}
if os.path.exists(PROGRESS):
    with open(PROGRESS) as f: done = json.load(f)

client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY', ''))

r = m.neon_query('''
SELECT r.id, r."numericId", rc."fullText", c.slug as cls, s.slug as subj, r.language
FROM "Resource" r
LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
LEFT JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Subject" s ON s.id = r."subjectId"
WHERE r."descriptionSource" LIKE 'broken-pdf%'
  AND LENGTH(rc."fullText") > 1000
ORDER BY r."numericId"
''')
targets = [{
    'id': row[0], 'nid': row[1], 'fullText': str(row[2]), 
    'cls': row[3], 'subj': row[4], 'lang': row[5]
} for row in r.get('response', [{}])[0].get('data', {}).get('rows', [])]
print(f'Total: {len(targets)}', flush=True)

def gen_description(t):
    text = t['fullText'][:6000]
    is_ar = t['lang'] == 'ar' or any('\u0600' <= c <= '\u06FF' for c in text[:200])
    
    if is_ar:
        prompt = f"""لخّص هذا المستند التعليمي في 2-3 جمل بالعربية. ركز على الموضوع الرئيسي والمفاهيم.

المستوى: {t['cls']}
المادة: {t['subj']}

النص:
{text}

الملخص (2-3 جمل):"""
    else:
        prompt = f"""Résume ce document éducatif en 2-3 phrases en français. Focus sur le sujet principal.

Classe: {t['cls']}
Matière: {t['subj']}

Texte:
{text}

Résumé (2-3 phrases):"""
    
    try:
        resp = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[{'role': 'user', 'content': prompt}],
            max_tokens=200,
            temperature=0.3,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        return f'ERROR: {e}'

def process(t):
    nid_s = str(t['nid'])
    if done.get(nid_s) == 'ok':
        return (nid_s, 'skip', '')
    
    desc = gen_description(t)
    if desc.startswith('ERROR'):
        return (nid_s, 'fail', desc)
    
    # Clean control chars
    desc = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', desc)
    # Use ' ' for SQL strings, escape single quotes
    desc_sql = desc.replace("'", "''")
    
    try:
        # 1. Upsert ResourceSummary
        rs_sql = f"""INSERT INTO "ResourceSummary" (id, "resourceId", summary, "modelUsed", "extractedAt")
                     VALUES (gen_random_uuid(), '{t['id']}', '{desc_sql}', 'gpt-4o-mini-regen', NOW())"""
        m.neon_query(rs_sql)
        
        # 2. Update Resource
        r_sql = f"""UPDATE "Resource" 
                    SET description = '{desc_sql}',
                        "descriptionSource" = 'gpt-4o-mini',
                        summary = '{desc_sql}',
                        "descriptionGeneratedAt" = NOW()
                    WHERE id = '{t['id']}' """
        m.neon_query(r_sql)
        
        return (nid_s, 'ok', desc[:100])
    except Exception as e:
        return (nid_s, 'fail', str(e)[:100])

# Run
ok = 0
fail = 0
skip = 0
total = len(targets)
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
    futures = {ex.submit(process, t): t for t in targets}
    for fut in concurrent.futures.as_completed(futures):
        nid_s, status, msg = fut.result()
        if status == 'ok':
            done[nid_s] = 'ok'
            ok += 1
        elif status == 'skip':
            skip += 1
        else:
            done[nid_s] = f'fail:{msg}'
            fail += 1
        if (ok + fail + skip) % 10 == 0:
            print(f'[{ok+fail+skip}/{total}] OK:{ok} FAIL:{fail} SKIP:{skip}', flush=True)
            with open(PROGRESS, 'w') as f: json.dump(done, f)

with open(PROGRESS, 'w') as f: json.dump(done, f)
print(f'\nDone: {ok} OK, {fail} FAIL, {skip} SKIP')
