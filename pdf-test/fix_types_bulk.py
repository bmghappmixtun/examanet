#!/usr/bin/env python3
"""Bulk fix_types using batches of 200."""
import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

spec2 = importlib.util.spec_from_file_location('fix_types', '/workspace/edutunisie/pdf-test/fix_types.py')
ft = importlib.util.module_from_spec(spec2)
spec2.loader.exec_module(ft)


def main():
    rows = ft.get_mismatches(limit=None)
    print(f'Total with AI type: {len(rows)}')
    
    to_update = []
    for rid, nid, db_type, ai_type in rows:
        new_type = ft.normalize(ai_type)
        if not new_type or new_type == db_type:
            continue
        to_update.append((rid, nid, db_type, ai_type, new_type))
    
    print(f'To update: {len(to_update)}')
    
    BATCH = 200
    updated = 0
    errors = 0
    for i in range(0, len(to_update), BATCH):
        batch = to_update[i:i+BATCH]
        case_sql = 'CASE id '
        for rid, nid, db, ai, new in batch:
            case_sql += f"WHEN '{rid}' THEN '{new}' "
        case_sql += 'END'
        ids_sql = "', '".join(r[0] for r in batch)
        
        try:
            r = mod.neon_query(f"""
                UPDATE "Resource" 
                SET type = {case_sql}, "updatedAt" = NOW()
                WHERE id IN ('{ids_sql}')
            """)
            if r.get('success'):
                updated += len(batch)
                print(f'  [{i+len(batch)}/{len(to_update)}] ✓', flush=True)
            else:
                errors += len(batch)
                print(f'  [ERR] batch {i}: {r.get("error", str(r))[:200]}')
        except Exception as e:
            errors += len(batch)
            print(f'  [ERR] batch {i}: {str(e)[:200]}')
    
    print(f'\n✅ Updated: {updated}')
    print(f'❌ Errors: {errors}')


if __name__ == '__main__':
    main()
