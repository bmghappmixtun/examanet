"""Fix the homeworkSubtype typos: CONTROL→CONTROLE, SYNTHESIS→SYNTHESE, etc."""
import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

print("=" * 60)
print("FIX 1: Normalize homeworkSubtype typos")
print("=" * 60)

# Mapping of wrong → correct
SUBTYPE_FIX = {
    'CONTROL': 'CONTROLE',      # missing E
    'SYNTHESIS': 'SYNTHESE',    # extra S
    'HOUSEWORK': 'HOMEWORK',    # probably wrong
    'EXAMEN': 'CONTROLE',       # exam = contrôle in Tunisia
    'HOMEWORK': 'CONTROLE',     # generic
    'SUMMARY': 'SYNTHESE',      # English typo
}

# Get all resources with wrong subtypes
r = m.neon_query(f'''
SELECT id, "numericId", "homeworkSubtype"
FROM "Resource"
WHERE "homeworkSubtype" IN ({','.join(f"'{k}'" for k in SUBTYPE_FIX.keys())})
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'\nTotal to fix: {len(rows)}')

# Group by wrong_value
from collections import defaultdict
groups = defaultdict(list)
for rid, nid, ws in rows:
    correct = SUBTYPE_FIX.get(ws, 'CONTROLE')
    groups[(ws, correct)].append((rid, nid))

for (wrong, correct), items in groups.items():
    print(f'  {wrong} → {correct}: {len(items)}')

# Apply fixes
total_fixed = 0
for (wrong, correct), items in groups.items():
    ids = [it[0] for it in items]
    # Update in batches of 200
    for i in range(0, len(ids), 200):
        batch = ids[i:i+200]
        ids_str = "','".join(batch)
        m.neon_query(f'''
        UPDATE "Resource" 
        SET "homeworkSubtype" = '{correct}'
        WHERE id IN ('{ids_str}')
        ''')
        total_fixed += len(batch)
    print(f'  ✓ {wrong} → {correct}: {len(items)} fixed')

print(f'\n✅ Total: {total_fixed} subtype typos normalized')

# Verify
r = m.neon_query('''
SELECT "homeworkSubtype", COUNT(*)
FROM "Resource"
WHERE "homeworkSubtype" IS NOT NULL
GROUP BY "homeworkSubtype"
ORDER BY COUNT(*) DESC
''')
print('\nVerification - new distribution:')
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    print(f'  {row[0]!r}: {row[1]}')
