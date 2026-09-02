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

# Find all resources where slug doesn't match title
# We can detect outdated slugs by checking if slug contains old format markers
# Like "1ere-annee-secondaire" or "1er-trimestre" etc.

# Find slugs containing "annee" or "trimestre" (old format)
r = m.neon_query('''
SELECT id, "numericId", slug, title
FROM "Resource"
WHERE slug ~ '(annee|trimestre|secondaire)'
LIMIT 1000
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])

print(f'Found {len(rows)} resources with old-format slugs')

# Get all and check
to_update = []
for rid, nid, slug, title in rows:
    new_slug = title_to_slug(title, nid)
    if new_slug != slug:
        to_update.append((rid, nid, slug, new_slug, title))

print(f'Need to update: {len(to_update)}')

# Show some samples
for rid, nid, old, new, title in to_update[:10]:
    print(f'  NID {nid}: {old[:60]}')
    print(f'    NEW: {new[:80]}')
