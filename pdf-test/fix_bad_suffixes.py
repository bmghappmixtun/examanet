#!/usr/bin/env python3
"""
Strip bad suffixes from titles like '-stamped', '-compressed', trailing dashes, etc.

Patterns stripped:
- '-stamped-compressed', '-stamped', '-compressed', '-scanned', '-ocr', '-draft', '-final'
- Trailing '-' or whitespace
- Truncated year (YYYY-YYYY without closing paren)

Run: 2026-07-25 - fixed 37 titles
"""
import sys
import re
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

PATTERNS = [
    (r'\s*-\s*stamped-compressed\s*$', ''),
    (r'\s*-\s*stamped\s*$', ''),
    (r'\s*-\s*compressed\s*$', ''),
    (r'\s*-\s*scanned\s*$', ''),
    (r'\s*-\s*ocr\s*$', ''),
    (r'\s*-\s*draft\s*$', ''),
    (r'\s*-\s*final\s*$', ''),
    (r'\s+stamped-compressed\s*$', ''),
    (r'\s+stamped\s*$', ''),
    (r'\s+compressed\s*$', ''),
    (r'\s*-\s*$', ''),
    (r'\s+$', ''),
    (r'\(20(\d{2})-20(\d{2})$', r'(20\1-20\2)'),
    (r'\(20(\d{2})$', r'(20\1)'),
    (r'\(19(\d{2})$', r'(19\1)'),
]

# Find and fix
r = m.neon_query('SELECT id, "numericId", title FROM "Resource"')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])

fixes = []
for row in rows:
    rid, nid, title = row
    new_title = title
    for pat, repl in PATTERNS:
        new_title = re.sub(pat, repl, new_title)
    if new_title != title:
        fixes.append((rid, new_title, title))

print(f'Title fixes: {len(fixes)}')

# Backup and apply
for rid, new_title, old in fixes:
    safe = old.replace("'", "''")
    m.neon_query(f'''
    INSERT INTO "ResourceTitleBackup" ("numericId", "resourceId", "oldTitle", "regeneratedBy", "regeneratedAt")
    SELECT "numericId", id, '{safe}', 'bad-suffix-cleanup-2026-07-25', NOW() FROM "Resource" WHERE id = '{rid}'
    ON CONFLICT ("resourceId") DO UPDATE SET
        "oldTitle" = EXCLUDED."oldTitle",
        "regeneratedBy" = EXCLUDED."regeneratedBy",
        "regeneratedAt" = EXCLUDED."regeneratedAt"
    ''')

for i in range(0, len(fixes), 50):
    batch = fixes[i:i+50]
    values_list = []
    for rid, nt, _ in batch:
        safe = nt.replace("'", "''")
        values_list.append(f"('{rid}', '{safe}')")
    m.neon_query(f'''
    UPDATE "Resource" r
    SET title = v.new_title
    FROM (VALUES {', '.join(values_list)}) AS v(id, new_title)
    WHERE r.id = v.id
    ''')

print(f'Applied {len(fixes)} title fixes')
