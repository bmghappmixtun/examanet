import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

# NID 13881 - add N°X to Bac Blanc title
r = m.neon_query("SELECT id, title, \"homeworkNumber\" FROM \"Resource\" WHERE \"numericId\" = 13881")
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    rid, title, hwn = row
    new_title = title.replace('Devoir de Synthèse Bac Blanc', f'Devoir de Synthèse Bac Blanc N°{hwn}')
    print(f'OLD: {title}')
    print(f'NEW: {new_title}')
    
    # Backup
    m.neon_query(f'''
    INSERT INTO "ResourceTitleBackup" ("resourceId", "numericId", "oldTitle", "newTitle", "regeneratedAt", "regeneratedBy")
    VALUES ('{rid}', 13881, '{title.replace("'", "''")}', '{new_title.replace("'", "''")}', NOW(), 'fix_13881_nx')
    ON CONFLICT ("resourceId") DO UPDATE SET "oldTitle" = EXCLUDED."oldTitle", "newTitle" = EXCLUDED."newTitle", "regeneratedAt" = NOW(), "regeneratedBy" = EXCLUDED."regeneratedBy"
    ''')
    
    m.neon_query(f'''
    UPDATE "Resource" SET title = '{new_title.replace("'", "''")}' WHERE id = '{rid}'
    ''')
    print('  ✓ Updated')

# Final check
r = m.neon_query('''
SELECT 
  COUNT(*) FILTER (WHERE type = 'HOMEWORK' AND "homeworkSubtype" IS NOT NULL AND "homeworkSubtype" != '' AND "homeworkNumber" IS NOT NULL AND (title LIKE '%N°%' OR title LIKE '%N.%')) as with_nx,
  COUNT(*) FILTER (WHERE type = 'HOMEWORK' AND "homeworkSubtype" IS NOT NULL AND "homeworkSubtype" != '' AND "homeworkNumber" IS NOT NULL) as total_with_subtype
FROM "Resource"
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
if rows:
    total = int(rows[0][1])
    with_nx = int(rows[0][0])
    pct = with_nx / total * 100 if total else 0
    print(f'\n=== FINAL ===')
    print(f'HOMEWORK with subtype+hwn: {total}')
    print(f'Title has N°X: {with_nx}')
    print(f'Coverage: {pct:.2f}%')
