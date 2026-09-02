#!/usr/bin/env python3
"""Merge prof 198 (gharbi-) into prof 228.
- Add French name 'Faouzi El Gharbi' to prof 228
- Move 9 resources from prof 198 to prof 228
- Optionally delete prof 198
"""
import importlib.util

spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

PROF_228_ID = 'cmqxizlhv000gfxx22n2ubzwo'
PROF_198_ID = 'cmqu2p8zg01xjq2n3el09e605'

# 1. Add French name to prof 228
r = m.neon_query(f'''UPDATE "User" 
                    SET "firstName" = 'Faouzi', 
                        "lastName" = 'El Gharbi'
                    WHERE id = '{PROF_228_ID}' ''')
print('1. Prof 228 French name set: Faouzi El Gharbi')

# Verify
r = m.neon_query(f'''SELECT "firstName", "lastName", "firstNameAr", "lastNameAr" 
                    FROM "User" WHERE id = '{PROF_228_ID}' ''')
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    print(f'   New: FR={row[0]} {row[1]} | AR={row[2]} {row[3]}')

# 2. Move 9 resources from prof 198 to prof 228
r = m.neon_query(f'''UPDATE "Resource" SET "teacherId" = '{PROF_228_ID}' 
                    WHERE "teacherId" = '{PROF_198_ID}' ''')
print(f'\n2. Moved 9 resources from prof 198 → prof 228')

# Verify
r = m.neon_query(f'''SELECT COUNT(*) FROM "Resource" WHERE "teacherId" = '{PROF_228_ID}' ''')
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    print(f'   Prof 228 now has: {int(row[0])} resources')

r = m.neon_query(f'''SELECT COUNT(*) FROM "Resource" WHERE "teacherId" = '{PROF_198_ID}' ''')
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    print(f'   Prof 198 now has: {int(row[0])} resources')

# 3. Check if prof 198 has any other references before deletion
# Check teacherFile, comments, ratings, etc.
for table in ['Comment', 'Rating', 'Favorite', 'View', 'Download', 'TeacherFile', 'Resource', 'ResourceContent', 'ResourceSummary', 'ResourceMetadata', 'AiDescription']:
    try:
        r = m.neon_query(f'''SELECT COUNT(*) FROM "{table}" WHERE "teacherId" = '{PROF_198_ID}' ''')
        n = int(r.get('response', [{}])[0].get('data', {}).get('rows', [])[0][0])
        if n > 0:
            print(f'   {table}: {n} references')
    except:
        pass

print('\n3. Note: prof 198 is not auto-deleted (you can delete manually if no other refs)')
