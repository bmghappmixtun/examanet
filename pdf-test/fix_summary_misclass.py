import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import re

# ============================================
# FIX 1: SUMMARY with "Cours" or "Devoir" prefix → reclassify
# ============================================
print("=" * 60)
print("FIX 1: SUMMARY → COURSE or DEVOIR based on title")
print("=" * 60)

# 5 specific cases I found
fixes = [
    (6801, 'COURSE', None),  # Cours - Physique - résumé
    (6806, 'COURSE', None),  # Cours - Sciences de la vie et de la terre
    (12199, 'DEVOIR', 'REVISION'),  # Devoir Corrigé de révision
    (13189, 'COURSE', None),  # Cours - Sciences physiques rappels
    (13637, 'COURSE', None),  # Cours - Physique - Résumé
]

for nid, new_type, new_subtype in fixes:
    r = m.neon_query(f'SELECT id, title FROM "Resource" WHERE "numericId" = {nid}')
    for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
        rid, title = row
        print(f'NID {nid}: {title[:80]}')
        if new_subtype:
            m.neon_query(f"UPDATE \"Resource\" SET type = '{new_type}', \"homeworkSubtype\" = '{new_subtype}', \"homeworkNumber\" = NULL WHERE id = '{rid}'")
        else:
            m.neon_query(f"UPDATE \"Resource\" SET type = '{new_type}', \"homeworkSubtype\" = NULL, \"homeworkNumber\" = NULL WHERE id = '{rid}'")
        print(f'  → type={new_type}, sub={new_subtype}')

# Also: look for any other SUMMARY with "Cours" or "Devoir" prefix
r = m.neon_query('''
SELECT id, "numericId", title FROM "Resource"
WHERE type = 'SUMMARY' AND (title LIKE 'Cours%' OR title LIKE 'Devoir%')
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'\nAdditional SUMMARY with Cours/Devoir prefix: {len(rows)}')
for rid, nid, title in rows:
    print(f'  NID {nid}: {title[:80]}')

# ============================================
# FIX 2: "Résumé - X" with wrong subtype
# These are legitimate SUMMARY but have CONTROLE/hwn=1 - should be cleared
# ============================================
print()
print("=" * 60)
print("FIX 2: 'Résumé - X' SUMMARY with wrong subtype/hwn → clear")
print("=" * 60)

r = m.neon_query('''
SELECT id, "numericId", title, "homeworkSubtype", "homeworkNumber"
FROM "Resource"
WHERE type = 'SUMMARY' AND title LIKE 'Résumé%'
  AND ("homeworkSubtype" IS NOT NULL AND "homeworkSubtype" != '' OR "homeworkNumber" IS NOT NULL)
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'Found: {len(rows)} "Résumé - X" with subtype/hwn')

# Clear subtype and hwn
ids = [r[0] for r in rows]
if ids:
    ids_str = "','".join(ids)
    m.neon_query(f"UPDATE \"Resource\" SET \"homeworkSubtype\" = NULL, \"homeworkNumber\" = NULL WHERE id IN ('{ids_str}')")
    print(f'✓ Cleared subtype/hwn for {len(ids)} resources')

# ============================================
# Final state
# ============================================
print()
print("=" * 60)
print("FINAL SUMMARY STATE")
print("=" * 60)

r = m.neon_query('''
SELECT 
  CASE
    WHEN title LIKE 'Résumé%' THEN 'Résumé - X (legitimate)'
    WHEN title LIKE 'ملخص%' THEN 'ملخص (Arabic summary)'
    WHEN title LIKE 'مراجعة%' THEN 'مراجعة (Arabic revision)'
    WHEN title LIKE 'تمارين مراجعة%' THEN 'تمارين مراجعة (revision exercises)'
    WHEN title LIKE 'فرض مراجعة%' THEN 'فرض مراجعة (revision devoir)'
    WHEN title LIKE 'Cours%' THEN 'Cours (should be COURSE)'
    WHEN title LIKE 'Devoir%' THEN 'Devoir (should be DEVOIR)'
    ELSE 'Other'
  END as prefix,
  COUNT(*) as cnt
FROM "Resource"
WHERE type = 'SUMMARY'
GROUP BY prefix
ORDER BY cnt DESC
''')
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    print(f'  {row[0]}: {row[1]}')

r = m.neon_query('SELECT COUNT(*) FROM "Resource" WHERE type = \'SUMMARY\'')
total = r.get('response', [{}])[0].get('data', {}).get('rows', [])[0][0]
print(f'\nTotal SUMMARY: {total}')

# Check Arabic ones
r = m.neon_query('''
SELECT "numericId", title FROM "Resource"
WHERE type = 'SUMMARY' AND title LIKE '%مراجعة%'
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'\nArabic مراجعة (revision) cases: {len(rows)}')
for row in rows:
    print(f'  NID {row[0]}: {row[1][:80]}')
