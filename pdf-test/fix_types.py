#!/usr/bin/env python3
"""
Normalize Resource.type to match DB enum convention (uppercase).

Mapping:
  AI 'devoir' / 'EXAM' / 'HOMEWORK' → DB 'HOMEWORK'
  AI 'EXERCISE' / 'série' / 'REVISION' → DB 'EXERCISE'
  AI 'cours' / 'COURSE' → DB 'COURSE'
  AI 'SUMMARY' → DB 'SUMMARY'
  Already-correct values (HOMEWORK, EXERCISE, COURSE, OTHER, SUMMARY, BAC_SUBJECT) → skip

Usage:
  ./venv/bin/python fix_types.py              # dry-run
  ./venv/bin/python fix_types.py --apply      # actually update
  ./venv/bin/python fix_types.py --limit=10   # only 10 files
"""
import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import re

# AI → DB type mapping
AI_TO_DB_TYPE = {
    'devoir': 'HOMEWORK',
    'homework': 'HOMEWORK',
    'exam': 'HOMEWORK',
    'examen': 'HOMEWORK',
    'test': 'HOMEWORK',
    'controle': 'HOMEWORK',
    'synthese': 'HOMEWORK',
    'maison': 'HOMEWORK',
    'cours': 'COURSE',
    'course': 'COURSE',
    'leçon': 'COURSE',
    'lecon': 'COURSE',
    'resume': 'SUMMARY',
    'summary': 'SUMMARY',
    'résumé': 'SUMMARY',
    'exercice': 'EXERCISE',
    'exercise': 'EXERCISE',
    'série': 'EXERCISE',
    'serie': 'EXERCISE',
    'révision': 'EXERCISE',
    'revision': 'EXERCISE',
    'révisions': 'EXERCISE',
}

VALID_DB_TYPES = {'HOMEWORK', 'EXERCISE', 'COURSE', 'OTHER', 'SUMMARY', 'BAC_SUBJECT'}

def normalize(ai_type):
    if not ai_type:
        return None
    if ai_type.upper() in VALID_DB_TYPES:
        return ai_type.upper()
    key = ai_type.lower().strip()
    return AI_TO_DB_TYPE.get(key)


def get_mismatches(limit=None):
    lim = f'LIMIT {limit}' if limit else ''
    r = m.neon_query(f"""
        SELECT r.id, r."numericId", r.type as db_type, rm.type as ai_type
        FROM "Resource" r
        JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
        WHERE r.status = 'PUBLISHED' AND rm.type IS NOT NULL AND rm.type != ''
        {lim}
    """)
    return r.get('response', [{}])[0].get('data', {}).get('rows', [])


def main():
    apply = '--apply' in sys.argv
    limit = None
    for arg in sys.argv[1:]:
        if arg.startswith('--limit='):
            limit = int(arg.split('=')[1])
        elif arg.isdigit():
            limit = int(arg)
    
    rows = get_mismatches(limit=limit)
    print(f'Total with AI type: {len(rows)}')
    
    to_update = []
    already_correct = 0
    unmapped = {}
    for rid, nid, db_type, ai_type in rows:
        new_type = normalize(ai_type)
        if not new_type:
            unmapped[ai_type] = unmapped.get(ai_type, 0) + 1
            continue
        if new_type == db_type:
            already_correct += 1
            continue
        to_update.append((rid, nid, db_type, ai_type, new_type))
    
    print(f'Already correct: {already_correct}')
    print(f'To update: {len(to_update)}')
    
    # Distribution
    dist = {}
    for _, _, db, ai, new in to_update:
        k = f'{db}({ai}) → {new}'
        dist[k] = dist.get(k, 0) + 1
    print('\nDistribution:')
    for k, v in sorted(dist.items(), key=lambda x: -x[1])[:15]:
        print(f'  {v:4} × {k}')
    
    if unmapped:
        print('\nUnmapped AI types:')
        for t, c in sorted(unmapped.items(), key=lambda x: -x[1]):
            print(f'  {c:4} × {t}')
    
    # Show samples
    if to_update:
        print('\nFirst 10 samples:')
        for rid, nid, db, ai, new in to_update[:10]:
            print(f'  NID {nid}: DB={db} AI={ai!r} → {new}')
    
    if not apply:
        print('\n*** DRY RUN - use --apply to update ***')
        return
    
    print(f'\nApplying {len(to_update)} updates...')
    updated = 0
    errors = 0
    for i, (rid, nid, db, ai, new) in enumerate(to_update, 1):
        try:
            r = m.neon_query(f"""
                UPDATE "Resource" SET type = '{new}', "updatedAt" = NOW()
                WHERE id = '{rid}'
            """)
            if r.get('success'):
                updated += 1
                if i % 50 == 0 or i == len(to_update):
                    print(f'  [{i}/{len(to_update)}]')
            else:
                errors += 1
                if errors <= 5:
                    print(f'  [ERR] NID {nid}: {r}')
        except Exception as e:
            errors += 1
            if errors <= 5:
                print(f'  [ERR] NID {nid}: {e}')
    
    print(f'\n✅ Updated: {updated}')
    print(f'❌ Errors: {errors}')


if __name__ == '__main__':
    main()
