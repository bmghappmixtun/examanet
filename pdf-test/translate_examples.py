#!/usr/bin/env python3
"""Show 1 example per (subject × class) for the AR title model."""
import os, json, re, importlib.util
spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

# Full lexicon
SUBJECT_AR = {
    'mathematiques': 'الرياضيات',
    'physique': 'الفيزياء',
    'svt': 'علوم الحياة والأرض',
    'arabe': 'العربية',
    'francais': 'الفرنسية',
    'anglais': 'الإنجليزية',
    'histoire': 'التاريخ',
    'geographie': 'الجغرافيا',
    'philosophie': 'الفلسفة',
    'informatique': 'الإعلامية',
    'technologie': 'التكنولوجيا',
    'musique': 'الموسيقى',
    'theatre': 'المسرح',
    'arts': 'الفنون',
    'education-islamique': 'التربية الإسلامية',
    'education-civique': 'التربية المدنية',
    'sport': 'الرياضة',
}
CLASS_AR = {'7eme': 'السابعة أساسي', '8eme': 'الثامنة أساسي', '9eme': 'التاسعة أساسي'}

# Translation lookup
EXTRA_TRANSLATIONS = [
    (r'Collège pilote', 'المدرسة الإعدادية النموذجية'),
    (r'College pilote', 'المدرسة الإعدادية النموذجية'),
    (r'collège pilote', 'المدرسة الإعدادية النموذجية'),
]

# Cache teacher names
teacher_cache = {}

def get_teacher_name_ar(teacher_id):
    if not teacher_id or teacher_id in teacher_cache:
        return teacher_cache.get(teacher_id)
    r = m.neon_query(f'''SELECT "firstNameAr", "lastNameAr" FROM "User" WHERE id = '{teacher_id}' ''')
    rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
    if not rows:
        teacher_cache[teacher_id] = None
        return None
    fn, ln = rows[0][0], rows[0][1]
    full = f'{fn or ""} {ln or ""}'.strip()
    has_ar = bool(re.search(r'[\u0600-\u06FF]', full))
    result = full if has_ar else None
    teacher_cache[teacher_id] = result
    return result

def translate_title(t):
    title = t['title']
    cls = t['cls']
    subj = t['subj']
    teacher_id = t.get('teacherId')
    
    year_match = re.search(r'\((\d{4}-\d{4})\)', title)
    year = year_match.group(1) if year_match else None
    title = re.sub(r'\s*\(\d{4}-\d{4}\)', '', title).strip()
    
    # Remove existing teacher (FR or AR) at end
    title = re.sub(r'\b(?:Mr|Mme)\s+[A-Za-zà-ÿÀ-Ÿ\s\-]+(?=\s*$)', '', title).strip()
    title = re.sub(r'الأستاذ[ة]?\s+[\u0600-\u06FF\s\-]+(?=\s*$)', '', title).strip()
    title = title.rstrip(' -').strip()
    
    # Apply extra translations (Collège pilote etc.)
    for pat, rep in EXTRA_TRANSLATIONS:
        title = re.sub(pat, rep, title, flags=re.IGNORECASE)
    
    # Type prefix
    if 'Devoir Corrigé de Synthèse' in title or 'Devoir Corrigé de Synthese' in title:
        num = re.search(r'N°?\s*(\d+)', title)
        n = f' عدد {num.group(1)}' if num else ''
        type_translated = f'فرض تأليفي مصحح{n}'
    elif 'Devoir Corrigé de Contrôle' in title or 'Devoir Corrigé de Controle' in title:
        num = re.search(r'N°?\s*(\d+)', title)
        n = f' عدد {num.group(1)}' if num else ''
        type_translated = f'فرض مراقبة مصحح{n}'
    elif 'Devoir de Synthèse' in title or 'Devoir de Synthese' in title:
        num = re.search(r'N°?\s*(\d+)', title)
        n = f' عدد {num.group(1)}' if num else ''
        type_translated = f'فرض تأليفي{n}'
    elif 'Devoir de Contrôle' in title or 'Devoir de Controle' in title:
        num = re.search(r'N°?\s*(\d+)', title)
        n = f' عدد {num.group(1)}' if num else ''
        type_translated = f'فرض مراقبة{n}'
    elif "Série d'exercices" in title or "Serie d'exercices" in title or "Série d''exercices" in title:
        num = re.search(r'N°?\s*(\d+)', title)
        n = f' عدد {num.group(1)}' if num else ''
        type_translated = f'سلسلة تمارين{n}'
    elif 'Devoir de maison' in title or 'Devoir Maison' in title:
        num = re.search(r'N°?\s*(\d+)', title)
        n = f' عدد {num.group(1)}' if num else ''
        type_translated = f'واجب منزلي{n}'
    elif title.startswith('Cours'):
        type_translated = 'درس'
    elif title.startswith('Résumé') or title.startswith('Resume'):
        type_translated = 'ملخص'
    else:
        type_translated = 'وثيقة'
    
    subj_ar = SUBJECT_AR.get(subj, subj)
    cls_ar = CLASS_AR.get(cls, cls)
    teacher = get_teacher_name_ar(teacher_id)
    
    parts = [type_translated, subj_ar, cls_ar]
    new_title = ' - '.join(parts)
    
    if year:
        new_title += f' - ({year})'
    if teacher:
        new_title += f' - {teacher}'
    
    return new_title

# Get one example per (subject × class) for AR subjects
# AR subjects in collège: arabe, education-islamique, education-civique, svt, math, physique, etc.
# But language=ar means content is in Arabic

# Get 1 sample per (cls, subj) where language=ar
r = m.neon_query('''
SELECT DISTINCT ON (c.slug, s.slug)
  r."numericId", r.title, c.slug as cls, s.slug as subj, r."teacherId",
  u."firstNameAr", u."lastNameAr"
FROM "Resource" r
LEFT JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Subject" s ON s.id = r."subjectId"
LEFT JOIN "User" u ON u.id = r."teacherId"
WHERE c.slug IN ('7eme', '8eme', '9eme')
  AND r.language = 'ar'
  AND r.title ~ '[A-Za-z]'
ORDER BY c.slug, s.slug, RANDOM()
''')
samples = []
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    samples.append({
        'nid': row[0], 'title': str(row[1]), 'cls': row[2], 'subj': row[3], 
        'teacherId': row[4]
    })

print('=' * 100)
print('EXEMPLES: 1 par (classe × matière) - modèle titre arabe')
print('=' * 100)

# Group by (cls, subj)
from collections import defaultdict
grouped = defaultdict(list)
for s in samples:
    grouped[(s['cls'], s['subj'])].append(s)

for (cls, subj), items in sorted(grouped.items()):
    t = items[0]
    new = translate_title(t)
    subj_ar = SUBJECT_AR.get(subj, subj)
    cls_ar = CLASS_AR.get(cls, cls)
    print(f'\n--- {cls_ar} × {subj_ar} ({subj}) ---')
    print(f'NID {t["nid"]}:')
    print(f'  AVANT: {t["title"]}')
    print(f'  APRÈS: {new}')

# Also show specific examples requested
print('\n\n' + '=' * 100)
print('CAS SPÉCIAUX:')
print('=' * 100)

# Find Collège pilote
for s in samples:
    if 'Collège pilote' in s['title'] or 'College pilote' in s['title']:
        new = translate_title(s)
        print(f'\nCollège pilote → المدرسة الإعدادية النموذجية')
        print(f'  NID {s["nid"]}: {s["title"]}')
        print(f'  APRÈS: {new}')
        break

# Find Devoir de maison
r = m.neon_query('''
SELECT r."numericId", r.title, c.slug as cls, s.slug as subj, r."teacherId"
FROM "Resource" r
LEFT JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Subject" s ON s.id = r."subjectId"
WHERE r.title ~* 'devoir.{0,3}maison|dm\b|devoirmaison' 
  AND c.slug IN ('7eme', '8eme', '9eme')
LIMIT 3
''')
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    t = {'nid': row[0], 'title': str(row[1]), 'cls': row[2], 'subj': row[3], 'teacherId': row[4]}
    new = translate_title(t)
    print(f'\nDevoir de maison → واجب منزلي')
    print(f'  NID {t["nid"]}: {t["title"]}')
    print(f'  APRÈS: {new}')
