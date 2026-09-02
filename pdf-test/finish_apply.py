#!/usr/bin/env python3
"""Finish the 239 remaining keyPoints apply."""
import os, json, urllib.request, sys, time

def q(sql):
    body = {'db_name': 'neondb', 'role_name': 'neondb_owner', 'query': sql, 'branch_id': 'br-purple-recipe-as2x8yyo'}
    req = urllib.request.Request(
        'https://console.neon.tech/api/v2/projects/little-silence-94324724/query',
        data=json.dumps(body).encode(),
        headers={'Authorization': f'Bearer {os.environ["NEON_API_KEY"]}', 'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

# Get remaining
res = q("""
SELECT
  r.id as rid,
  rms."keyPoints"::text as staging_kp,
  rms.subject as staging_subject
FROM "Resource" r
JOIN "Subject" s ON r."subjectId" = s.id
LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
JOIN "ResourceMetadataStaging" rms ON rms."resourceId" = r.id
WHERE s.slug = 'mathematiques' AND r."classId" IN (SELECT id FROM "Class" WHERE slug IN ('7eme','8eme','9eme'))
  AND (rm."keyPoints" IS NULL OR array_length(rm."keyPoints", 1) = 0)
ORDER BY r."numericId" ASC;
""")
rows = res.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'Processing {len(rows)} remaining...', flush=True)

ok = 0
err = 0
start = time.time()
for i, (rid, kp_str, subject) in enumerate(rows):
    if subject:
        subj_esc = subject.replace("'", "''")
    else:
        subj_esc = ''
    # Escape single quotes in the array literal (e.g., "d'équations" inside
    # {"a","d'équations","b"} would break the SQL string).
    kp_esc = kp_str.replace("'", "''") if kp_str else ''
    sql = f"""UPDATE "ResourceMetadata" SET "keyPoints" = '{kp_esc}'::text[], topics = ARRAY['{subj_esc}']::text[] WHERE "resourceId" = '{rid}';"""
    try:
        q(sql)
        ok += 1
    except Exception as e:
        err += 1
        if err < 3:
            print(f'  Err #{i}: {str(e)[:200]}', flush=True)
    if (i+1) % 50 == 0:
        elapsed = time.time() - start
        rate = (i+1) / elapsed
        print(f'  {i+1}/{len(rows)} done in {elapsed:.0f}s ({rate:.1f}/s)', flush=True)

elapsed = time.time() - start
print(f'\nOK: {ok}, ERR: {err}, Total: {elapsed:.0f}s', flush=True)

# Verify
res = q("""SELECT COUNT(*) FILTER (WHERE rm."keyPoints" IS NOT NULL AND array_length(rm."keyPoints", 1) > 0) as has_kp FROM "ResourceMetadata" rm JOIN "Resource" r ON r.id = rm."resourceId" JOIN "Subject" s ON r."subjectId" = s.id WHERE s.slug = 'mathematiques' AND r."classId" IN (SELECT id FROM "Class" WHERE slug IN ('7eme','8eme','9eme'))""")
print(f'Final: {res.get("response", [{}])[0].get("data", {}).get("rows", [])}', flush=True)
