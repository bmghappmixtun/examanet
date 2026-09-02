#!/usr/bin/env python3
"""Translate college AR titles from FR to AR using Python regex + transliteration."""
import os, json, re, importlib.util
spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

# ===== LEXIQUE FR → AR =====
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

# Transliteration Latin → Arabic (simplified for names)
LATIN_TO_AR = {
    'a': 'ا', 'b': 'ب', 'c': 'ك', 'd': 'د', 'e': 'ي', 'f': 'ف',
    'g': 'غ', 'h': 'ه', 'i': 'ي', 'j': 'ج', 'k': 'ك', 'l': 'ل',
    'm': 'م', 'n': 'ن', 'o': 'و', 'p': 'ب', 'q': 'ق', 'r': 'ر',
    's': 'س', 't': 'ت', 'u': 'و', 'v': 'ف', 'w': 'و', 'x': 'كس',
    'y': 'ي', 'z': 'ز', "'": '', '-': ' ', 'é': 'ي', 'è': 'ي',
    'ê': 'ي', 'à': 'ا', 'â': 'ا', 'ô': 'و', 'û': 'و', 'ç': 'س',
    'ï': 'ي', 'î': 'ي', 'ë': 'ي',
}

def transliterate(s):
    """Transliterate Latin name to Arabic."""
    result = []
    for c in s.lower():
        if c in LATIN_TO_AR:
            result.append(LATIN_TO_AR[c])
        elif c.isspace():
            result.append(' ')
        # Skip unknown chars (digits stay)
    return ''.join(result).strip()

def translate_title(t):
    title = t['title']
    cls = t['cls']
    subj = t['subj']
    
    # Extract year
    year_match = re.search(r'\((\d{4}-\d{4})\)', title)
    year = year_match.group(1) if year_match else None
    
    # Extract teacher
    teacher = None
    teacher_patterns = [
        r'\b(?:Mr|Mme)\s+([A-Za-zà-ÿÀ-Ÿ\s\-]+?)$',  # at end of title
        r'\b(?:Mr|Mme)\s+([A-Za-zà-ÿÀ-Ÿ\s\-]+?)(?=\s*$)',
    ]
    for pat in teacher_patterns:
        m = re.search(pat, title)
        if m:
            name = m.group(1).strip()
            # Capitalize first letter
            prefix = 'الأستاذ' if re.search(r'Mr\s', title) else 'الأستاذة'
            teacher = f'{prefix} {transliterate(name)}'
            title = title[:m.start()].strip()
            break
    
    # Remove year from title (we'll re-add it)
    title = re.sub(r'\s*\(\d{4}-\d{4}\)', '', title).strip()
    
    # Translate type prefix
    type_translated = None
    type_match = re.match(r'^(.+?)\s*-\s*(.+)$', title)
    
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
    elif title.startswith('Cours'):
        type_translated = 'درس'
    elif title.startswith('Résumé') or title.startswith('Resume'):
        type_translated = 'ملخص'
    else:
        type_translated = 'وثيقة'
    
    # Translate subject
    subj_ar = SUBJECT_AR.get(subj, transliterate(subj))
    
    # Translate class
    cls_ar = CLASS_AR.get(cls, cls)
    
    # Build
    parts = [type_translated, subj_ar, cls_ar]
    new_title = ' - '.join(parts)
    
    if year:
        new_title += f' - ({year})'
    if teacher:
        new_title += f' {teacher}'
    
    return new_title

# Get 10 samples
r = m.neon_query('''
SELECT r."numericId", r.title, c.slug as cls, s.slug as subj
FROM "Resource" r
LEFT JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Subject" s ON s.id = r."subjectId"
WHERE c.slug IN ('7eme', '8eme', '9eme')
  AND r.language = 'ar'
  AND r.title ~ '[A-Za-z]'
ORDER BY RANDOM()
LIMIT 10
''')
samples = [{'nid': r[0], 'title': str(r[1]), 'cls': r[2], 'subj': r[3]} 
           for r in r.get('response', [{}])[0].get('data', {}).get('rows', [])]

print('=' * 100)
print('TEST PYTHON: 10 fichiers avant/après')
print('=' * 100)

results = []
for t in samples:
    new = translate_title(t)
    results.append({'nid': t['nid'], 'old': t['title'], 'new': new, 'cls': t['cls'], 'subj': t['subj']})
    
    has_fr = bool(re.search(r'[a-zA-Zà-ÿÀ-ÿ]', new))
    has_year = bool(re.search(r'\d{4}-\d{4}', t['title']))
    new_has_year = bool(re.search(r'\d{4}-\d{4}', new))
    has_teacher = bool(re.search(r'(?:Mr|Mme)\s+[A-Za-z]', t['title']))
    new_has_teacher = 'الأستاذ' in new or 'الأستاذة' in new
    
    flags = []
    if has_fr: flags.append('❌FR')
    if has_year and not new_has_year: flags.append('❌YEAR')
    if has_teacher and not new_has_teacher: flags.append('❌TEACHER')
    
    status = ' '.join(flags) if flags else '✅'
    
    print(f'\nNID {t["nid"]} ({t["cls"]}/{t["subj"]}) {status}:')
    print(f'  AVANT: {t["title"]}')
    print(f'  APRÈS: {new}')

print('\n' + '=' * 100)
