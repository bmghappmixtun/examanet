#!/usr/bin/env python3
"""Merge prof 191 (faouzi-gharbi) into prof 228.
Same person: Faouzi El Gharbi / Faouzi Gharbi - Al-Gharbi in Arabic.
"""
import importlib.util
spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

PROF_228_ID = 'cmqxizlhv000gfxx22n2ubzwo'
PROF_191_ID = 'cmqu2nnfx01tdq2n33bdhkwxt'

# 1. Move 1 resource
m.neon_query(f'''UPDATE "Resource" SET "teacherId" = '{PROF_228_ID}' 
                WHERE "teacherId" = '{PROF_191_ID}' ''')
print('1. Moved 1 resource from prof 191 → prof 228')

# 2. Transfer TeacherFile
m.neon_query(f'''UPDATE "TeacherFile" SET "teacherId" = '{PROF_228_ID}' 
                WHERE "teacherId" = '{PROF_191_ID}' ''')
print('2. Transferred 1 TeacherFile to prof 228')

# 3. Delete prof 191
m.neon_query(f'''DELETE FROM "User" WHERE id = '{PROF_191_ID}' ''')
print('3. Prof 191 deleted')

# Verify
r = m.neon_query(f'''SELECT COUNT(*) FROM "Resource" WHERE "teacherId" = '{PROF_228_ID}' ''')
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    print(f'   Prof 228 total resources: {int(row[0])}')
