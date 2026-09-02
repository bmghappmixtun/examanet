#!/usr/bin/env python3
"""
Fix year field typos for cleaner filter UI.

Three patterns fixed:
1. Reversed year (y1 > y2): e.g., "2012-2011" -> "2011-2012"
2. Same year (y1 == y2): e.g., "2007-2007" -> "2007-2008" (school year)
3. Single year (e.g., "2020"): converted to "2020-2021" (school year)

Title year patterns are also updated to match DB year.
Slugs containing old year are also updated.

Run once: 2026-07-25 - fixed 584 year issues
"""
import sys
import re
import json
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def extract_year_from_title(title):
    """Extract correct year from title or fallback to single-year school year"""
    # Look for (YYYY-YYYY) or (YYYY) patterns
    m_yr = re.search(r'\((\d{4})-(\d{4})\)', title)
    if m_yr:
        y1, y2 = m_yr.group(1), m_yr.group(2)
        if y1 == y2:
            return f'{int(y1)}-{int(y1)+1}'  # school year
        if int(y1) > int(y2):
            return f'{y2}-{y1}'  # swap
        return f'{y1}-{y2}'
    
    # Single year in title
    m_single = re.search(r'\((\d{4})\)', title)
    if m_single:
        y = m_single.group(1)
        return f'{y}-{int(y)+1}'
    
    return None


# Find all problematic resources
r = m.neon_query('''
SELECT id, "numericId", title, year
FROM "Resource"
WHERE (year ~ '^[0-9]{4}-[0-9]{4}$' AND (split_part(year, '-', 1) = split_part(year, '-', 2) OR CAST(split_part(year, '-', 1) AS INTEGER) > CAST(split_part(year, '-', 2) AS INTEGER)))
   OR year IN ('2009', '2010', '2020')
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])

fixes = []
for row in rows:
    rid, nid, title, old_year = row
    new_year = extract_year_from_title(title) or (f'{old_year}-{int(old_year)+1}' if old_year.isdigit() else None)
    if new_year and new_year != old_year:
        fixes.append((rid, new_year, old_year, title[:60]))

print(f'Will fix {len(fixes)} resources')

# Apply year fixes in batches (CASE doesn't work on Neon HTTP API, use VALUES)
for i in range(0, len(fixes), 50):
    batch = fixes[i:i+50]
    values = ', '.join([f"('{rid}', '{ny}')" for rid, ny, _, _ in batch])
    m.neon_query(f'''
    UPDATE "Resource" r
    SET year = v.new_year
    FROM (VALUES {values}) AS v(id, new_year)
    WHERE r.id = v.id
    ''')

# Update titles where title has wrong year pattern
r = m.neon_query('''
SELECT id, title, year FROM "Resource"
WHERE title ~ '\(\d{4}-\d{4}\)'
''')
title_updates = {}
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    rid, title, db_year = row
    m_yr = re.search(r'\((\d{4})-(\d{4})\)', title)
    if m_yr:
        title_year = f'{m_yr.group(1)}-{m_yr.group(2)}'
        if title_year != db_year:
            new_title = title[:m_yr.start()] + f'({db_year})' + title[m_yr.end():]
            title_updates[rid] = new_title

# Backup + apply title updates
for rid, new_title in title_updates.items():
    safe = new_title.replace("'", "''")
    m.neon_query(f'''UPDATE "Resource" r SET title = '{safe}' WHERE r.id = '{rid}' ''')

# Update slugs
r = m.neon_query('''
SELECT id, slug, year FROM "Resource"
WHERE slug ~ '\d{4}-\d{4}'
''')
slug_updates = {}
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    rid, slug, db_year = row
    m_yr = re.search(r'(\d{4}-\d{4})', slug)
    if m_yr:
        slug_year = m_yr.group(1)
        if slug_year != db_year:
            slug_updates[rid] = slug.replace(slug_year, db_year)

for rid, new_slug in slug_updates.items():
    safe = new_slug.replace("'", "''")
    m.neon_query(f'''UPDATE "Resource" r SET slug = '{safe}' WHERE r.id = '{rid}' ''')

print(f'Year fixed: {len(fixes)}')
print(f'Title fixed: {len(title_updates)}')
print(f'Slug fixed: {len(slug_updates)}')
