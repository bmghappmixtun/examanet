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

# Find all
r = m.neon_query('''
SELECT id, "numericId", slug, title
FROM "Resource"
WHERE slug ~ '(annee|trimestre|secondaire)'
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])

to_update = []
for rid, nid, slug, title in rows:
    new_slug = title_to_slug(title, nid)
    if new_slug != slug:
        to_update.append((rid, nid, slug, new_slug))

print(f'Total: {len(to_update)}')

# Batch update with VALUES
BATCH = 100
fixed = 0
for i in range(0, len(to_update), BATCH):
    batch = to_update[i:i+BATCH]
    values = ','.join(f"('{rid}', '{new_slug}')" for rid, nid, old, new_slug in batch)
    sql = f'UPDATE "Resource" r SET slug = v.slug FROM (VALUES {values}) AS v(id, slug) WHERE r.id = v.id'
    try:
        m.neon_query(sql)
        fixed += len(batch)
    except Exception as e:
        print(f'  Error at {i}: {e}')
    
    if (i+BATCH) % 300 == 0 or (i+BATCH) >= len(to_update):
        print(f'  Progress: {min(i+BATCH, len(to_update))}/{len(to_update)}')

print(f'✓ Fixed {fixed} slugs')
