#!/usr/bin/env python3
"""
Finalize the Math collège apply run: mark all 'unchanged' staging records
(isApplied=false with no actual changes needed) as isApplied=true, so
future apply runs skip them.

Safe because the dry-run (apply_staging_canonical.py) just confirmed:
  - 547 Math collège records processed
  - 0 would change (all already canonical or live fields already set)

Snapshot before this: snap-steep-poetry-as61zue9
"""
import os, json, urllib.request

NEON_API_KEY = os.environ.get('NEON_API_KEY', '')
NEON_PROJECT = 'little-silence-94324724'
BRANCH_ID = 'br-purple-recipe-as2x8yyo'
ROLE = 'edutunisie_app'

def q(sql):
    body = {'db_name': 'neondb', 'role_name': ROLE, 'query': sql, 'branch_id': BRANCH_ID}
    req = urllib.request.Request(
        f'https://console.neon.tech/api/v2/projects/{NEON_PROJECT}/query',
        data=json.dumps(body).encode(),
        headers={'Authorization': f'Bearer {NEON_API_KEY}', 'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def main():
    print('═══ Finalizing Math collège apply (marking unchanged as applied) ═══\n')

    # Mark all remaining Math collège (7eme/8eme/9eme) as applied
    sql = """
    UPDATE "ResourceMetadataStaging" SET "isApplied" = true
    WHERE "isApplied" = false
      AND "resourceId" IN (
        SELECT r.id FROM "Resource" r
        JOIN "Subject" s ON r."subjectId" = s.id
        JOIN "Class" c ON r."classId" = c.id
        WHERE s.slug = 'mathematiques' AND c.slug IN ('7eme','8eme','9eme')
      );
    """
    res = q(sql)
    print('Update:', res.get('response', [{}])[0].get('data', {}).get('truncated', False) and 'TRUNCATED' or 'OK')

    # Verify final state
    print('\n═══ Math collège final state ═══')
    res = q("""
    SELECT
      c.slug,
      rms."isApplied",
      COUNT(*)
    FROM "ResourceMetadataStaging" rms
    JOIN "Resource" r ON r.id = rms."resourceId"
    JOIN "Subject" s ON r."subjectId" = s.id
    JOIN "Class" c ON r."classId" = c.id
    WHERE s.slug = 'mathematiques' AND c.slug IN ('7eme','8eme','9eme')
    GROUP BY c.slug, rms."isApplied"
    ORDER BY c.slug, rms."isApplied";
    """)
    for row in res.get('response', [{}])[0].get('data', {}).get('rows', []):
        print(f'  {row[0]:<8} applied={row[1]!s:<6} count={row[2]}')

    # Overall
    res = q('SELECT "isApplied", COUNT(*) FROM "ResourceMetadataStaging" GROUP BY "isApplied";')
    print('\n═══ All staging state ═══')
    for row in res.get('response', [{}])[0].get('data', {}).get('rows', []):
        print(f'  isApplied={row[0]!s:<6} count={row[1]}')

    # Live Math collège final stats
    res = q("""
    SELECT
      c.slug,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE r."schoolName" IS NOT NULL AND r."schoolName" != '') as schoolName,
      COUNT(*) FILTER (WHERE r."teacherNameAr" IS NOT NULL AND r."teacherNameAr" != '') as teacherNameAr,
      COUNT(*) FILTER (WHERE r.year IS NOT NULL AND r.year != '') as year
    FROM "Resource" r
    JOIN "Subject" s ON r."subjectId" = s.id
    JOIN "Class" c ON r."classId" = c.id
    WHERE s.slug = 'mathematiques' AND c.slug IN ('7eme','8eme','9eme')
    GROUP BY c.slug
    ORDER BY c.slug;
    """)
    print('\n═══ Live Math collège — final coverage ═══')
    print('  class    total  schoolName  teacherNameAr  year')
    for row in res.get('response', [{}])[0].get('data', {}).get('rows', []):
        print(f'  {row[0]:<8} {row[1]:<6} {row[2]:<11} {row[3]:<14} {row[4]}')


if __name__ == '__main__':
    main()
