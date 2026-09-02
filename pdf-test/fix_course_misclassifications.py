"""Fix COURSE/EXERCISE/DEVOIR misclassifications based on title prefix"""
import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import re

def detect_subtype_from_title(title):
    title_lower = title.lower()
    if re.search(r'devoir\s+de\s+r[ée]vision', title_lower):
        return 'REVISION'
    if re.search(r'devoir\s+de\s+maison', title_lower):
        return 'MAISON'
    if re.search(r'devoir\s+de\s+synth[èeéê]se', title_lower):
        return 'SYNTHESE'
    if re.search(r'devoir\s+de\s+contr[oôö]le', title_lower):
        return 'CONTROLE'
    return None

# FIX 1: 88 COURSE with "Devoir" prefix → DEVOIR
print("FIX 1: 88 COURSE with 'Devoir' prefix → DEVOIR")
r = m.neon_query('''
SELECT id, "numericId", title, "homeworkSubtype", "homeworkNumber"
FROM "Resource"
WHERE type = 'COURSE' AND title LIKE 'Devoir%'
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'Found: {len(rows)}')

updates = []
for rid, nid, title, db_hst, hwn in rows:
    new_hst = detect_subtype_from_title(title) or db_hst or 'CONTROLE'
    updates.append((rid, new_hst))

BATCH = 100
fixed = 0
for i in range(0, len(updates), BATCH):
    batch = updates[i:i+BATCH]
    values = ','.join(f"('{rid}', '{hst}')" for rid, hst in batch)
    try:
        m.neon_query(f"UPDATE \"Resource\" r SET type = 'DEVOIR', \"homeworkSubtype\" = v.hst FROM (VALUES {values}) AS v(id, hst) WHERE r.id = v.id")
        fixed += len(batch)
    except Exception as e:
        print(f'  Error: {e}')
print(f'Fixed {fixed}')

# FIX 2: 37 COURSE with "Série" prefix → EXERCISE
print("\nFIX 2: 37 COURSE with 'Série' prefix → EXERCISE")
r = m.neon_query('SELECT id FROM "Resource" WHERE type = \'COURSE\' AND title LIKE \'Série%\'')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
ids = [row[0] for row in rows]
print(f'Found: {len(ids)}')
for i in range(0, len(ids), BATCH):
    batch = ids[i:i+BATCH]
    ids_str = "','".join(batch)
    m.neon_query(f"UPDATE \"Resource\" SET type = 'EXERCISE' WHERE id IN ('{ids_str}')")
print(f'Fixed {len(ids)}')

# FIX 3: 45 EXERCISE with "Cours/Leçon/Résumé" prefix → COURSE
print("\nFIX 3: 45 EXERCISE with 'Cours/Leçon/Résumé' prefix → COURSE")
r = m.neon_query('''
SELECT id FROM "Resource" 
WHERE type = 'EXERCISE' AND (title LIKE 'Cours%' OR title LIKE 'Leçon%' OR title LIKE 'Résumé%')
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
ids = [row[0] for row in rows]
print(f'Found: {len(ids)}')
for i in range(0, len(ids), BATCH):
    batch = ids[i:i+BATCH]
    ids_str = "','".join(batch)
    m.neon_query(f"UPDATE \"Resource\" SET type = 'COURSE' WHERE id IN ('{ids_str}')")
print(f'Fixed {len(ids)}')

# FIX 4: 1 DEVOIR with "Cours" prefix → COURSE
print("\nFIX 4: 1 DEVOIR with 'Cours' prefix → COURSE")
r = m.neon_query('''SELECT id, "numericId", title FROM "Resource" WHERE type = 'DEVOIR' AND title LIKE 'Cours%\'''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'Found: {len(rows)}')
for row in rows:
    print(f'  NID {row[1]}: {row[2][:80]}')
    m.neon_query(f"UPDATE \"Resource\" SET type = 'COURSE' WHERE id = '{row[0]}'")
print(f'Fixed {len(rows)}')

# Final state
print("\n=== FINAL STATE ===")
r = m.neon_query('SELECT type, COUNT(*) FROM "Resource" GROUP BY type ORDER BY COUNT(*) DESC')
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    print(f'  {row[0]}: {row[1]}')
