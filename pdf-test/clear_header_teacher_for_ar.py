#!/usr/bin/env python3
"""
Clear headerData.teacher for AR files (Physique collège).
This forces the AI card to fall back to dbTeacherNameAr (AR) instead of showing the FR/Latin teacher name from the PDF header.

User rule (2026-08-03): If file is AR → display prof in AR. If file is FR → display prof in FR.
The headerData.teacher is FR Latin (lowercase from PDF) — never use as final value for AR files.

DRY-RUN BY DEFAULT. Pass --apply to actually write.
"""
import os
import sys
import json
import urllib.request
import urllib.error

NEON_API_KEY = os.environ.get("NEON_API_KEY", "NEON_API_KEY_REDACTED")
NEON_PROJECT = "little-silence-94324724"
BRANCH_ID = "br-purple-recipe-as2x8yyo"


def neon_query(sql, role="edutunisie_app", timeout=30, params=None):
    body = {
        "db_name": "neondb",
        "role_name": role,
        "query": sql,
        "branch_id": BRANCH_ID,
    }
    if params:
        body["params"] = params
    req = urllib.request.Request(
        f"https://console.neon.tech/api/v2/projects/{NEON_PROJECT}/query",
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {NEON_API_KEY}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def run_sql(sql, role="edutunisie_app", params=None):
    data = neon_query(sql, role=role, params=params)
    if not data.get("success"):
        raise Exception(f"SQL error: {data.get('error', 'unknown')}")
    response = data.get("response", [])
    if response and "data" in response[0]:
        return response[0]["data"].get("rows", [])
    return []


def main():
    apply = "--apply" in sys.argv

    print(f"\n{'='*70}")
    print(f"Clear headerData.teacher for AR Physique collège files")
    print(f"{'='*70}\n")
    print(f"Mode: {'🔴 APPLY' if apply else '🟡 DRY-RUN (no changes)'}\n")

    # Find all AR Physique collège resources that have headerData.teacher
    rows = run_sql("""
        SELECT r.id, r.title, r.language, r."headerData"::text, r."teacherNameAr"
        FROM "Resource" r
        JOIN "Subject" s ON r."subjectId" = s.id
        JOIN "Class" c ON r."classId" = c.id
        WHERE s.slug = 'physique'
          AND c.slug IN ('7eme', '8eme', '9eme')
          AND r.language = 'ar'
          AND r."headerData" IS NOT NULL
          AND r."headerData"->>'teacher' IS NOT NULL
          AND r."headerData"->>'teacher' != ''
        ORDER BY r.id
    """)

    print(f"Found {len(rows)} AR Physique collège resources with headerData.teacher to clear\n")

    if not rows:
        print("Nothing to do.")
        return

    # Show sample
    print("Sample (first 10):")
    print(f"{'ID':<26} {'Header teacher (to clear)':<40} {'teacherNameAr (keep)':<30}")
    print("-" * 100)
    for r in rows[:10]:
        rid, title, lang, hdr_teacher, tnar = r
        try:
            hdr = json.loads(hdr_teacher) if hdr_teacher else {}
        except Exception:
            hdr = {}
        t = hdr.get("teacher", "") or ""
        if len(t) > 35:
            t = t[:35] + "..."
        nar = (tnar or "")[:25]
        print(f"{rid:<26} {t:<40} {nar:<30}")

    if len(rows) > 10:
        print(f"... and {len(rows) - 10} more")

    if not apply:
        print(f"\n🟡 DRY-RUN: Would clear headerData.teacher for {len(rows)} resources.")
        print(f"   Run with --apply to actually update.\n")
        return

    # Apply: clear headerData.teacher while preserving other fields
    print(f"\n🔴 APPLYING: clearing headerData.teacher for {len(rows)} resources...\n")

    count = 0
    for r in rows:
        rid = r[0]
        hdr_teacher_json = r[3]
        try:
            hdr = json.loads(hdr_teacher_json)
        except Exception:
            continue
        # Set teacher to null
        hdr["teacher"] = None
        # Write back using string formatting (Neon API only supports $1 param)
        # Safe because we control all values
        hdr_json = json.dumps(hdr, ensure_ascii=False)
        sql = f"UPDATE \"Resource\" SET \"headerData\" = '{hdr_json}'::jsonb WHERE id = '{rid}'"
        run_sql(sql, role="neondb_owner")
        count += 1
        if count % 50 == 0:
            print(f"  Updated {count}/{len(rows)}")

    print(f"\n✅ Done. Cleared headerData.teacher for {count} resources.\n")

    # Verify
    verify = run_sql("""
        SELECT COUNT(*) FROM "Resource" r
        JOIN "Subject" s ON r."subjectId" = s.id
        JOIN "Class" c ON r."classId" = c.id
        WHERE s.slug = 'physique'
          AND c.slug IN ('7eme', '8eme', '9eme')
          AND r.language = 'ar'
          AND r."headerData"->>'teacher' IS NOT NULL
          AND r."headerData"->>'teacher' != ''
    """)
    print(f"Verification: {verify[0][0] if verify else 0} AR Physique collège still have headerData.teacher set\n")


if __name__ == "__main__":
    main()
