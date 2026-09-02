#!/usr/bin/env python3
"""
Set headerData.teacher = teacherNameAr for AR files (Physique collège).
This is a workaround for the Vercel CDN cache issue preventing the new AiDescription code from deploying.

The OLD code uses headerData.teacher directly. By setting it to the AR prof name, the AI card
will display the AR name (which is what the user wants).

When the new code eventually deploys, it will also pick the AR name (same result).
"""
import os
import re
import sys
import json
import urllib.request

NEON_API_KEY = "NEON_API_KEY_REDACTED"
NEON_PROJECT = "little-silence-94324724"
BRANCH_ID = "br-purple-recipe-as2x8yyo"


def neon_query(sql, role="edutunisie_app", timeout=30):
    body = {"db_name": "neondb", "role_name": role, "query": sql, "branch_id": BRANCH_ID}
    req = urllib.request.Request(
        f"https://console.neon.tech/api/v2/projects/{NEON_PROJECT}/query",
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {NEON_API_KEY}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def run_sql(sql, role="edutunisie_app"):
    data = neon_query(sql, role=role)
    if not data.get("success"):
        raise Exception(f"SQL error: {data.get('error', 'unknown')}")
    response = data.get("response", [])
    if response and "data" in response[0]:
        return response[0]["data"].get("rows", [])
    return []


def main():
    apply = "--apply" in sys.argv

    print(f"\n{'='*70}")
    print(f"Set headerData.teacher = teacherNameAr for AR Physique collège")
    print(f"{'='*70}\n")
    print(f"Mode: {'🔴 APPLY' if apply else '🟡 DRY-RUN (no changes)'}\n")

    # Find all AR Physique collège resources where:
    # - teacherNameAr is set (and is AR)
    # - headerData.teacher is null OR is not AR
    rows = run_sql("""
        SELECT r.id, r.title, r.language, r."headerData"::text, r."teacherNameAr"
        FROM "Resource" r
        JOIN "Subject" s ON r."subjectId" = s.id
        JOIN "Class" c ON r."classId" = c.id
        WHERE s.slug = 'physique'
          AND c.slug IN ('7eme', '8eme', '9eme')
          AND r.language = 'ar'
          AND r."teacherNameAr" IS NOT NULL
          AND r."teacherNameAr" != ''
        ORDER BY r.id
    """)

    print(f"Found {len(rows)} AR Physique collège with teacherNameAr\n")

    # Filter: only "good" AR names
    def is_good_arabic_name(name):
        if not name:
            return False
        name = name.strip()
        if len(name) < 3:
            return False
        if "اا" in name:
            return False
        if re.search(r"\sا\s", name):
            return False
        bad = ["اسم الاستاذ", "الاستاذ", "اﻷستاذ", "السيد", "السيدة", "الأستاذ", "الاستاذ", "Prof", "prof", "M.", "Mme", "null", "None"]
        for b in bad:
            if b in name:
                return False
        words = name.split()
        if len(words) >= 2:
            return True
        if len(name) >= 5:
            return True
        return False

    # Filter: only those where headerData.teacher is null or different from teacherNameAr
    # AND teacherNameAr is "good"
    to_update = []
    skipped_bad = 0
    for r in rows:
        rid, title, lang, hdr_teacher, tnar = r
        if not is_good_arabic_name(tnar):
            skipped_bad += 1
            continue
        try:
            hdr = json.loads(hdr_teacher) if hdr_teacher else {}
        except Exception:
            hdr = {}
        current_teacher = hdr.get("teacher")
        if current_teacher != tnar:
            to_update.append((rid, hdr, tnar, current_teacher))

    print(f"Skipped (bad names): {skipped_bad}")

    print(f"Need to update: {len(to_update)} (where headerData.teacher != teacherNameAr)\n")

    if not to_update:
        print("Nothing to do.")
        return

    # Show sample
    print("Sample (first 10):")
    print(f"{'ID':<26} {'Current (FR/Latin)':<30} {'New (AR)':<30}")
    print("-" * 90)
    for rid, hdr, tnar, current in to_update[:10]:
        cur = (current or "null")[:25]
        new = (tnar or "")[:25]
        print(f"{rid:<26} {cur:<30} {new:<30}")

    if len(to_update) > 10:
        print(f"... and {len(to_update) - 10} more")

    if not apply:
        print(f"\n🟡 DRY-RUN: Would update {len(to_update)} resources.")
        print(f"   Run with --apply to actually write.\n")
        return

    print(f"\n🔴 APPLYING: setting headerData.teacher = teacherNameAr for {len(to_update)} resources...\n")

    count = 0
    for rid, hdr, tnar, current in to_update:
        # Set teacher to teacherNameAr
        hdr["teacher"] = tnar
        hdr_json = json.dumps(hdr, ensure_ascii=False)
        # Escape single quotes for SQL
        hdr_json_escaped = hdr_json.replace("'", "''")
        sql = f"UPDATE \"Resource\" SET \"headerData\" = '{hdr_json_escaped}'::jsonb WHERE id = '{rid}'"
        run_sql(sql, role="neondb_owner")
        count += 1
        if count % 50 == 0:
            print(f"  Updated {count}/{len(to_update)}")

    print(f"\n✅ Done. Updated {count} resources.\n")

    # Verify
    verify = run_sql("""
        SELECT COUNT(*) FROM "Resource" r
        JOIN "Subject" s ON r."subjectId" = s.id
        JOIN "Class" c ON r."classId" = c.id
        WHERE s.slug = 'physique'
          AND c.slug IN ('7eme', '8eme', '9eme')
          AND r.language = 'ar'
          AND r."headerData"->>'teacher' = r."teacherNameAr"
    """)
    print(f"Verification: {verify[0][0] if verify else 0} now have headerData.teacher = teacherNameAr\n")


if __name__ == "__main__":
    main()
