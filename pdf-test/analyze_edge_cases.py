#!/usr/bin/env python3
"""Analyze edge cases for FR→AR title translation."""
import importlib.util, re
spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

# Get 30 random samples
r = m.neon_query('''
SELECT r."numericId", r.title, c.slug as cls, s.slug as subj
FROM "Resource" r
LEFT JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Subject" s ON s.id = r."subjectId"
WHERE c.slug IN ('7eme', '8eme', '9eme')
  AND r.language = 'ar'
  AND r.title ~ '[A-Za-z]'
ORDER BY RANDOM()
LIMIT 30
''')
samples = [{'nid': r[0], 'title': str(r[1]), 'cls': r[2], 'subj': r[3]} 
           for r in r.get('response', [{}])[0].get('data', {}).get('rows', [])]

# Edge case categorization
patterns = {
    'standard_fr_only': re.compile(r'^Devoir de (?:Synth[eè]se|Contr[oô]le) N°?\s*\d+\s*-\s*[A-Za-zÀ-ÿ\s]+\s*-\s*\d+[eè]me(?:\s+année de base)?\s*-\s*\(\d{4}-\d{4}\)(?:\s+(?:Mr|Mme)\s+[A-Za-z\s]+)?$'),
    'has_arabic_already': lambda t: bool(re.search(r'[\u0600-\u06FF]', t)),
    'has_fr_teacher_lower': lambda t: bool(re.search(r'(?:Mr|Mme)\s+[a-z]', t)),
    'has_special_subject': lambda t: any(s in t for s in ['Chapitre', 'Leçon', 'Activité', 'Tp', 'TD', 'Exercice', 'Activité', 'Contrôle', 'Synthèse', 'TICE']),
    'has_subtitle_ar': lambda t: '-' in t and re.search(r'[\u0600-\u06FF]', t),
}

print('=' * 100)
print('EDGE CASES IDENTIFIED:')
print('=' * 100)

categories = {k: 0 for k in patterns.keys()}
categorize_list = []
for s in samples:
    matched = []
    for k, p in patterns.items():
        if k == 'has_arabic_already' or k == 'has_fr_teacher_lower' or k == 'has_special_subject' or k == 'has_subtitle_ar':
            if p(s['title']):
                matched.append(k)
        elif p.match(s['title']):
            matched.append(k)
    categorize_list.append((s, matched))
    for m in matched:
        categories[m] += 1

print('\nCategory counts:')
for k, v in categories.items():
    print(f'  {k}: {v}')

# Show a few of each interesting category
print('\n--- has_arabic_already ---')
for s, m in categorize_list:
    if 'has_arabic_already' in m:
        print(f'  NID {s["nid"]}: {s["title"][:100]}')
        if categories['has_arabic_already'] > 5: break

print('\n--- has_fr_teacher_lower ---')
for s, m in categorize_list:
    if 'has_fr_teacher_lower' in m:
        print(f'  NID {s["nid"]}: {s["title"][:100]}')

print('\n--- has_special_subject ---')
for s, m in categorize_list:
    if 'has_special_subject' in m:
        print(f'  NID {s["nid"]}: {s["title"][:100]}')

print('\n--- All 30 samples ---')
for s, m in categorize_list:
    print(f'  NID {s["nid"]} [{",".join(m) if m else "standard"}]: {s["title"][:100]}')
