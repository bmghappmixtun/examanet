#!/usr/bin/env python3
"""Batch translate college AR titles to Arabic."""
import os, json, re, importlib.util, time

spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

# Load teacher cache
with open('pdf-test/teacher_cache.json', 'r', encoding='utf-8') as f:
    teacher_cache = json.load(f)

PROGRESS = '/workspace/edutunisie/pdf-test/translate_batch_progress.json'
done = {}
if os.path.exists(PROGRESS):
    with open(PROGRESS) as f: done = json.load(f)

# ===== LEXIQUE =====
SUBJECT_AR = {
    'mathematiques': 'الرياضيات', 'physique': 'الفيزياء', 'svt': 'علوم الحياة والأرض',
    'arabe': 'العربية', 'francais': 'الفرنسية', 'anglais': 'الإنجليزية',
    'histoire': 'التاريخ', 'geographie': 'الجغرافيا', 'philosophie': 'الفلسفة',
    'informatique': 'الإعلامية', 'technologie': 'التكنولوجيا', 'musique': 'الموسيقى',
    'theatre': 'المسرح', 'arts': 'الفنون', 'education-islamique': 'التربية الإسلامية',
    'education-civique': 'التربية المدنية', 'sport': 'الرياضة',
    'histoire-geographie': 'التاريخ والجغرافيا',
}
CLASS_AR = {'7eme': 'السابعة أساسي', '8eme': 'الثامنة أساسي', '9eme': 'التاسعة أساسي'}

def translate_full(title, cls, subj, teacher_id=None):
    year_match = re.search(r'\((\d{4}-\d{4})\)', title)
    year = year_match.group(1) if year_match else None
    title = re.sub(r'\s*\(\d{4}-\d{4}\)', '', title).strip()
    title = re.sub(r'\b(?:Mr|Mme)\s+[A-Za-zà-ÿÀ-Ÿ\s\-]+(?=\s*$)', '', title).strip()
    
    school_indicator = None
    if re.search(r'Coll[eè]ge pilote', title, re.IGNORECASE):
        school_indicator = 'المدرسة الإعدادية النموذجية'
        title = re.sub(r'Coll[eè]ge pilote', '', title, flags=re.IGNORECASE).strip()
    
    correction_indicator = None
    if re.search(r'\bAvec\s+correction\b', title, re.IGNORECASE) or re.search(r'\(Corrigé\)', title, re.IGNORECASE):
        correction_indicator = 'مع الاصلاح'
        title = re.sub(r'\bAvec\s+correction\b', '', title, flags=re.IGNORECASE).strip()
        title = re.sub(r'\(Corrigé\)', '', title).strip()
    
    title = title.rstrip(' -').strip()
    
    if re.search(r'Devoir\s+Corrigé\s+de\s+Synth[eè]se', title, re.IGNORECASE):
        num = re.search(r'N°?\s*(\d+)', title)
        n = f' عدد {num.group(1)}' if num else ''
        type_t = f'فرض تأليفي مع الاصلاح{n}'
    elif re.search(r'Devoir\s+Corrigé\s+de\s+Contr[oô]le', title, re.IGNORECASE):
        num = re.search(r'N°?\s*(\d+)', title)
        n = f' عدد {num.group(1)}' if num else ''
        type_t = f'فرض مراقبة مع الاصلاح{n}'
    elif re.search(r'Devoir\s+de\s+Synth[eè]se', title, re.IGNORECASE):
        num = re.search(r'N°?\s*(\d+)', title)
        n = f' عدد {num.group(1)}' if num else ''
        type_t = f'فرض تأليفي{n}'
    elif re.search(r'Devoir\s+de\s+Contr[oô]le', title, re.IGNORECASE):
        num = re.search(r'N°?\s*(\d+)', title)
        n = f' عدد {num.group(1)}' if num else ''
        type_t = f'فرض مراقبة{n}'
    elif re.search(r'Devoir\s+de\s+R[ée]vision', title, re.IGNORECASE):
        num = re.search(r'N°?\s*(\d+)', title)
        n = f' عدد {num.group(1)}' if num else ''
        type_t = f'فرض مراجعة{n}'
    elif "Série d'exercices" in title or "Série d''exercices" in title:
        num = re.search(r'N°?\s*(\d+)', title)
        n = f' عدد {num.group(1)}' if num else ''
        type_t = f'سلسلة تمارين{n}'
    elif re.search(r'Devoir[s]?\s+de\s+maison', title, re.IGNORECASE):
        num = re.search(r'N°?\s*(\d+)', title)
        n = f' عدد {num.group(1)}' if num else ''
        type_t = f'واجب منزلي{n}'
    elif title.startswith('Cours'):
        type_t = 'درس'
    elif title.startswith('Résumé') or title.startswith('Resume'):
        type_t = 'ملخص'
    else:
        type_t = 'وثيقة'
    
    parts = [type_t, SUBJECT_AR.get(subj, subj), CLASS_AR.get(cls, cls)]
    new = ' - '.join(parts)
    if year: new += f' - ({year})'
    if school_indicator: new += f' - {school_indicator}'
    if correction_indicator: new += f' - {correction_indicator}'
    
    # Teacher (only if Arabic available)
    teacher = teacher_cache.get(teacher_id) if teacher_id else None
    if teacher:
        new += f' - {teacher}'
    
    return new

# Get all targets
r = m.neon_query('''
SELECT r.id, r."numericId", r.title, c.slug as cls, s.slug as subj, r."teacherId"
FROM "Resource" r
LEFT JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Subject" s ON s.id = r."subjectId"
WHERE c.slug IN ('7eme', '8eme', '9eme')
  AND r.language = 'ar'
  AND r.title ~ '[A-Za-z]'
ORDER BY r."numericId"
''')
targets = [{'id': r[0], 'nid': r[1], 'title': str(r[2]), 'cls': r[3], 'subj': r[4], 'teacherId': r[5]} 
           for r in r.get('response', [{}])[0].get('data', {}).get('rows', [])]
print(f'Total: {len(targets)}', flush=True)

# Apply
ok = 0
fail = 0
skip = 0
start = time.time()
for i, t in enumerate(targets):
    nid_s = str(t['nid'])
    if done.get(nid_s) == 'ok':
        skip += 1
        continue
    try:
        new = translate_full(t['title'], t['cls'], t['subj'], t.get('teacherId'))
        # Sanitize
        new_clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', new).replace("'", "''")
        sql = f"UPDATE \"Resource\" SET title = '{new_clean}' WHERE id = '{t['id']}'"
        m.neon_query(sql)
        done[nid_s] = 'ok'
        ok += 1
    except Exception as e:
        done[nid_s] = f'fail:{str(e)[:50]}'
        fail += 1
    
    if (i+1) % 100 == 0:
        elapsed = time.time() - start
        rate = (i+1) / elapsed if elapsed > 0 else 0
        print(f'[{i+1}/{len(targets)}] OK:{ok} FAIL:{fail} SKIP:{skip} ({rate:.0f}/s, ETA:{(len(targets)-i-1)/rate if rate else 0:.0f}s)', flush=True)
        with open(PROGRESS, 'w') as f: json.dump(done, f)

with open(PROGRESS, 'w') as f: json.dump(done, f)
print(f'\nDone: {ok} OK, {fail} FAIL, {skip} SKIP in {time.time()-start:.0f}s')
