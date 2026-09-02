"""Find more data quality issues"""
import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import re

# Issue 1: DEVOIR with no year (potential import issue)
print("=" * 60)
print("DEVOIR without year")
print("=" * 60)
r = m.neon_query('''
SELECT "numericId", title, year FROM "Resource"
WHERE type = 'DEVOIR' AND (year IS NULL OR year = '')
LIMIT 20
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'Sample: {len(rows)}')
for row in rows:
    print(f'  NID {row[0]}: year={row[2]!r} | {row[1][:60]}')

# Count total
r = m.neon_query('''
SELECT COUNT(*) FROM "Resource" WHERE type = 'DEVOIR' AND (year IS NULL OR year = '')
''')
total = r.get('response', [{}])[0].get('data', {}).get('rows', [])[0][0]
print(f'Total: {total}')

# Issue 2: DEVOIR with hwn but no subtype
print()
print("=" * 60)
print("DEVOIR with hwn but no subtype")
print("=" * 60)
r = m.neon_query('''
SELECT "numericId", title, "homeworkSubtype", "homeworkNumber"
FROM "Resource"
WHERE type = 'DEVOIR' AND "homeworkNumber" IS NOT NULL 
  AND ("homeworkSubtype" IS NULL OR "homeworkSubtype" = '')
LIMIT 20
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'Sample: {len(rows)}')
for row in rows:
    print(f'  NID {row[0]}: hst={row[2]!r}, hwn={row[3]} | {row[1][:60]}')

# Issue 3: Duplicate titles
print()
print("=" * 60)
print("Duplicate titles")
print("=" * 60)
r = m.neon_query('''
SELECT title, COUNT(*) as cnt
FROM "Resource"
GROUP BY title
HAVING COUNT(*) > 1
ORDER BY cnt DESC
LIMIT 10
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'Duplicate titles: {len(rows)}')
for row in rows:
    print(f'  {row[1]}x: {row[0][:70]}')

# Issue 4: Resources with description and title mismatched
print()
print("=" * 60)
print("Title with weird patterns")
print("=" * 60)
r = m.neon_query('''
SELECT "numericId", title FROM "Resource"
WHERE title ~* '\\d{2,}\\s*\\d{2,}|TPN°|RESUME|Résume avec'
LIMIT 10
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'Sample: {len(rows)}')
for row in rows:
    print(f'  NID {row[0]}: {row[1][:80]}')

# Issue 5: type=OTHER or SUMMARY - what are they?
print()
print("=" * 60)
print("Sample of type=OTHER and SUMMARY")
print("=" * 60)
r = m.neon_query('''
SELECT "numericId", title, type FROM "Resource" 
WHERE type IN ('OTHER', 'SUMMARY')
LIMIT 15
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
for row in rows:
    print(f'  NID {row[0]} [{row[2]}]: {row[1][:80]}')
