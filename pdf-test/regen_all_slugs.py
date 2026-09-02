import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import re
import json

def make_slug(title, nid):
    """Generate proper URL slug from title"""
    s = title.lower()
    repl = {
        'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a',
        'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
        'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
        'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o',
        'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u',
        'ý': 'y', 'ÿ': 'y', 'ç': 'c', 'ñ': 'n',
    }
    for k, v in repl.items():
        s = s.replace(k, v)
    # Strip Arabic
    s = re.sub(r'[\u0600-\u06FF]+', '', s)
    # Remove special chars
    s = re.sub(r"['\u2018\u2019]", '-', s)  # Replace apostrophes with hyphens
    s = re.sub(r'[^a-z0-9\s-]', ' ', s)
    s = re.sub(r'\s+', '-', s.strip())
    s = re.sub(r'-+', '-', s)
    s = s.strip('-')
    if len(s) > 80:
        s = s[:80].rsplit('-', 1)[0]  # Cut at last hyphen
    return f'{s}-{nid}'

# Get all resources
r = m.neon_query('SELECT id, "numericId", title, slug FROM "Resource"')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])

print(f'Total resources: {len(rows)}')

# Find slugs that need updating
updates = []
for row in rows:
    rid, nid, title, slug = row
    new_slug = make_slug(title, nid)
    if new_slug != slug:
        updates.append((rid, new_slug, slug, title[:50]))

print(f'Slugs to update: {len(updates)}')

# Check for collisions
from collections import Counter
slug_count = Counter(s[1] for s in updates)
collisions = [s for s, c in slug_count.items() if c > 1]
if collisions:
    print(f'⚠ {len(collisions)} potential collisions: {collisions[:5]}')

# Apply in batches
print('Applying...')
for i in range(0, len(updates), 100):
    batch = updates[i:i+100]
    values = []
    for rid, ns, _, _ in batch:
        safe = ns.replace("'", "''")
        values.append(f"('{rid}', '{safe}')")
    m.neon_query(f'''
    UPDATE "Resource" r
    SET slug = v.new_slug
    FROM (VALUES {','.join(values)}) AS v(id, new_slug)
    WHERE r.id = v.id
    ''')
    if i % 500 == 0:
        print(f'  Applied {min(i+100, len(updates))}/{len(updates)}')

print(f'Applied {len(updates)} slug updates')
