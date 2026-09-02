#!/usr/bin/env python3
"""Regen v3: handle resources with fullText 200-1000c that were skipped.
Lower threshold from 1000 to 200 to catch the remaining 22.
"""
import os, json, re, importlib.util
import concurrent.futures
from openai import OpenAI

spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

PROGRESS = '/workspace/edutunisie/pdf-test/regen_broken_v3_progress.json'
done = {}
if os.path.exists(PROGRESS):
    with open(PROGRESS) as f: done = json.load(f)

client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY', ''))

r = m.neon_query('''
SELECT r.id, r."numericId", rc."fullText", c.slug as cls, s.slug as subj, r.language, r.title, r."headerData"
FROM "Resource" r
LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
LEFT JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Subject" s ON s.id = r."subjectId"
WHERE r."descriptionSource" LIKE 'broken-pdf%'
  AND LENGTH(rc."fullText") > 200
ORDER BY r."numericId"
''')
targets = [{
    'id': row[0], 'nid': row[1], 'fullText': str(row[2]), 
    'cls': row[3], 'subj': row[4], 'lang': row[5], 
    'title': str(row[6]), 'headerData': row[7] or {}
} for row in r.get('response', [{}])[0].get('data', {}).get('rows', [])]
print(f'Total: {len(targets)}', flush=True)

COLLEGE_SLUGS = {'7eme', '8eme', '9eme'}

def gen_description(t):
    text = t['fullText'][:6000]
    is_ar = t['lang'] == 'ar' or any('\u0600' <= c <= '\u06FF' for c in text[:200])
    is_college = t['cls'] in COLLEGE_SLUGS
    
    if is_college and is_ar:
        # College AR structured
        prompt = f"""أنت خبير في تلخيص المحتوى التعليمي التونسي للمرحلة الإعدادية.
أعد صياغة الملخص بالصيغة المهيكلة التالية (مع تعبئة كل حقل):

<strong>المادة :</strong> [اسم المادة بالعربية]
<strong>المستوى :</strong> [السنة أساسي]
<strong>النوع :</strong> [فرض تأليفي/فرض مراقبة/سلسلة تمارين/درس/ملخص]
<strong>السنة الدراسية :</strong> [السنة الدراسية إن وجدت]
<strong>الأستاذ :</strong> [اسم الأستاذ أو "-" إذا غير متوفر]
<strong>ملخص :</strong> [فقرة وصفية من 2-4 جمل بناءً على المحتوى]
<strong>المفاهيم/المهارات المكتسبة :</strong> <ul><li>المفهوم 1</li><li>المفهوم 2</li><li>المفهوم 3</li></ul>

عنوان المستند: {t['title']}
المادة: {t['subj']}
المستوى: {t['cls']}

النص الأصلي:
{text}

الملخص المهيكل:"""
    elif is_college and not is_ar:
        prompt = f"""Tu es un expert en résumé pédagogique tunisien pour le collège.
Reformule ce résumé en format HTML structuré avec les champs:

<strong>Matière :</strong> [matière]
<strong>Niveau :</strong> [année - ex: 7ème année de base]
<strong>Type :</strong> [Devoir de contrôle/Synthèse/Série d'exercices/Cours]
<strong>Année scolaire :</strong> [année]
<strong>Enseignant :</strong> [nom ou "-"]
<strong>Résumé :</strong> [2-4 phrases]
<strong>Concepts/Compétences :</strong> <ul><li>concept 1</li><li>concept 2</li><li>concept 3</li></ul>

Titre: {t['title']}
Matière: {t['subj']}
Niveau: {t['cls']}

Texte:
{text}

Reformule:"""
    elif is_ar and not is_college:
        prompt = f"""لخّص هذا المستند التعليمي التونسي للمرحلة الثانوية في فقرتين:
- الفقرة 1: وصف المحتوى (2-3 جمل)
- الفقرة 2: الفائدة التربوية للطالب (1-2 جملة)

المادة: {t['subj']}
المستوى: {t['cls']}

النص:
{text}

الملخص:"""
    else:
        prompt = f"""Résume ce document éducatif tunisien pour le lycée en 2 paragraphes:
- Paragraphe 1: Description du contenu (2-3 phrases)
- Paragraphe 2: Utilité pédagogique (1-2 phrases)

Matière: {t['subj']}
Niveau: {t['cls']}

Texte:
{text}

Résumé:"""
    
    try:
        resp = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[{'role': 'user', 'content': prompt}],
            max_tokens=500 if is_college else 300,
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
    
    desc = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', desc)
    desc_sql = desc.replace("'", "''")
    
    is_college = t['cls'] in COLLEGE_SLUGS
    source_tag = 'gpt-4o-mini-college-structured' if is_college else 'gpt-4o-mini'
    
    try:
        # Upsert ResourceSummary
        rs_check = m.neon_query(f"SELECT id FROM \"ResourceSummary\" WHERE \"resourceId\" = '{t['id']}'")
        rs_exists = bool(rs_check.get('response', [{}])[0].get('data', {}).get('rows', []))
        
        if rs_exists:
            m.neon_query(f"""UPDATE "ResourceSummary" 
                             SET summary = '{desc_sql}',
                                 "modelUsed" = '{source_tag}',
                                 "extractedAt" = NOW()
                             WHERE "resourceId" = '{t['id']}' """)
        else:
            m.neon_query(f"""INSERT INTO "ResourceSummary" (id, "resourceId", summary, "modelUsed", "extractedAt")
                             VALUES (gen_random_uuid(), '{t['id']}', '{desc_sql}', '{source_tag}', NOW())""")
        
        # Update Resource
        m.neon_query(f"""UPDATE "Resource" 
                         SET description = '{desc_sql}',
                             "descriptionSource" = '{source_tag}',
                             summary = '{desc_sql}',
                             "descriptionGeneratedAt" = NOW()
                         WHERE id = '{t['id']}' """)
        
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
        if (ok + fail + skip) % 5 == 0:
            print(f'[{ok+fail+skip}/{total}] OK:{ok} FAIL:{fail} SKIP:{skip}', flush=True)
            with open(PROGRESS, 'w') as f: json.dump(done, f)

with open(PROGRESS, 'w') as f: json.dump(done, f)
print(f'\nDone: {ok} OK, {fail} FAIL, {skip} SKIP')
