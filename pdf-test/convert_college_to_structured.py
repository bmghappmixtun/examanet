#!/usr/bin/env python3
"""Convert ~120 collège (7/8/9ème) resources from plain to structured HTML format.
College slugs: 7eme, 8eme, 9eme
Structured format (AR or FR based on language).
"""
import os, json, re, importlib.util
import concurrent.futures
from openai import OpenAI

spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

PROGRESS = '/workspace/edutunisie/pdf-test/convert_college_progress.json'
done = {}
if os.path.exists(PROGRESS):
    with open(PROGRESS) as f: done = json.load(f)

client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY', ''))

# Get college resources with plain format
r = m.neon_query('''
SELECT r.id, r."numericId", rc."fullText", c.slug as cls, s.slug as subj, r.language, r.title
FROM "Resource" r
LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
LEFT JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Subject" s ON s.id = r."subjectId"
WHERE c.slug IN ('7eme', '8eme', '9eme')
  AND r.description IS NOT NULL
  AND r.description NOT LIKE '<strong>%'
  AND r.description NOT LIKE '%<br>%'
  AND LENGTH(rc."fullText") > 200
ORDER BY r."numericId"
''')
targets = [{
    'id': row[0], 'nid': row[1], 'fullText': str(row[2]), 
    'cls': row[3], 'subj': row[4], 'lang': row[5], 'title': str(row[6])
} for row in r.get('response', [{}])[0].get('data', {}).get('rows', [])]
print(f'Total: {len(targets)}', flush=True)

def gen_structured(t):
    text = t['fullText'][:6000]
    is_ar = t['lang'] == 'ar' or any('\u0600' <= c <= '\u06FF' for c in text[:200])
    
    if is_ar:
        prompt = f"""أنت خبير في تلخيص المحتوى التعليمي التونسي للمرحلة الإعدادية.
أعد صياغة الملخص التالي بالصيغة المهيكلة التالية (مع تعبئة كل حقل بناءً على المحتوى):

<strong>المادة :</strong> [اسم المادة بالعربية]
<strong>المستوى :</strong> [السنة أساسي]
<strong>النوع :</strong> [فرض تأليفي/فرض مراقبة/سلسلة تمارين/درس/ملخص]
<strong>السنة الدراسية :</strong> [السنة الدراسية إن وجدت]
<strong>الأستاذ :</strong> [اسم الأستاذ أو "-" إذا غير متوفر]
<strong>ملخص :</strong> [فقرة وصفية من 2-4 جمل]
<strong>المفاهيم/المهارات المكتسبة :</strong> <ul><li>المفهوم 1</li><li>المفهوم 2</li><li>المفهوم 3</li><li>المفهوم 4</li></ul>

المستوى: {t['cls']}
المادة: {t['subj']}

النص الأصلي:
{text}

أعد الصياغة بالصيغة المهيكلة:"""
    else:
        prompt = f"""Tu es un expert en résumé pédagogique tunisien pour le collège.
Reformule ce résumé en format HTML structuré avec les champs suivants:

<strong>Matière :</strong> [matière en français]
<strong>Niveau :</strong> [année - ex: 7ème année de base]
<strong>Type :</strong> [Devoir de contrôle/Synthèse/Série d'exercices/Cours]
<strong>Année scolaire :</strong> [année si disponible]
<strong>Enseignant :</strong> [nom ou "-"]
<strong>Résumé :</strong> [paragraphe de 2-4 phrases]
<strong>Concepts/Compétences :</strong> <ul><li>concept 1</li><li>concept 2</li><li>concept 3</li><li>concept 4</li></ul>

Niveau: {t['cls']}
Matière: {t['subj']}

Texte original:
{text}

Reformule en format structuré:"""
    
    try:
        resp = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[{'role': 'user', 'content': prompt}],
            max_tokens=500,
            temperature=0.3,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        return f'ERROR: {e}'

def process(t):
    nid_s = str(t['nid'])
    if done.get(nid_s) == 'ok':
        return (nid_s, 'skip', '')
    
    desc = gen_structured(t)
    if desc.startswith('ERROR'):
        return (nid_s, 'fail', desc)
    
    # Clean control chars
    desc = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', desc)
    desc_sql = desc.replace("'", "''")
    
    try:
        # Update description
        r_sql = f"""UPDATE "Resource" 
                    SET description = '{desc_sql}',
                        "descriptionSource" = 'gpt-4o-mini-college-structured'
                    WHERE id = '{t['id']}' """
        m.neon_query(r_sql)
        
        # Update ResourceSummary if exists
        rs_sql = f"""UPDATE "ResourceSummary" 
                     SET summary = '{desc_sql}',
                         "modelUsed" = 'gpt-4o-mini-college-structured',
                         "extractedAt" = NOW()
                     WHERE "resourceId" = '{t['id']}' """
        m.neon_query(rs_sql)
        
        return (nid_s, 'ok', desc[:100])
    except Exception as e:
        return (nid_s, 'fail', str(e)[:100])

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
