#!/usr/bin/env python3
"""V2: Preserve 'Collège pilote' → 'المدرسة الإعدادية النموذجية' in the title."""
import importlib.util, re
spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

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

def translate_full(title, cls, subj):
    year_match = re.search(r'\((\d{4}-\d{4})\)', title)
    year = year_match.group(1) if year_match else None
    title = re.sub(r'\s*\(\d{4}-\d{4}\)', '', title).strip()
    title = re.sub(r'\b(?:Mr|Mme)\s+[A-Za-zà-ÿÀ-Ÿ\s\-]+(?=\s*$)', '', title).strip()
    
    # Detect Collège pilote (or Collège pilote) and convert to school name (preserved)
    school_indicator = None
    if re.search(r'Coll[eè]ge pilote', title, re.IGNORECASE):
        school_indicator = 'المدرسة الإعدادية النموذجية'
        title = re.sub(r'Coll[eè]ge pilote', '', title, flags=re.IGNORECASE).strip()
    
    title = title.rstrip(' -').strip()
    
    if 'Devoir Corrigé de Synthèse' in title or 'Devoir Corrigé de Synthese' in title:
        num = re.search(r'N°?\s*(\d+)', title)
        n = f' عدد {num.group(1)}' if num else ''
        type_t = f'فرض تأليفي مصحح{n}'
    elif 'Devoir Corrigé de Contrôle' in title or 'Devoir Corrigé de Controle' in title:
        num = re.search(r'N°?\s*(\d+)', title)
        n = f' عدد {num.group(1)}' if num else ''
        type_t = f'فرض مراقبة مصحح{n}'
    elif 'Devoir de Synthèse' in title or 'Devoir de Synthese' in title:
        num = re.search(r'N°?\s*(\d+)', title)
        n = f' عدد {num.group(1)}' if num else ''
        type_t = f'فرض تأليفي{n}'
    elif 'Devoir de Contrôle' in title or 'Devoir de Controle' in title:
        num = re.search(r'N°?\s*(\d+)', title)
        n = f' عدد {num.group(1)}' if num else ''
        type_t = f'فرض مراقبة{n}'
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
    return new

# Test special cases
print('=' * 100)
print('CAS SPÉCIAUX V2')
print('=' * 100)

# Collège pilote
r = m.neon_query('''
SELECT r."numericId", r.title, c.slug as cls, s.slug as subj
FROM "Resource" r
LEFT JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Subject" s ON s.id = r."subjectId"
WHERE r.title ~* 'Collège pilote|College pilote'
  AND c.slug IN ('7eme', '8eme', '9eme')
  AND r.language = 'ar'
LIMIT 3
''')
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    new = translate_full(str(row[1]), row[2], row[3])
    print(f'\nCollège pilote → المدرسة الإعدادية النموذجية')
    print(f'  NID {row[0]}: {row[1]}')
    print(f'  →     {new}')

# Devoir de maison
r = m.neon_query('''
SELECT r."numericId", r.title, c.slug as cls, s.slug as subj
FROM "Resource" r
LEFT JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Subject" s ON s.id = r."subjectId"
WHERE r.title ~* 'devoir.*maison'
LIMIT 3
''')
print()
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    new = translate_full(str(row[1]), row[2], row[3])
    print(f'\nDevoir de maison → واجب منزلي')
    print(f'  NID {row[0]}: {row[1]}')
    print(f'  →     {new}')

# Devoir Corrigé
r = m.neon_query('''
SELECT r."numericId", r.title, c.slug as cls, s.slug as subj
FROM "Resource" r
LEFT JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Subject" s ON s.id = r."subjectId"
WHERE r.title ~* 'Devoir Corrigé'
  AND c.slug IN ('7eme', '8eme', '9eme')
LIMIT 3
''')
print()
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    new = translate_full(str(row[1]), row[2], row[3])
    print(f'\nDevoir Corrigé → فرض ... مصحح')
    print(f'  NID {row[0]}: {row[1]}')
    print(f'  →     {new}')
