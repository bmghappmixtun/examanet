"""Fix all titles with trailing digit bug"""
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

# Get all titles with trailing digit
r = m.neon_query('SELECT id, "numericId", title FROM "Resource" WHERE title ~ \'\\s\\d$\'')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'Total: {len(rows)}')

# Process in batches
BATCH = 50
total_fixed = 0
for i in range(0, len(rows), BATCH):
    batch = rows[i:i+BATCH]
    
    # Build backup
    values = []
    for rid, nid, title in batch:
        new_title = re.sub(r'\s+\d+$', '', title)
        if new_title == title:
            continue
        new_slug = title_to_slug(new_title, nid)
        old_e = title.replace("'", "''")
        new_e = new_title.replace("'", "''")
        values.append(f"('{rid}', {nid}, '{old_e}', '{new_e}', '{new_slug}', NOW(), 'fix_trailing_digit')")
    
    if not values:
        continue
    
    # Backup batch
    m.neon_query(f'''
INSERT INTO "ResourceTitleBackup" ("resourceId", "numericId", "oldTitle", "newTitle", "regeneratedAt", "regeneratedBy", "newSlug")
VALUES {','.join(values)}
ON CONFLICT ("resourceId") DO UPDATE SET "oldTitle" = EXCLUDED."oldTitle", "newTitle" = EXCLUDED."newTitle", "regeneratedAt" = NOW(), "regeneratedBy" = EXCLUDED."regeneratedBy"
''')
    
    # Update each
    for rid, nid, title in batch:
        new_title = re.sub(r'\s+\d+$', '', title)
        if new_title == title:
            continue
        new_slug = title_to_slug(new_title, nid)
        m.neon_query(f"UPDATE \"Resource\" SET title = '{new_title.replace(chr(39), chr(39)+chr(39))}', slug = '{new_slug}' WHERE id = '{rid}'")
        total_fixed += 1

print(f'✓ Fixed {total_fixed} titles')
