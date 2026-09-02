#!/usr/bin/env python3
"""
Bulk AI extraction for remaining files (math + other subjects).
Fix: prefer fileUrl (with hash) over fileKey (may be truncated).
"""
import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import time

# Main loop — get all remaining Devoirat resources and process them
print('=== STARTING bulk_remaining ===')
print('Processing ALL remaining Devoirat resources (all subjects)...')

worker_id = int(sys.argv[1]) if len(sys.argv) > 1 else 0
total_workers = int(sys.argv[2]) if len(sys.argv) > 2 else 1

while True:
    result = m.neon_query(f"""
        SELECT r.id, r.\"fileKey\", r.\"fileUrl\", r.title, s.slug as subject_slug, c.slug as class_slug
        FROM \"Resource\" r
        JOIN \"User\" u ON u.id = r.\"teacherId\"
        LEFT JOIN \"Subject\" s ON s.id = r.\"subjectId\"
        LEFT JOIN \"Class\" c ON c.id = r.\"classId\"
        LEFT JOIN \"ResourceMetadata\" rm ON rm.\"resourceId\" = r.id
        WHERE r.status = 'PUBLISHED'
          AND u.bio LIKE '%evoirat%'
          AND r.\"fileKey\" IS NOT NULL
          AND LENGTH(r.\"fileKey\") > 5
          AND rm.id IS NULL
          AND (abs(hashtext(r.id)) % {total_workers}) = {worker_id}
        ORDER BY r.\"numericId\" DESC
        LIMIT 50
    """)
    
    rows = result.get('response', [{}])[0].get('data', {}).get('rows', [])
    if not rows:
        print('No more resources!')
        break
    
    cols = ['id', 'fileKey', 'fileUrl', 'title', 'subject_slug', 'class_slug']
    ok_count = 0
    fail_count = 0
    
    for row in rows:
        r = dict(zip(cols, row))
        try:
            ok, cost = m.process_resource(r, lambda x: print(f'  {x[:100]}'))
            if ok:
                ok_count += 1
            else:
                fail_count += 1
        except Exception as e:
            print(f'  EXC: {r["id"][:20]}: {str(e)[:100]}')
            fail_count += 1
    
    print(f'Batch done: +{ok_count} ok, +{fail_count} fail')
    time.sleep(0.5)

print('=== COMPLETE ===')
