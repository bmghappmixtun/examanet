"""Fix the 41 HOMEWORK (from HOUSEWORK) by looking at title to determine correct subtype"""
import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import re

# Get all 41 HOMEWORK resources
r = m.neon_query('''
SELECT id, "numericId", title, type
FROM "Resource"
WHERE "homeworkSubtype" = 'HOMEWORK'
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'Found {len(rows)} resources to re-fix')

# Categorize by title
maison = []
revision = []
exercice_misclass = []
for rid, nid, title, type_ in rows:
    title_lower = title.lower()
    if 'maison' in title_lower or 'homework' in title_lower:
        maison.append((rid, nid, title, type_))
    elif 'révision' in title_lower or 'revision' in title_lower:
        revision.append((rid, nid, title, type_))
    else:
        exercice_misclass.append((rid, nid, title, type_))

print(f'  → MAISON: {len(maison)}')
print(f'  → REVISION: {len(revision)}')
print(f'  → UNKNOWN (need manual): {len(exercice_misclass)}')

# Update MAISON
for i in range(0, len(maison), 200):
    batch = [r[0] for r in maison[i:i+200]]
    ids_str = "','".join(batch)
    m.neon_query(f'''
    UPDATE "Resource" 
    SET "homeworkSubtype" = 'MAISON'
    WHERE id IN ('{ids_str}')
    ''')
print(f'  ✓ Set {len(maison)} to MAISON')

# Update REVISION
for i in range(0, len(revision), 200):
    batch = [r[0] for r in revision[i:i+200]]
    ids_str = "','".join(batch)
    m.neon_query(f'''
    UPDATE "Resource" 
    SET "homeworkSubtype" = 'REVISION'
    WHERE id IN ('{ids_str}')
    ''')
print(f'  ✓ Set {len(revision)} to REVISION')

# Show unknown
if exercice_misclass:
    print(f'\n  Unknown cases:')
    for rid, nid, title, type_ in exercice_misclass[:20]:
        print(f'    NID {nid}: {title[:80]}')

# Verify
r = m.neon_query('''
SELECT "homeworkSubtype", COUNT(*)
FROM "Resource"
WHERE "homeworkSubtype" IS NOT NULL
GROUP BY "homeworkSubtype"
ORDER BY COUNT(*) DESC
''')
print('\nNew distribution:')
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    print(f'  {row[0]!r}: {row[1]}')
