#!/usr/bin/env python3
"""
Extend prof + school extraction to PARTIAL values for Physique collège:
- Prof with 1 word only (e.g. "حاتم") → try to find full name (e.g. "حاتم العربي")
- School with just "المدرسة الاعدادية" → try to find full name (e.g. "المدرسة الاعدادية رحال بير الحفي")
"""
import os, json, re, sys, time
sys.path.insert(0, '/workspace/edutunisie/pdf-test')

import importlib.util
spec = importlib.util.spec_from_file_location('extract_physique_prof_school', '/workspace/edutunisie/pdf-test/extract_physique_prof_school.py')
m_extract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m_extract)

spec2 = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec2)
spec2.loader.exec_module(m2 := importlib.util.module_from_spec(spec2) or type(sys)('fallback'))
spec2.loader.exec_module(m2)
# The above two lines are awkward, just use the direct import


# Use direct neon_query from extract_physique_prof_school.py
def q(sql, role='edutunisie_app'):
    body = json.dumps({"db_name": "neondb", "role_name": role, "query": sql, "branch_id": "br-purple-recipe-as2x8yyo"}).encode()
    req = urllib.request.Request("https://console.neon.tech/api/v2/projects/little-silence-94324724/query", data=body, headers={"Authorization": f"Bearer {os.environ.get('NEON_API_KEY','')}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r: return json.loads(r.read())


def is_more_complete_prof(old, new):
    """Is new more complete than old?"""
    if not new or new == old:
        return False
    old_words = len((old or '').split())
    new_words = len(new.split())
    # New is better if it has more words OR is significantly longer
    if new_words > old_words:
        return True
    if new_words == old_words and len(new) > len(old or '') + 2:
        return True
    return False


def is_more_complete_school(old, new):
    """Is new more complete than old?"""
    if not new or new == old:
        return False
    # If old is just "المدرسة الاعدادية" or "الاعدادية" (≤15 chars), new is better
    if len(old or '') <= 20 and len(new) > len(old or '') + 3:
        return True
    # General: new is significantly longer
    if len(new) > len(old or '') + 5:
        return True
    return False


def clean(s):
    s = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', s) if s else ''
    return s.replace("'", "''").replace("\\", "\\\\")


def main():
    print('Loading Physique collège resources...', flush=True)
    r = q('''
    SELECT r.id, r."numericId", r."teacherNameAr", r."schoolName", r.language, r."schoolType",
           array_to_json(rm."profNames") as rm_profNames, rm."schoolName" as rm_school
    FROM "Resource" r
    JOIN "Subject" s ON s.id = r."subjectId"
    JOIN "Class" c ON c.id = r."classId"
    LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    WHERE s.slug = 'physique' AND c.slug IN ('7eme','8eme','9eme')
    ''')
    rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
    print(f'Total: {len(rows)}', flush=True)

    # Get OCR text
    print('Loading OCR text...', flush=True)
    rids = [r[0] for r in rows]
    rids_csv = "'" + "','".join(rids) + "'"
    rc = q(f"SELECT rc.\"resourceId\", rc.\"fullText\" FROM \"ResourceContent\" rc WHERE rc.\"resourceId\" IN ({rids_csv})")
    texts = {row[0]: (row[1] or '') for row in rc.get('response', [{}])[0].get('data', {}).get('rows', [])}
    print(f'Got text for {len(texts)}/{len(rids)}', flush=True)

    # Find candidates to improve
    candidates = []
    for rid, nid, old_prof, old_school, lang, st, rm_prof_json, rm_school in rows:
        text = texts.get(rid, '')
        if not text or len(text) < 50:
            continue

        # Always re-extract
        new_prof = m_extract.extract_prof(text)
        new_school = m_extract.extract_school(text)

        updates = []
        if is_more_complete_prof(old_prof, new_prof):
            updates.append(('teacherNameAr', new_prof))
        if is_more_complete_school(old_school, new_school):
            updates.append(('schoolName', new_school))

        # ResourceMetadata
        rm_prof = None
        try:
            if rm_prof_json and rm_prof_json != 'null':
                rm_prof = json.loads(rm_prof_json)
                if isinstance(rm_prof, list) and rm_prof:
                    rm_prof = rm_prof[0]
                else:
                    rm_prof = None
        except:
            pass

        if is_more_complete_prof(rm_prof, new_prof):
            updates.append(('rm.profNames', new_prof))
        if is_more_complete_school(rm_school, new_school):
            updates.append(('rm.schoolName', new_school))

        if updates:
            candidates.append((rid, nid, old_prof, old_school, rm_prof, rm_school, new_prof, new_school, updates))

    print(f'\nCandidates for improvement: {len(candidates)}')

    if not candidates:
        print('No improvements found.')
        return

    # Show samples
    print('\nSamples (first 10):')
    for c in candidates[:10]:
        rid, nid, old_prof, old_school, rm_prof, rm_school, new_prof, new_school, updates = c
        for fld, new_val in updates:
            if fld == 'teacherNameAr':
                print(f"  #{nid} Resource.{fld}: {old_prof!r} → {new_val!r}")
            elif fld == 'schoolName':
                print(f"  #{nid} Resource.{fld}: {old_school!r} → {new_val!r}")
            elif fld == 'rm.profNames':
                print(f"  #{nid} RM.profNames: {rm_prof!r} → [{new_val!r}]")
            elif fld == 'rm.schoolName':
                print(f"  #{nid} RM.schoolName: {rm_school!r} → {new_val!r}")

    # Apply
    print(f'\nApplying {len(candidates)} updates...', flush=True)
    ok = 0
    fail = 0
    start = time.time()

    for i, c in enumerate(candidates):
        rid, nid, old_prof, old_school, rm_prof, rm_school, new_prof, new_school, updates = c
        try:
            # Resource updates
            res_updates = []
            rm_updates = []
            for fld, val in updates:
                if fld.startswith('rm.'):
                    actual = fld[3:]  # profNames or schoolName
                    if actual == 'profNames':
                        rm_updates.append(f"\"profNames\" = ARRAY['{clean(val)}']::text[]")
                    else:
                        rm_updates.append(f"\"{actual}\" = '{clean(val)}'")
                else:
                    res_updates.append(f"\"{fld}\" = '{clean(val)}'")

            if res_updates:
                sql = f"UPDATE \"Resource\" SET {', '.join(res_updates)} WHERE id = '{rid}'"
                result = q(sql, role='neondb_owner')
                if result.get('errors'):
                    print(f"  Fail #{nid} (Resource): {result['errors'][0].get('message','')[:120]}")
                    fail += 1
                    continue

            if rm_updates:
                check = q(f"SELECT id FROM \"ResourceMetadata\" WHERE \"resourceId\" = '{rid}'")
                if check.get('response', [{}])[0].get('data', {}).get('rows', []):
                    sql = f"UPDATE \"ResourceMetadata\" SET {', '.join(rm_updates)} WHERE \"resourceId\" = '{rid}'"
                else:
                    cols = ['"resourceId"'] + [u.split(' = ')[0] for u in rm_updates]
                    vals = [f"'{rid}'"] + [u.split(' = ', 1)[1] for u in rm_updates]
                    sql = f"INSERT INTO \"ResourceMetadata\" ({', '.join(cols)}) VALUES ({', '.join(vals)})"
                result = q(sql, role='neondb_owner')
                if result.get('errors'):
                    print(f"  Fail #{nid} (RM): {result['errors'][0].get('message','')[:120]}")
                    fail += 1
                    continue

            ok += 1
        except Exception as e:
            fail += 1
            print(f"  Exception #{nid}: {str(e)[:120]}")

        if (i + 1) % 20 == 0:
            elapsed = time.time() - start
            rate = (i + 1) / elapsed if elapsed > 0 else 0
            print(f'  [{i+1}/{len(candidates)}] OK={ok} FAIL={fail} ({rate:.1f}/s)', flush=True)

    print(f'\nDONE: {ok} updated, {fail} failed in {time.time()-start:.0f}s')


if __name__ == '__main__':
    import urllib.request  # ensure imported
    main()
