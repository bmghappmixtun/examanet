#!/usr/bin/env python3
"""Regenerate AI descriptions for 107 resources falsely marked as broken-pdf.
The fullText is already extracted (>1000c), just need to:
1. Re-generate AI description with GPT-4o-mini
2. Create ResourceSummary entry
3. Copy to Resource.description
4. Clear the broken-pdf flag
"""
import os, json, re, importlib.util, time
import concurrent.futures
from openai import OpenAI

spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

PROGRESS = '/workspace/edutunisie/pdf-test/regen_broken_progress.json'
done = {}
if os.path.exists(PROGRESS):
    with open(PROGRESS) as f: done = json.load(f)

# OpenAI
client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY', ''))

# Get the 107 candidates
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
print(f'Total targets: {len(targets)}', flush=True)

def gen_description(t):
    """Generate 2-3 sentence description from fullText."""
    text = t['fullText'][:6000]  # GPT-4o-mini context
    
    if t['lang'] == 'ar' or any('\u0600' <= c <= '\u06FF' for c in text[:200]):
        prompt = f"""لخّص محتوى هذا المستند التعليمي في 2-3 جمل بالعربية. ركز على الموضوع الرئيسي والمفاهيم المطروحة.

المستوى: {t['cls']}
المادة: {t['subj']}

النص:
{text}

الملخص (2-3 جمل):"""
    else:
        prompt = f"""Résume ce document éducatif en 2-3 phrases en français. Focus sur le sujet principal et les concepts abordés.

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
    
    # Clean
    desc = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', desc)
    desc_clean = desc.replace("'", "''")
    fullText_clean = t['fullText'].replace("'", "''")[:50000]
    
    try:
        # 1. Create ResourceSummary
        rs_sql = f'''INSERT INTO "ResourceSummary" (id, "resourceId", summary, "modelUsed", "extractedAt")
                     VALUES (gen_random_uuid(), '{t['id']}, $${desc_clean}$$, $gpt-4o-mini-regen$, NOW())
                     ON CONFLICT ("resourceId") DO UPDATE SET summary = EXCLUDED.summary, "modelUsed" = EXCLUDED."modelUsed"'''
        m.neon_query(rs_sql)
        
        # 2. Update Resource.description + clear broken-pdf flag
        r_sql = f'''UPDATE "Resource" 
                    SET description = $${desc_clean}$$,
                        "descriptionSource" = 'gpt-4o-mini',
                        summary = $${desc_clean}$$,
                        "descriptionGeneratedAt" = NOW()
                    WHERE id = '{t['id']}' '''
        m.neon_query(r_sql)
        
        return (nid_s, 'ok', desc[:100])
    except Exception as e:
        return (nid_s, 'fail', str(e)[:100])

# Run 8 workers
ok = 0
fail = 0
skip = 0
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
    futures = {ex.submit(process, t): t for t in targets}
    for fut in concurrent.futures.as_completed(futures):
        nid_s, status, msg = fut.result()
        if status == 'ok':
            done[nid_s] = 'ok'
            ok += 1
        elif status == 'skip':
            done[nid_s] = 'ok'
            skip += 1
        else:
            done[nid_s] = f'fail:{msg}'
            fail += 1
        if (ok + fail + skip) % 10 == 0:
            print(f'[{ok+fail+skip}/{len(targets)}] OK:{ok} FAIL:{fail} SKIP:{skip}', flush=True)
            with open(PROGRESS, 'w') as f: json.dump(done, f)

with open(PROGRESS, 'w') as f: json.dump(done, f)
print(f'\nDone: {ok} OK, {fail} FAIL, {skip} SKIP')
