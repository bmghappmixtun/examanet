import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import re

def title_to_slug(title, nid):
    """Convert title to URL-friendly slug"""
    # Remove accents
    import unicodedata
    s = unicodedata.normalize('NFD', title)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = s.lower()
    # Replace spaces with -
    s = re.sub(r'[\s_]+', '-', s)
    # Remove non-alphanumeric
    s = re.sub(r'[^a-z0-9\-]', '', s)
    # Remove double dashes
    s = re.sub(r'-+', '-', s)
    # Trim dashes
    s = s.strip('-')
    return f"{s}-{nid}"

# Resources that need slug update
nids = [15359, 15370, 15373, 15375, 15376, 15377, 14801, 14804]
r = m.neon_query(f'''
SELECT id, "numericId", title, slug
FROM "Resource"
WHERE "numericId" IN ({','.join(map(str, nids))})
''')
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    rid, nid, title, old_slug = row
    new_slug = title_to_slug(title, nid)
    if new_slug != old_slug:
        print(f'NID {nid}:')
        print(f'  Old slug: {old_slug}')
        print(f'  New slug: {new_slug}')
        
        # Update
        m.neon_query(f'''
        UPDATE "Resource" SET slug = '{new_slug}' WHERE id = '{rid}'
        ''')
        print('  ✓ Updated')
    else:
        print(f'NID {nid}: slug already correct ({old_slug})')
