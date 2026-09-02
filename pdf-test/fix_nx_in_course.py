import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import re
import unicodedata

def title_to_slug(title, nid):
    s = unicodedata.normalize('NFD', title)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = s.lower()
    s = re.sub(r'[\s_]+', '-', s)
    s = re.sub(r'[^a-z0-9\-]', '', s)
    s = re.sub(r'-+', '-', s)
    s = s.strip('-')
    return f"{s}-{nid}"

# Find COURSE with N°X pattern at start (no "Devoir" prefix)
r = m.neon_query('''
SELECT id, "numericId", title FROM "Resource"
WHERE type = 'COURSE' 
  AND title ~ '^N°\\d'
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'Found: {len(rows)}')

for rid, nid, title in rows:
    print(f'NID {nid}: {title[:80]}')
    m.neon_query(f"UPDATE \"Resource\" SET type = 'DEVOIR', \"homeworkSubtype\" = 'CONTROLE' WHERE id = '{rid}'")
    print('  → type=DEVOIR/CONTROLE')
    print('  ✓ Updated')

# Also find COURSE with "Mr X" pattern in title (looks like teacher-added devoirs)
# These need manual review but for now I'll leave them as COURSE

# Find COURSE with Arabic "الدّرس" prefix - these ARE courses
print()
print("Verifying الدّرس prefix courses:")
r = m.neon_query('''
SELECT "numericId", title FROM "Resource"
WHERE type = 'COURSE' AND title LIKE 'الدّرس%'
LIMIT 5
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
for row in rows:
    print(f'  NID {row[0]}: {row[1][:80]}')
