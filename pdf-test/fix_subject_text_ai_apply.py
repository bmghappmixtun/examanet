#!/usr/bin/env python3
"""
Apply reclassifications from text_ai_validated.csv (122 cases).

For each validated case:
1. Backup old subjectId to ResourceSubjectReclassify
2. Update Resource.subjectId
3. Search vector trigger updates automatically
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
    subject_id_by_slug = {}
    for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
        subject_id_by_slug[row[1]] = row[0]
    
    # Load validated
    rows = []
    with open('/workspace/edutunisie/pdf-test/text_ai_validated.csv', 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    
    print(f'Total validated to reclassify: {len(rows)}')
    
    if not apply:
        print('\n*** DRY RUN ***')
        for r in rows[:10]:
            print(f'  NID {r["nid"]}: {r["db_subj"]} → {r["ai_new"]} (class={r["class_slug"]}, section={r["section_slug"]}, conf={r["confidence"]}%)')
        print(f'\nUse --apply to actually update')
        return
    
    # Apply
    print(f'\nApplying {len(rows)} reclassifications...')
    
    # Ensure backup table
    m.neon_query("""
        CREATE TABLE IF NOT EXISTS "ResourceSubjectReclassify" (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            "resourceId" TEXT NOT NULL,
            "numericId" INTEGER,
            "oldSubjectSlug" TEXT,
            "newSubjectSlug" TEXT,
            "aiSubject" TEXT,
            "aiTitle" TEXT,
            "changedAt" TIMESTAMP DEFAULT NOW(),
            "changedBy" TEXT
        )
    """)
    
    updated = 0
    errors = 0
    for i, r in enumerate(rows, 1):
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
                VALUES ('{rid}', {nid}, '{old_slug}', '{new_slug}', 'fix_subject_text_ai')
            """)
            
            # Update
            m.neon_query(f"""
                UPDATE "Resource" 
                SET "subjectId" = '{new_id}', "updatedAt" = NOW()
                WHERE id = '{rid}'
            """)
            updated += 1
            
            if i % 30 == 0 or i == len(rows):
                print(f'  [{i}/{len(rows)}] done', flush=True)
        except Exception as e:
            errors += 1
            if errors <= 5:
                print(f'  [ERR] NID {r["nid"]}: {str(e)[:200]}')
    
    print(f'\n✅ Updated: {updated}')
    print(f'❌ Errors: {errors}')

if __name__ == '__main__':
    main()
