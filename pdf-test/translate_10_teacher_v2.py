#!/usr/bin/env python3
"""Translate college AR titles. Teacher name strategy:
- If User.firstNameAr contains Arabic chars → use it
- Else → drop teacher from title
"""
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

# Cache teacher names
teacher_cache = {}

def get_teacher_name_ar(teacher_id):
    """Get Arabic teacher name if available, else None."""
    if not teacher_id:
        return None
    if teacher_id in teacher_cache:
        return teacher_cache[teacher_id]
    
    r = m.neon_query(f'''
        SELECT "firstNameAr", "lastNameAr"
        FROM "User" WHERE id = '{teacher_id}'
    ''')
    rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
    if not rows:
        teacher_cache[teacher_id] = None
        return None
    
    fn_ar, ln_ar = rows[0][0], rows[0][1]
    # Combine
    if fn_ar and ln_ar:
        full = f'{fn_ar} {ln_ar}'.strip()
    elif fn_ar:
        full = fn_ar.strip()
    elif ln_ar:
        full = ln_ar.strip()
    else:
        full = ''
    
    # Check if it contains Arabic
    has_ar = bool(re.search(r'[\u0600-\u06FF]', full))
    result = full if has_ar else None
    teacher_cache[teacher_id] = result
    return result

def translate_title(t):
    title = t['title']
    cls = t['cls']
    subj = t['subj']
    teacher_id = t.get('teacherId')
    
    # Extract year
    year_match = re.search(r'\((\d{4}-\d{4})\)', title)
    year = year_match.group(1) if year_match else None
    title = re.sub(r'\s*\(\d{4}-\d{4}\)', '', title).strip()
    
    # Remove any existing "Mr X" or "Mme X" or "الأستاذ X" from title (we'll re-add from DB)
    title = re.sub(r'\b(?:Mr|Mme)\s+[A-Za-zà-ÿÀ-Ÿ\s\-]+(?=\s*$)', '', title).strip()
    title = re.sub(r'الأستاذ[ة]?\s+[\u0600-\u06FF\s\-]+(?=\s*$)', '', title).strip()
    title = title.rstrip(' -').strip()
    
    # Translate type prefix
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
    subj_ar = SUBJECT_AR.get(subj, subj)
    
    # Translate class
    cls_ar = CLASS_AR.get(cls, cls)
    
    # Get teacher from DB
    teacher = get_teacher_name_ar(teacher_id)
    
    # Build
    parts = [type_translated, subj_ar, cls_ar]
    new_title = ' - '.join(parts)
    
    if year:
        new_title += f' - ({year})'
    if teacher:
        new_title += f' - {teacher}'
    
    return new_title

# Get 10 samples with teacher info
r = m.neon_query('''
SELECT r."numericId", r.title, c.slug as cls, s.slug as subj, r."teacherId",
       u."firstNameAr", u."lastNameAr"
FROM "Resource" r
LEFT JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Subject" s ON s.id = r."subjectId"
LEFT JOIN "User" u ON u.id = r."teacherId"
WHERE c.slug IN ('7eme', '8eme', '9eme')
  AND r.language = 'ar'
  AND r.title ~ '[A-Za-z]'
ORDER BY RANDOM()
LIMIT 10
''')
samples = []
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    samples.append({
        'nid': row[0], 'title': str(row[1]), 'cls': row[2], 'subj': row[3], 
        'teacherId': row[4]
    })

print('=' * 100)
print('TEST V2: 10 fichiers - Prof via DB (AR only, sinon omis)')
print('=' * 100)

for t in samples:
    new = translate_title(t)
    
    # Get teacher info for display
    has_fr = bool(re.search(r'[a-zA-Zà-ÿÀ-ÿ]', new))
    
    teacher_db = get_teacher_name_ar(t['teacherId'])
    
    print(f'\nNID {t["nid"]} ({t["cls"]}/{t["subj"]}) - ProfDB: {teacher_db or "❌ (Latin, omis)"}:')
    print(f'  AVANT: {t["title"]}')
    print(f'  APRÈS: {new}')

print('\n' + '=' * 100)
