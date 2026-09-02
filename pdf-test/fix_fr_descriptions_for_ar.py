#!/usr/bin/env python3
"""
Fix FR descriptions for AR Physique collège files.
Copies Resource.summary (AR) to Resource.description for files where description is in FR.
"""
import os
import sys
import json
import re
import urllib.request

NEON_API_KEY = os.environ.get("NEON_API_KEY")
if not NEON_API_KEY:
    print("❌ NEON_API_KEY not set")
    sys.exit(1)
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


def detect_lang(text):
    if not text:
        return None
    text_clean = re.sub(r'<[^>]+>', '', text)
    if not text_clean.strip():
        return "empty"
    arabic = sum(1 for c in text_clean if '\u0600' <= c <= '\u06FF' or '\u0750' <= c <= '\u077F')
    latin = sum(1 for c in text_clean if c.isascii() and c.isalpha())
    if arabic > latin:
        return "ar"
    elif latin > arabic:
        return "fr"
    return "mixed"


def main():
    apply = "--apply" in sys.argv

    print(f"\n{'='*70}")
    print(f"Fix FR descriptions for AR Physique collège")
    print(f"{'='*70}\n")
    print(f"Mode: {'🔴 APPLY' if apply else '🟡 DRY-RUN (no changes)'}\n")

    # Find all AR Physique collège resources
    rows = run_sql('''
        SELECT r.id, r.description, r.summary
        FROM "Resource" r
        JOIN "Subject" s ON r."subjectId" = s.id
        JOIN "Class" c ON r."classId" = c.id
        WHERE s.slug = 'physique'
          AND c.slug IN ('7eme', '8eme', '9eme')
          AND r.language = 'ar'
    ''')

    # Filter: AR files with FR description
    to_fix = []
    for r in rows:
        rid, desc, summ = r
        if detect_lang(desc) == "fr" and summ:
            to_fix.append((rid, desc[:80] if desc else "", summ[:80] if summ else ""))

    print(f"Found {len(to_fix)} AR files with FR description that have an AR summary\n")

    if not to_fix:
        print("Nothing to do.")
        return

    # Show sample
    print("Sample (first 10):")
    print(f"{'ID':<26} {'Current (FR)':<40} {'New (AR from summary)':<40}")
    print("-" * 110)
    for rid, cur, new in to_fix[:10]:
        cur = (cur or "")[:35]
        new = (new or "")[:35]
        print(f"{rid:<26} {cur:<40} {new:<40}")

    if len(to_fix) > 10:
        print(f"... and {len(to_fix) - 10} more")

    if not apply:
        print(f"\n🟡 DRY-RUN: Would fix {len(to_fix)} descriptions.")
        print(f"   Run with --apply to actually write.\n")
        return

    print(f"\n🔴 APPLYING: copying summary to description for {len(to_fix)} files...\n")

    count = 0
    for rid, desc, summ in to_fix:
        # Copy summary to description
        summ_escaped = summ.replace("'", "''") if summ else ""
        sql = f"UPDATE \"Resource\" SET description = '{summ_escaped}' WHERE id = '{rid}'"
        run_sql(sql, role="neondb_owner")
        count += 1
        if count % 10 == 0:
            print(f"  Updated {count}/{len(to_fix)}")

    print(f"\n✅ Done. Fixed {count} descriptions.\n")

    # Verify
    verify = run_sql('''
        SELECT COUNT(*) FROM "Resource" r
        JOIN "Subject" s ON r."subjectId" = s.id
        JOIN "Class" c ON r."classId" = c.id
        WHERE s.slug = 'physique'
          AND c.slug IN ('7eme', '8eme', '9eme')
          AND r.language = 'ar'
          AND r.description ~ '<br>|<strong>'
    ''')
    print(f"Verification: {verify[0][0] if verify else 0} still have HTML description (should be fewer)\n")


if __name__ == "__main__":
    main()
