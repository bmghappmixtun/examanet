import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import re

# Look for COURSE with "Série" prefix
print("Pattern 1: type=COURSE + 'Série' prefix")
r = m.neon_query('''
SELECT "numericId", title FROM "Resource"
WHERE type = 'COURSE' AND title ~* '^Série|^Serie'
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'Found: {len(rows)}')
for row in rows[:15]:
    print(f'  NID {row[0]}: {row[1][:80]}')

# Look for COURSE with "Devoir" prefix (case-insensitive)
print()
print("Pattern 2: type=COURSE + 'Devoir' prefix")
r = m.neon_query('''
SELECT "numericId", title FROM "Resource"
WHERE type = 'COURSE' AND title ~* '^Devoir'
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'Found: {len(rows)}')
for row in rows[:15]:
    print(f'  NID {row[0]}: {row[1][:80]}')

# Look for COURSE with "Série" anywhere
print()
print("Pattern 3: type=COURSE + 'Série' anywhere")
r = m.neon_query('''
SELECT "numericId", title FROM "Resource"
WHERE type = 'COURSE' AND title ~* 'Série|Serie d'
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'Found: {len(rows)}')
for row in rows[:15]:
    print(f'  NID {row[0]}: {row[1][:80]}')

# Look for COURSE with "Devoir" anywhere
print()
print("Pattern 4: type=COURSE + 'Devoir' anywhere")
r = m.neon_query('''
SELECT "numericId", title FROM "Resource"
WHERE type = 'COURSE' AND title ~* 'Devoir'
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'Found: {len(rows)}')
for row in rows[:15]:
    print(f'  NID {row[0]}: {row[1][:80]}')

# Also: COURSE with Arabic "سلسلة" (serie)
print()
print("Pattern 5: type=COURSE + Arabic 'سلسلة'")
r = m.neon_query('''
SELECT "numericId", title FROM "Resource"
WHERE type = 'COURSE' AND title LIKE '%سلسلة%'
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'Found: {len(rows)}')
for row in rows[:10]:
    print(f'  NID {row[0]}: {row[1][:80]}')

# COURSE with Arabic "فرض" (devoir)
print()
print("Pattern 6: type=COURSE + Arabic 'فرض'")
r = m.neon_query('''
SELECT "numericId", title FROM "Resource"
WHERE type = 'COURSE' AND title LIKE '%فرض%'
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'Found: {len(rows)}')
for row in rows[:10]:
    print(f'  NID {row[0]}: {row[1][:80]}')
