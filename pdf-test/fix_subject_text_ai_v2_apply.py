#!/usr/bin/env python3
"""
Apply 124 curriculum-validated reclassifications from text_ai_v2_apply.csv
"""
import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import csv

def main():
    apply = '--apply' in sys.argv
    
    # Get subject IDs
    r = m.neon_query('SELECT id, slug FROM "Subject"')
    subject_id_by_slug = {row[1]: row[0] for row in r.get('response', [{}])[0].get('data', {}).get('rows', [])}
    
    # Load validated
    apply_rows = []
    skip_rows = []
    with open('/workspace/edutunisie/pdf-test/text_ai_v2_apply.csv', 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get('action') == 'apply':
                apply_rows.append(row)
            elif row.get('action') == 'skip':
                skip_rows.append(row)
    
    print(f'To apply: {len(apply_rows)}')
    print(f'Skipped: {len(skip_rows)}')
    
    if not apply:
        print('\n*** DRY RUN ***')
        from collections import Counter
        dist = Counter(f"{a['db_subj']} -> {a['ai_new']}" for a in apply_rows)
        for x, c in dist.most_common(20):
            print(f'  {x:<40} {c}')
        print(f'\nUse --apply to actually update')
        return
    
    # Apply
    print(f'\nApplying {len(apply_rows)} reclassifications...')
    
    updated = 0
    errors = 0
    for i, r in enumerate(apply_rows, 1):
        try:
            rid = r['rid']
            nid = r['nid']
            old_slug = r['db_subj']
            new_slug = r['ai_new']
            conf = r['confidence']
            
            if new_slug not in subject_id_by_slug:
                errors += 1
                continue
            
            new_id = subject_id_by_slug[new_slug]
            
            # Backup
            m.neon_query(f"""
                INSERT INTO "ResourceSubjectReclassify" 
                ("resourceId", "numericId", "oldSubjectSlug", "newSubjectSlug", "changedBy")
                VALUES ('{rid}', {nid}, '{old_slug}', '{new_slug}', 'fix_subject_text_ai_v2')
            """)
            
            # Update
            m.neon_query(f"""
                UPDATE "Resource" 
                SET "subjectId" = '{new_id}', "updatedAt" = NOW()
                WHERE id = '{rid}'
            """)
            updated += 1
            
            if i % 30 == 0 or i == len(apply_rows):
                print(f'  [{i}/{len(apply_rows)}] done', flush=True)
        except Exception as e:
            errors += 1
            if errors <= 5:
                print(f'  [ERR] NID {r["nid"]}: {str(e)[:200]}')
    
    print(f'\n✅ Updated: {updated}')
    print(f'❌ Errors: {errors}')

if __name__ == '__main__':
    main()
