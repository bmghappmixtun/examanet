import os, re, importlib.util, time
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

def gen_meta(summary):
    s = summary.strip()
    for i, c in enumerate(s):
        if c in '.!?' and i > 50:
            return s[:i+1][:155]
    return s[:155]

total = 0
BATCH = 100
start = time.time()
while True:
    r = m.neon_query(f"SELECT r.id, rs.summary FROM \"Resource\" r JOIN \"ResourceSummary\" rs ON rs.\"resourceId\" = r.id WHERE LENGTH(COALESCE(r.description, '')) = 0 AND LENGTH(COALESCE(rs.summary, '')) > 50 LIMIT {BATCH}")
    rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
    if not rows:
        break
    case_desc = []
    case_meta = []
    ids = []
    for row in rows:
        rid, summary = row
        summary_clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', summary)
        meta = gen_meta(summary_clean)
        case_desc.append(f"WHEN id = '{rid}' THEN $${summary_clean}$$")
        case_meta.append(f"WHEN id = '{rid}' THEN $${meta}$$")
        ids.append(f"'{rid}'")
    sql = f'UPDATE "Resource" SET description = CASE {" ".join(case_desc)} END, "metaDescription" = CASE {" ".join(case_meta)} END, "descriptionGeneratedAt" = NOW(), "descriptionSource" = COALESCE("descriptionSource", \'copied-from-summary\') WHERE id IN ({",".join(ids)})'
    m.neon_query(sql)
    total += len(rows)
    elapsed = time.time() - start
    rate = total / elapsed if elapsed > 0 else 0
    eta = (9490 - total) / rate if rate > 0 else 0
    print(f'[{total:5d}/9490] {rate:.1f}/s, ETA {eta/60:.0f}min', flush=True)
    if len(rows) < BATCH:
        break
print(f'\nDone: {total}')
