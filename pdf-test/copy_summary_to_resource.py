#!/usr/bin/env python3
"""Copy ResourceSummary.summary -> Resource.description for all."""
import os, json, re, importlib.util, time

spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

PROGRESS = '/workspace/edutunisie/pdf-test/copy_summary_progress.json'

def gen_meta(summary):
    summary = summary.strip()
    for i, c in enumerate(summary):
        if c in '.!?' and i > 50:
            meta = summary[:i+1]
            break
    else:
        meta = summary[:155]
    if len(meta) > 155:
        meta = meta[:152] + '...'
    return meta

total = 0
BATCH = 200
start = time.time()

# Load progress
done = set()
if os.path.exists(PROGRESS):
    with open(PROGRESS) as f:
        done = set(json.load(f).get('done', []))

while True:
    r = m.neon_query(f'''
    SELECT r.id, rs.summary
    FROM "Resource" r
    JOIN "ResourceSummary" rs ON rs."resourceId" = r.id
    WHERE LENGTH(COALESCE(r.description, '')) = 0
      AND LENGTH(COALESCE(rs.summary, '')) > 50
      AND r.id NOT IN ({','.join(repr(d) for d in done) if done else "''"})
    LIMIT {BATCH}
    ''')
    rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
    if not rows:
        break
    
    for row in rows:
        rid, summary = row
        summary_clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', summary)
        meta = gen_meta(summary_clean)
        sql = f'''
        UPDATE "Resource"
        SET description = $${summary_clean}$$,
            "metaDescription" = $${meta}$$,
            "descriptionGeneratedAt" = NOW(),
            "descriptionSource" = COALESCE("descriptionSource", 'copied-from-summary')
        WHERE id = '{rid}'
        '''
        m.neon_query(sql)
        total += 1
        done.add(rid)
    
    elapsed = time.time() - start
    rate = total / elapsed if elapsed > 0 else 0
    eta = (9490 - total) / rate if rate > 0 else 0
    print(f'[{total:5d}/9490] {rate:.1f}/s, ETA {eta/60:.0f}min')
    with open(PROGRESS, 'w') as f:
        json.dump({'done': list(done)}, f)
    
    if len(rows) < BATCH:
        break

print(f'\n✅ Copied {total} AI descriptions')
