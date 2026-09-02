#!/usr/bin/env python3
"""Generate generalSubject (max 6 words) for all college resources.
Uses GPT-4o-mini to extract the main topic from fullText.
Stored in ResourceMetadata.generalSubject.
"""
import os, json, re, importlib.util, time
from openai import OpenAI
import concurrent.futures

spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY', ''))

PROGRESS = '/workspace/edutunisie/pdf-test/gen_subject_progress.json'
done = {}
if os.path.exists(PROGRESS):
    with open(PROGRESS) as f: done = json.load(f)

# Get all college resources
print('Loading...', flush=True)
r = m.neon_query('''
SELECT r.id, r."numericId", r.language, c.slug as cls, s.slug as subj,
       LEFT(rc."fullText", 3000) as text_preview
FROM "Resource" r
JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Subject" s ON s.id = r."subjectId"
LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
WHERE c.slug IN ('7eme', '8eme', '9eme')
  AND LENGTH(rc."fullText") > 200
ORDER BY r."numericId"
''')
targets = []
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    nid = str(row[1])
    if done.get(nid) and done[nid].startswith('ok:'):
        continue
    targets.append({
        'id': row[0], 'nid': row[1], 'language': str(row[2]),
        'cls': str(row[3]), 'subj': str(row[4]), 'text': str(row[5] or '')
    })

print(f'Total: {len(targets)}', flush=True)

# Mapping
SUBJECT_FR = {
    'mathematiques': 'Mathématiques', 'physique': 'Physique', 'svt': 'Sciences de la Vie et de la Terre',
    'arabe': 'Arabe', 'francais': 'Français', 'anglais': 'Anglais',
    'histoire': 'Histoire', 'geographie': 'Géographie', 'philosophie': 'Philosophie',
    'informatique': 'Informatique', 'technologie': 'Technologie', 'musique': 'Musique',
    'theatre': 'Théâtre', 'arts': 'Arts plastiques', 'education-islamique': 'Éducation Islamique',
    'education-civique': 'Éducation Civique', 'sport': 'Sport',
    'histoire-geographie': 'Histoire-Géographie',
}
SUBJECT_AR = {
    'mathematiques': 'الرياضيات', 'physique': 'الفيزياء', 'svt': 'علوم الحياة والأرض',
    'arabe': 'العربية', 'francais': 'الفرنسية', 'anglais': 'الإنجليزية',
    'histoire': 'التاريخ', 'geographie': 'الجغرافيا', 'philosophie': 'الفلسفة',
    'informatique': 'الإعلامية', 'technologie': 'التكنولوجيا', 'musique': 'الموسيقى',
    'theatre': 'المسرح', 'arts': 'الفنون', 'education-islamique': 'التربية الإسلامية',
    'education-civique': 'التربية المدنية', 'sport': 'الرياضة',
    'histoire-geographie': 'التاريخ والجغرافيا',
}
CLASS_FR = {'7eme': '7ème année de base', '8eme': '8ème année de base', '9eme': '9ème année de base'}
CLASS_AR = {'7eme': 'السابعة أساسي', '8eme': 'الثامنة أساسي', '9eme': 'التاسعة أساسي'}

def gen_subject(t):
    text = t['text']
    is_ar = t['language'] == 'ar' or any('\u0600' <= c <= '\u06FF' for c in text[:200])
    
    if is_ar:
        prompt = f"""أنت خبير في تلخيص المحتوى التعليمي التونسي للمرحلة الإعدادية.
من النص التالي، استخرج "الموضوع العام" للمستند.
**قواعد**: MIN 3 كلمات، MAX 6 كلمات بالعربية. سمّ مفهوماً محدداً.
**أمثلة جيدة**: "الدوال اللوغاريتمية النيبيرية", "الصفائح التكتونية والزلازل", "الثورة الفرنسية 1789", "الضوء والعدسات"
**تجنب**: "الرياضيات", "تمارين رياضيات", "فرض في الفيزياء"
**المادة**: {SUBJECT_AR.get(t['subj'], t['subj'])}
**المستوى**: {CLASS_AR.get(t['cls'], t['cls'])}
**النص** (أول 2500 حرف):
{text[:2500]}
**الموضوع العام** (3-6 كلمات فقط):"""
    else:
        prompt = f"""Tu es un expert en synthèse pédagogique tunisienne pour le collège.
**Règles**: MIN 3 mots, MAX 6 mots en français. Nommer un concept spécifique.
**Bons**: "Les fonctions logarithmes népériens", "La tectonique des plaques et séismes", "La révolution française de 1789", "La lumière et les lentilles"
**À éviter**: "Mathématiques", "Exercices de maths", "Devoir de physique"
**Matière**: {SUBJECT_FR.get(t['subj'], t['subj'])}
**Niveau**: {CLASS_FR.get(t['cls'], t['cls'])}
**Texte** (2500 premiers caractères):
{text[:2500]}
**Sujet général** (3-6 mots uniquement):"""
    
    for attempt in range(3):
        try:
            resp = client.chat.completions.create(
                model='gpt-4o-mini',
                messages=[{'role': 'user', 'content': prompt}],
                max_tokens=60,
                temperature=0.2,
            )
            return resp.choices[0].message.content.strip()
        except Exception as e:
            if '429' in str(e) and attempt < 2:
                import time as _t
                _t.sleep(15 * (attempt + 1))
                continue
            return f'ERROR: {e}'
    return 'ERROR: max retries'


def save_subject(t, subject):
    """Save to ResourceMetadata.generalSubject.
    Create or update."""
    nid = t['nid']
    rid = t['id']
    
    # Sanitize
    subject_clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', subject)
    subject_clean = subject_clean.replace("'", "''")
    if subject_clean.startswith('ERROR'):
        return False, subject_clean
    
    # Check if ResourceMetadata exists
    r = m.neon_query(f"SELECT id FROM \"ResourceMetadata\" WHERE \"resourceId\" = '{rid}'")
    exists = bool(r.get('response', [{}])[0].get('data', {}).get('rows', []))
    
    if exists:
        m.neon_query(f"""UPDATE "ResourceMetadata" SET "generalSubject" = '{subject_clean}' 
                         WHERE "resourceId" = '{rid}'""")
    else:
        m.neon_query(f"""INSERT INTO "ResourceMetadata" (id, "resourceId", "generalSubject", "extractedAt")
                         VALUES (gen_random_uuid(), '{rid}', '{subject_clean}', NOW())""")
    
    return True, subject_clean

def process(t):
    nid_s = str(t['nid'])
    if done.get(nid_s) and done[nid_s].startswith('ok:'):
        return (nid_s, 'skip', '')
    
    subject = gen_subject(t)
    if subject.startswith('ERROR'):
        done[nid_s] = f'fail:{subject[:30]}'
        return (nid_s, 'fail', subject)
    
    ok, msg = save_subject(t, subject)
    if ok:
        done[nid_s] = f'ok:{subject[:50]}'
        return (nid_s, 'ok', subject)
    else:
        done[nid_s] = f'fail:{msg[:30]}'
        return (nid_s, 'fail', msg)

# 8 workers parallel
ok = 0
fail = 0
skip = 0
start = time.time()
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
    futures = {ex.submit(process, t): t for t in targets}
    for i, fut in enumerate(concurrent.futures.as_completed(futures)):
        nid_s, status, msg = fut.result()
        if status == 'ok': ok += 1
        elif status == 'skip': skip += 1
        else: fail += 1
        if (i+1) % 25 == 0:
            elapsed = time.time() - start
            rate = (i+1) / elapsed if elapsed > 0 else 0
            print(f'[{i+1}/{len(targets)}] OK:{ok} FAIL:{fail} SKIP:{skip} ({rate:.0f}/s)', flush=True)
            with open(PROGRESS, 'w') as f: json.dump(done, f)

with open(PROGRESS, 'w') as f: json.dump(done, f)
print(f'\nDone: {ok} OK, {fail} FAIL, {skip} SKIP in {time.time()-start:.0f}s')
