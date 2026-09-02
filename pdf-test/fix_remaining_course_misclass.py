"""Fix 4 remaining misclassifications in COURSE type"""
import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import re

# Specific NIDs
fixes = [
    (3319, 'EXERCISE', None),  # Série d'exercices
    (3366, 'EXERCISE', None),  # Série d'exercices
    (3273, 'EXERCISE', None),  # Arabic série تمارين
    (3470, 'DEVOIR', 'CONTROLE'),  # Arabic فرض
]

for nid, new_type, new_subtype in fixes:
    r = m.neon_query(f'SELECT id, title FROM "Resource" WHERE "numericId" = {nid}')
    for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
        rid, title = row
        print(f'NID {nid}: {title[:80]}')
        if new_subtype:
            m.neon_query(f"UPDATE \"Resource\" SET type = '{new_type}', \"homeworkSubtype\" = '{new_subtype}' WHERE id = '{rid}'")
        else:
            m.neon_query(f"UPDATE \"Resource\" SET type = '{new_type}' WHERE id = '{rid}'")
        print(f'  → type={new_type}, sub={new_subtype}')
        print('  ✓ Updated')

# Now do a broader search to find more
print()
print("=" * 60)
print("Looking for more misclassifications...")
print("=" * 60)

# Look for COURSE with no "Cours" in title at all (could be a different type)
r = m.neon_query('''
SELECT "numericId", title FROM "Resource"
WHERE type = 'COURSE' 
  AND title !~* 'Cours|Leçon|درس|Course|Chapter|Document'
  AND title != 'Document - Technologie - 8ème année de base'  -- known Document
ORDER BY "numericId"
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'COURSE without "Cours/Leçon/درس" prefix: {len(rows)}')
for row in rows[:20]:
    print(f'  NID {row[0]}: {row[1][:80]}')
