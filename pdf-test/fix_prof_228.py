#!/usr/bin/env python3
"""Fix prof 228 name from 'الفزيري' to 'الغربي' based on email evidence.
Also update all 39 linked resource titles."""
import importlib.util, re

spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

PROF_ID = 'cmqxizlhv000gfxx22n2ubzwo'

# 1. Update User table: lastNameAr = 'الغربي'
r = m.neon_query(f'''UPDATE "User" SET "lastNameAr" = 'الغربي' 
                    WHERE id = '{PROF_ID}' ''')
print('1. User.lastNameAr updated: الغزيري → الغربي')

# Verify
r = m.neon_query(f'''SELECT "firstName", "lastName", "firstNameAr", "lastNameAr" 
                    FROM "User" WHERE id = '{PROF_ID}' ''')
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    print(f'   New: {row[2]} {row[3]}')

# 2. Update all 39 resource titles: replace "فوزي الغزيري" with "فوزي الغربي"
r = m.neon_query(f'''SELECT id, title FROM "Resource" WHERE "teacherId" = '{PROF_ID}' ''')
targets = [{'id': row[0], 'title': str(row[1])} 
           for row in r.get('response', [{}])[0].get('data', {}).get('rows', [])]
print(f'\n2. Updating {len(targets)} resource titles...')

updated = 0
for t in targets:
    old = t['title']
    if 'فوزي الغزيري' in old:
        new = old.replace('فوزي الغزيري', 'فوزي الغربي')
        new_clean = new.replace("'", "''")
        m.neon_query(f"UPDATE \"Resource\" SET title = '{new_clean}' WHERE id = '{t['id']}'")
        updated += 1
    elif 'الغزيري' in old:
        # Other variations
        new = old.replace('الغزيري', 'الغربي')
        new_clean = new.replace("'", "''")
        m.neon_query(f"UPDATE \"Resource\" SET title = '{new_clean}' WHERE id = '{t['id']}'")
        updated += 1

print(f'   Updated {updated} titles')

# Verify
r = m.neon_query(f'''SELECT LEFT(title, 100) FROM "Resource" 
                    WHERE "teacherId" = '{PROF_ID}' AND title LIKE '%الغربي%' LIMIT 5''')
print('\n=== After fix (sample) ===')
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    print(f'   {row[0]}')
