#!/usr/bin/env python3
"""
Re-run Technologie AI extraction with AR-ONLY prompt.
Uses EXISTING text from ResourceContent.fullText (no PDF re-download).
"""
import os, json, time, re
from pathlib import Path
import openai
import sys

sys.path.insert(0, '/workspace/edutunisie/pdf-test')
from bulk_math_v5 import neon_query, sql_escape, sanitize_text

PROGRESS_FILE = '/tmp/techno-rerun-ar-progress.json'

PROMPT_AR = """Tu es un expert pédagogique tunisien. Analyse le texte extrait d'un PDF de TECHNOLOGIE pour collège tunisien (7ème/8ème/9ème).

**LANGUE OBLIGATOIRE : TOUS les champs texte doivent être en ARABE** (school_name, teachers, system_name, general_subject, summary). Le `title` peut être en arabe (préféré) ou français.

RÈGLES:
1. **is_pilote** : true si "Collège pilote"/"النموذجية"/"Pilote", false si "Ecole préparatoire"/"Collège" sans pilote, null si aucun nom d'école.
2. **file_type** : DEVOIR_SYNTHESE | DEVOIR_CONTROLE | DEVOIR_MAISON | COURS | EXERCICE | REVISION | EXAMEN | AUTRE (en français, c'est OK).
3. **teachers** : array de {name_ar: "الاسم بالعربية"}. **JAMAIS en français**. 1-2 profs max.
4. **number** : "عدد 1"/"N°1"/null.
5. **year** : "2018-2019"/null. NE PAS inventer.
6. **school_name_ar** : nom complet en arabe, ou null. **PAS de version française**.
7. **title** : titre canonique **EN ARABE de préférence**, PAS DE CROCHETS [].
8. **system_name** : nom du système/produit en ARABE (الفرن الكهربائي, القاطع, قاطعة أنابيب, لافتة إشهارية, ثاقبة أوراق, etc.). null si exercice théorique.
9. **general_subject** : 3-6 mots **EN ARABE**.
10. **summary** : exactement 3 lignes (\\n), 30-50 mots, **EN ARABE UNIQUEMENT**.
11. **language** : "ar".

Retourne UNIQUEMENT ce JSON:
{
  "school_name_ar": "...",
  "is_pilote": null,
  "teachers": [{"name_ar": "..."}],
  "file_type": "DEVOIR",
  "number": "عدد 1",
  "year": "2018-2019",
  "title": "...",
  "system_name": "...",
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
    Path(PROGRESS_FILE).write_text(json.dumps(prog, ensure_ascii=False))


def gpt_extract(text, client, max_retries=3):
    for attempt in range(max_retries):
        try:
            text_trim = text[:3500]
            resp = client.chat.completions.create(
                model='gpt-4o-mini',
                messages=[
                    {'role': 'system', 'content': 'Tu réponds uniquement en JSON valide. Tous les champs texte en ARABE.'},
                    {'role': 'user', 'content': PROMPT_AR + text_trim}
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


def write_metadata_ar(resource_id, attrs):
    teachers = attrs.get('teachers', [])
    teacher_names = [t.get('name_ar') or t.get('name_fr') or '' for t in teachers]
    teachers_array = ','.join(sql_escape(n) for n in teacher_names if n) or "''"
    
    school_ar = attrs.get('school_name_ar') or None
    general_subject = attrs.get('general_subject') or None
    system_name = attrs.get('system_name') or None
    year = attrs.get('year') or None
    file_type = attrs.get('file_type') or None
    
    sql = f'''
UPDATE "ResourceMetadata" SET
  "profNames" = ARRAY[{teachers_array}]::text[],
  "schoolName" = {sql_escape(school_ar) if school_ar else 'NULL'},
  "year" = {sql_escape(year) if year else 'NULL'},
  "type" = {sql_escape(file_type) if file_type else 'NULL'},
  "generalSubject" = {sql_escape(general_subject) if general_subject else 'NULL'},
  "systemName" = {sql_escape(system_name) if system_name else 'NULL'},
  "extractedAt" = NOW(),
  "modelUsed" = {sql_escape('gpt-4o-mini-ar-v2')}
WHERE "resourceId" = '{resource_id}'
'''
    r = neon_query(sql)
    if r.get('response') and r['response'][0].get('error'):
        raise Exception(f"SQL error: {r['response'][0]['error'][:300]}")
    return True


def write_summary_ar(resource_id, summary):
    if not summary:
        return False
    sql = f'''
UPDATE "ResourceSummary" SET
  "summary" = {sql_escape(summary)},
  "extractedAt" = NOW(),
  "modelUsed" = {sql_escape('gpt-4o-mini-ar-v2')}
WHERE "resourceId" = '{resource_id}'
'''
    r = neon_query(sql)
    if r.get('response') and r['response'][0].get('error'):
        raise Exception(f"SQL error: {r['response'][0]['error'][:300]}")
    return True


def main():
    print('=== Pulling 451 Technologie texts from DB ===', flush=True)
    r = neon_query('''
SELECT r."numericId", r.id as resource_id, LENGTH(rc."fullText") as text_len
FROM "Resource" r
JOIN "Subject" s ON s.id = r."subjectId"
JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
WHERE r.status = 'PUBLISHED'
  AND s.slug = 'technologie'
  AND c.slug IN ('7eme', '8eme', '9eme')
  AND rc."fullText" IS NOT NULL
ORDER BY r."numericId"
''')
    items = [{'nid': int(row[0]), 'resource_id': row[1], 'text_len': int(row[2])} for row in r['response'][0]['data']['rows']]
    print(f'Got {len(items)} items with text', flush=True)
    
    prog = load_progress()
    client = openai.OpenAI(api_key=os.environ['OPENAI_API_KEY'])
    
    print(f'Already done: {len(prog["done"])}, failed: {len(prog["failed"])}', flush=True)
    
    total = len(items)
    ok = 0
    fail = 0
    
    for i, item in enumerate(items):
        nid = item['nid']
        resource_id = item['resource_id']
        if nid in prog['done']:
            ok += 1
            continue
        if nid in prog['failed']:
            prog['failed'].remove(nid)
        
        # 1. Get text from DB
        r2 = neon_query(f'SELECT "fullText" FROM "ResourceContent" WHERE "resourceId" = \'{resource_id}\'')
        rows = r2['response'][0].get('data', {}).get('rows', [])
        if not rows or not rows[0][0]:
            print(f'[{i+1}/{total}] #{nid} ✗ no text', flush=True)
            prog['failed'].append(nid)
            fail += 1
            continue
        text = rows[0][0]
        if len(text.strip()) < 50:
            print(f'[{i+1}/{total}] #{nid} ✗ text too short ({len(text)}c)', flush=True)
            prog['failed'].append(nid)
            fail += 1
            continue
        
        # 2. GPT with AR-only prompt
        try:
            attrs = gpt_extract(text, client)
        except Exception as e:
            print(f'[{i+1}/{total}] #{nid} ✗ GPT: {str(e)[:80]}', flush=True)
            prog['failed'].append(nid)
            fail += 1
            continue
        
        # 3. Write to DB
        try:
            write_metadata_ar(resource_id, attrs)
            write_summary_ar(resource_id, attrs.get('summary', ''))
            prog['done'].append(nid)
            ok += 1
            gs = attrs.get('general_subject', '—')[:25]
            sys_ = attrs.get('system_name', '—')[:18] if attrs.get('system_name') else '—'
            print(f'[{i+1}/{total}] #{nid} ✓ sys={sys_} | gs={gs}', flush=True)
        except Exception as e:
            print(f'[{i+1}/{total}] #{nid} ✗ DB: {str(e)[:200]}', flush=True)
            prog['failed'].append(nid)
            fail += 1
        
        if (i+1) % 30 == 0:
            save_progress(prog)
            elapsed = time.time() - prog['started']
            rate = (i+1) / elapsed * 60 if elapsed > 0 else 0
            remaining = total - (i+1)
            eta = remaining / rate if rate > 0 else 0
            print(f'\n--- Progress: {i+1}/{total}, {ok} ok, {fail} fail, {rate:.1f}/min, ETA {eta:.0f}min ---\n', flush=True)
    
    save_progress(prog)
    print(f'\n=== Final: {ok} ok, {fail} fail, {len(prog["done"])} processed ===', flush=True)


if __name__ == '__main__':
    main()
