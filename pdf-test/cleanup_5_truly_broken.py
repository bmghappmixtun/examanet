#!/usr/bin/env python3
"""
Safe delete of 5 truly broken PDF resources (NID 92, 94, 15335, 15336, 15337).
All confirmed 404 on Vercel Blob. None belong to admin account.
"""
import os, json, sys, importlib.util
from datetime import datetime

spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

KEEP_EMAILS = ['boutiti.mehdi@gmail.com']  # ⚠️ ADMIN - NEVER DELETE
NIDS_TO_DELETE = [92, 94, 15335, 15336, 15337]

def main():
    # 1. SAFETY CHECK
    print('=== SAFETY CHECK ===')
    
    # 1a. Verify none belong to admin
    r = m.neon_query(f'''
    SELECT r."numericId", u.email
    FROM "Resource" r
    LEFT JOIN "User" u ON u.id = r."teacherId"
    WHERE r."numericId" IN ({','.join(str(n) for n in NIDS_TO_DELETE)})
      AND u.email = ANY(ARRAY[{','.join(repr(e) for e in KEEP_EMAILS)}])
    ''')
    admin_check = r.get('response', [{}])[0].get('data', {}).get('rows', [])
    if admin_check:
        print('⚠️ ABORT: One of these resources belongs to admin!')
        for row in admin_check:
            print(f'  NID {row[0]} - email: {row[1]}')
        return False
    print('✓ None belong to admin')
    
    # 1b. Verify all 5 are confirmed 404 on Vercel (re-check)
    import urllib.request
    for nid in NIDS_TO_DELETE:
        r = m.neon_query(f'SELECT "fileKey" FROM "Resource" WHERE "numericId" = {nid}')
        fk = r.get('response', [{}])[0].get('data', {}).get('rows', [])[0][0]
        url = f'https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com/{fk}'
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=10) as r:
                print(f'⚠️ NID {nid} file EXISTS (status {r.status}) - SKIP deletion')
                return False
        except urllib.error.HTTPError as e:
            if e.code == 404:
                print(f'✓ NID {nid} confirmed 404 (file deleted from Vercel)')
            else:
                print(f'? NID {nid} HTTP {e.code} - investigate')
    
    # 2. SNAPSHOT current state (for potential manual rollback)
    print()
    print('=== SNAPSHOT (for potential rollback) ===')
    snapshot = {
        'timestamp': datetime.utcnow().isoformat(),
        'nids': NIDS_TO_DELETE,
        'resources': [],
    }
    r = m.neon_query(f'''
    SELECT r."numericId", r.title, r."fileKey", r."fileUrl", r."fileSize", r."teacherId",
           u.email, r."createdAt", r."downloadsCount", r."viewsCount", r."favoritesCount"
    FROM "Resource" r
    LEFT JOIN "User" u ON u.id = r."teacherId"
    WHERE r."numericId" IN ({','.join(str(n) for n in NIDS_TO_DELETE)})
    ''')
    for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
        snapshot['resources'].append({
            'numericId': row[0],
            'title': row[1],
            'fileKey': row[2],
            'fileUrl': row[3],
            'fileSize': row[4],
            'teacherId': row[5],
            'teacherEmail': row[6],
            'createdAt': str(row[7]),
            'downloads': row[8],
            'views': row[9],
            'favorites': row[10],
        })
    
    snapshot_file = '/workspace/edutunisie/pdf-test/cleanup_5_snapshot.json'
    with open(snapshot_file, 'w') as f:
        json.dump(snapshot, f, indent=2, default=str)
    print(f'✓ Snapshot saved to {snapshot_file}')
    
    # 3. DELETE related records first
    print()
    print('=== DELETING RELATED RECORDS ===')
    related_tables = [
        'View', 'TeacherFile', 'Comment', 'Download', 'Share', 'Report', 
        'Rating', 'Favorite', 'ResourceContent', 'ResourceTitleBackup', 
        'ResourceAttributeBackup', 'ResourceMetadata', 'ResourceSummary',
        'ResourceMetadataExtra', 'ResourceSubjectReclassify', 'ResourceSubjectBackup',
    ]
    for table in related_tables:
        sql = f'''
        DELETE FROM "{table}" 
        WHERE "resourceId" IN (SELECT id FROM "Resource" WHERE "numericId" IN ({','.join(str(n) for n in NIDS_TO_DELETE)}))
        '''
        try:
            r = m.neon_query(sql)
            success = r.get('success', False)
            # Get deleted count
            cnt_sql = f'''
            SELECT COUNT(*) FROM "{table}" 
            WHERE "resourceId" IN (SELECT id FROM "Resource" WHERE "numericId" IN ({','.join(str(n) for n in NIDS_TO_DELETE)}))
            '''
            r2 = m.neon_query(cnt_sql)
            remaining = r2.get('response', [{}])[0].get('data', {}).get('rows', [])[0][0]
            print(f'  {table}: success={success}, remaining={remaining}')
        except Exception as e:
            print(f'  {table}: ERROR {str(e)[:80]}')
    
    # 4. DELETE the Resources
    print()
    print('=== DELETING RESOURCES ===')
    r = m.neon_query(f'''
    DELETE FROM "Resource" 
    WHERE "numericId" IN ({','.join(str(n) for n in NIDS_TO_DELETE)})
    RETURNING "numericId"
    ''')
    print(f'Delete result: {r}')
    deleted = r.get('response', [{}])[0].get('data', {}).get('rows', [])
    print(f'Deleted {len(deleted)} resources')
    
    # 5. VERIFY
    print()
    print('=== VERIFY ===')
    r = m.neon_query(f"SELECT COUNT(*) FROM \"Resource\" WHERE \"numericId\" IN ({','.join(str(n) for n in NIDS_TO_DELETE)})")
    remaining = r.get('response', [{}])[0].get('data', {}).get('rows', [])[0][0]
    print(f'Remaining of these NIDs: {remaining}')
    
    # Final coverage
    r = m.neon_query('''
    SELECT 
      (SELECT COUNT(*) FROM "Resource") as total,
      (SELECT COUNT(*) FROM "ResourceContent") as has_content,
      (SELECT COUNT(*) FROM "ResourceContent" WHERE LENGTH("fullText") >= 100) as exploitable
    ''')
    for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
        print(f'Final: {row[0]} resources, {row[1]} with content ({100*int(row[1])/int(row[0]):.2f}%)')
        print(f'Exploitable: {row[2]} ({100*int(row[2])/int(row[0]):.2f}%)')
    
    return True

if __name__ == '__main__':
    success = main()
    if not success:
        sys.exit(1)
    print()
    print('✅ CLEANUP COMPLETE')
