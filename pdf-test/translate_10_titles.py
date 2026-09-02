#!/usr/bin/env python3
"""Test: translate 10 college AR titles from FR to AR."""
import os, json, re, importlib.util
spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

# Subject FR→AR mapping
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

CLASS_AR = {
    '7eme': 'السابعة أساسي',
    '8eme': 'الثامنة أساسي',
    '9eme': 'التاسعة أساسي',
}

# Get 10 sample (mix of classes/subjects)
r = m.neon_query('''
SELECT r."numericId", r.title, c.slug as cls, s.slug as subj
FROM "Resource" r
LEFT JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Subject" s ON s.id = r."subjectId"
WHERE c.slug IN ('7eme', '8eme', '9eme')
  AND r.language = 'ar'
  AND r.title ~ '[A-Za-z]'  -- has French/English chars
ORDER BY RANDOM()
LIMIT 10
''')
samples = [{'nid': r[0], 'title': str(r[1]), 'cls': r[2], 'subj': r[3]} 
           for r in r.get('response', [{}])[0].get('data', {}).get('rows', [])]

def translate_title(t):
    """Translate FR title to AR."""
    title = t['title']
    cls = t['cls']
    subj = t['subj']
    
    # Extract year
    year_match = re.search(r'\((\d{4}-\d{4})\)', title)
    year = year_match.group(1) if year_match else None
    title_no_year = re.sub(r'\s*\(\d{4}-\d{4}\)', '', title).strip()
    
    # Extract teacher (Mr X / Mme X)
    teacher_match = re.search(r'(Mr|Mme)\s+([A-Z][A-Z\s]+?)$', title_no_year)
    teacher = None
    if teacher_match:
        prefix = 'الأستاذ' if teacher_match.group(1) == 'Mr' else 'الأستاذة'
        teacher = f'{prefix} {teacher_match.group(2).strip()}'
        title_no_year = title_no_year[:teacher_match.start()].strip()
    
    # Translate type prefix
    type_translated = None
    if 'Devoir de Synthèse' in title_no_year or 'Devoir de Synthese' in title_no_year:
        num_match = re.search(r'N°?\s*(\d+)', title_no_year)
        num = f' عدد {num_match.group(1)}' if num_match else ''
        type_translated = f'فرض تأليفي{num}'
        # Remove original
        title_no_year = re.sub(r'Devoir de Synth[eè]se\s*N°?\s*\d+\s*-?\s*', '', title_no_year)
    elif 'Devoir de Contrôle' in title_no_year or 'Devoir de Controle' in title_no_year:
        num_match = re.search(r'N°?\s*(\d+)', title_no_year)
        num = f' عدد {num_match.group(1)}' if num_match else ''
        type_translated = f'فرض مراقبة{num}'
        title_no_year = re.sub(r'Devoir de Contr[oô]le\s*N°?\s*\d+\s*-?\s*', '', title_no_year)
    elif "Série d'exercices" in title_no_year or "Serie d'exercices" in title_no_year:
        num_match = re.search(r'N°?\s*(\d+)', title_no_year)
        num = f' عدد {num_match.group(1)}' if num_match else ''
        type_translated = f'سلسلة تمارين{num}'
        title_no_year = re.sub(r'S[ée]rie d.exercices\s*N°?\s*\d*\s*-?\s*', '', title_no_year)
    elif title_no_year.startswith('Cours'):
        type_translated = 'درس'
        title_no_year = re.sub(r'^Cours\s*-?\s*', '', title_no_year)
    elif title_no_year.startswith('Résumé'):
        type_translated = 'ملخص'
        title_no_year = re.sub(r'^R[ée]sum[ée]\s*-?\s*', '', title_no_year)
    
    if not type_translated:
        type_translated = 'وثيقة'
    
    # Translate subject
    subj_ar = SUBJECT_AR.get(subj, subj)
    
    # Translate class
    cls_ar = CLASS_AR.get(cls, cls)
    
    # Build new title
    parts = [type_translated, subj_ar, cls_ar]
    new_title = ' - '.join(parts)
    
    if year:
        new_title += f' - ({year})'
    if teacher:
        new_title += f' {teacher}'
    
    return new_title

# Test
print('=' * 100)
print('TEST: 10 fichiers avant/après')
print('=' * 100)

for t in samples:
    new = translate_title(t)
    print(f'\nNID {t["nid"]} ({t["cls"]}/{t["subj"]}):')
    print(f'  AVANT: {t["title"]}')
    print(f'  APRÈS: {new}')

print('\n' + '=' * 100)
print('APPLIQUER LES 10 CHANGEMENTS ?')
