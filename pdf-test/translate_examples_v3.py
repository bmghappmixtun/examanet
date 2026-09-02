#!/usr/bin/env python3
"""V3: Handle 'Avec correction' as مع الاصلاح indicator too."""
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
    
    school_indicator = None
    if re.search(r'Coll[eè]ge pilote', title, re.IGNORECASE):
        school_indicator = 'المدرسة الإعدادية النموذجية'
        title = re.sub(r'Coll[eè]ge pilote', '', title, flags=re.IGNORECASE).strip()
    
    # Detect "Avec correction" / "avec correction" / "(Corrigé)" etc as indicator
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
    return new

print('=' * 100)
print('V3: Corrigé/Avec correction → مع الاصلاح')
print('=' * 100)

# Devoir Corrigé
print('\n### Devoir Corrigé de Synthèse/Contrôle')
r = m.neon_query('''
SELECT r."numericId", r.title, c.slug as cls, s.slug as subj
FROM "Resource" r
LEFT JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Subject" s ON s.id = r."subjectId"
WHERE r.title ~* 'Devoir\\s+Corrigé'
  AND c.slug IN ('7eme', '8eme', '9eme')
LIMIT 4
''')
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    new = translate_full(str(row[1]), row[2], row[3])
    print(f'  NID {row[0]}: {row[1]}')
    print(f'  →     {new}\n')

# Avec correction
print('### Avec correction')
r = m.neon_query('''
SELECT r."numericId", r.title, c.slug as cls, s.slug as subj
FROM "Resource" r
LEFT JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Subject" s ON s.id = r."subjectId"
WHERE r.title ~* 'Avec correction'
  AND c.slug IN ('7eme', '8eme', '9eme')
LIMIT 4
''')
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    new = translate_full(str(row[1]), row[2], row[3])
    print(f'  NID {row[0]}: {row[1]}')
    print(f'  →     {new}\n')

# (Corrigé)
print('### (Corrigé)')
r = m.neon_query('''
SELECT r."numericId", r.title, c.slug as cls, s.slug as subj
FROM "Resource" r
LEFT JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Subject" s ON s.id = r."subjectId"
WHERE r.title LIKE '%(Corrigé)%'
  AND c.slug IN ('7eme', '8eme', '9eme')
LIMIT 3
''')
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    new = translate_full(str(row[1]), row[2], row[3])
    print(f'  NID {row[0]}: {row[1]}')
    print(f'  →     {new}\n')
