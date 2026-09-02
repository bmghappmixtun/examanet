#!/usr/bin/env python3
"""Fix language mismatches for college files based on content analysis.
- DB=ar but content=FR → fix to fr
- DB=fr but content=AR → fix to ar
"""
import os, json, re, importlib.util

spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

# Get all college with text
r = m.neon_query('''
SELECT r.id, r."numericId", r.language, 
       LEFT(rc."fullText", 3000) as text
FROM "Resource" r
JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
WHERE c.slug IN ('7eme', '8eme', '9eme')
AND LENGTH(rc."fullText") > 200
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])

def detect_lang(text):
    """Detect AR vs FR with ligatures."""
    if not text:
        return 'unknown'
    ar = len(re.findall(r'[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]', text))
    latin = len(re.findall(r'[a-zA-Z]', text))
    total = ar + latin
    if total == 0:
        return 'unknown'
    ar_pct = ar / total * 100
    if ar_pct > 30:
        return 'ar'
    elif ar_pct < 5:
        return 'fr'
    else:
        return 'mixed'

# Find true mismatches (excluding the corrupted-Greek cases)
ar_to_fr = []  # DB=ar but content clearly FR (and not corrupted)
fr_to_ar = []  # DB=fr but content clearly AR

for row in rows:
    rid, nid, db_lang, text = row
    db_lang = str(db_lang) if db_lang else 'unknown'
    detected = detect_lang(text)
    
    if db_lang == 'ar' and detected == 'fr':
        # True mismatch (text has French content)
        ar_to_fr.append({'id': rid, 'nid': nid, 'text_preview': str(text)[:200]})
    elif db_lang == 'fr' and detected == 'ar':
        fr_to_ar.append({'id': rid, 'nid': nid, 'text_preview': str(text)[:200]})

print(f'=== Language mismatches found ===')
print(f'DB=ar → should be fr: {len(ar_to_fr)}')
print(f'DB=fr → should be ar: {len(fr_to_ar)}')

# Show DB=ar → fr (likely true mismatches)
if ar_to_fr:
    print(f'\n=== DB=ar → fr (NID, text start) ===')
    for m_ in ar_to_fr[:10]:
        print(f'  NID {m_["nid"]}: {m_["text_preview"][:80]}')

# Update DB=ar → fr
print(f'\n=== Updating DB=ar → fr ===')
for m_ in ar_to_fr:
    m.neon_query(f"UPDATE \"Resource\" SET language = 'fr' WHERE id = '{m_['id']}'")
print(f'Updated {len(ar_to_fr)} files to language=fr')

# Update DB=fr → ar  
print(f'\n=== Updating DB=fr → ar ===')
for m_ in fr_to_ar:
    m.neon_query(f"UPDATE \"Resource\" SET language = 'ar' WHERE id = '{m_['id']}'")
print(f'Updated {len(fr_to_ar)} files to language=ar')
