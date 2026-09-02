#!/usr/bin/env python3
"""
Fix Physique collège data quality (user rule 2026-08-02):
- Update schoolType based on real text language
- Update language field
- Translate titles (FR↔AR) and add/remove "Collège pilote"
- Regen slugs

Usage:
  python3 fix_physique_college_data.py --dry-run
  python3 fix_physique_college_data.py --apply
"""
import os
import sys
import re
import json
import argparse
import urllib.request
from collections import Counter

# Add pdf-test to path for translators
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from translate_titles_rules import translate_title as fr_to_ar
from translate_titles_ar_to_fr import translate_title as ar_to_fr

# SECURITY: Neon API key must be in env var, NEVER hardcoded (was leaked 2026-08-02)
NEON_API_KEY = os.environ.get("NEON_API_KEY")
if not NEON_API_KEY:
    sys.exit("❌ NEON_API_KEY env var is required. Set it in .env.local and export before running.")
BRANCH_ID = "br-purple-recipe-as2x8yyo"
PROJECT_ID = "little-silence-94324724"


def q(sql, role="neondb_owner", timeout=60):
    """Execute SQL via Neon API."""
    body = json.dumps(
        {
            "db_name": "neondb",
            "role_name": role,
            "query": sql,
            "branch_id": BRANCH_ID,
        }
    ).encode()
    req = urllib.request.Request(
        f"https://console.neon.tech/api/v2/projects/{PROJECT_ID}/query",
        data=body,
        headers={
            "Authorization": f"Bearer {NEON_API_KEY}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def classify_real_lang(text):
    """FR if Latin ratio >= 0.8, else AR (per user rule: mixed → AR)."""
    if not text:
        return "AR"
    ar = len(re.findall(r"[\u0600-\u06FF]", text))
    lat = len(re.findall(r"[A-Za-z\u00C0-\u024F]", text))
    total = ar + lat
    if total == 0:
        return "AR"
    return "FR" if (lat / total) >= 0.8 else "AR"


def slugify(text, max_len=80):
    """Generate URL-friendly slug from title. Matches existing DB convention:
    - "N°" → "n"
    - "ème/ème" → "eme"
    - "Collège" → "college"
    - AR chars kept as-is
    - Max 80 chars, but typically 37-77 in DB
    """
    import unicodedata
    s = text

    # Normalize N° to n (drop the degree sign)
    s = re.sub(r"[N°º]\s*", "n", s, flags=re.IGNORECASE)
    s = re.sub(r"n\s*°", "n", s, flags=re.IGNORECASE)

    # Lowercase
    s = s.lower()

    # Strip accents from Latin chars (NFD + drop combining)
    s_nfd = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s_nfd if unicodedata.category(c) != "Mn")

    # Replace whitespace with dashes
    s = re.sub(r"\s+", "-", s)

    # Remove anything that's not word/dash/AR char
    s = re.sub(r"[^\w\u0600-\u06FF-]", "", s, flags=re.UNICODE)

    # Collapse multiple dashes
    s = re.sub(r"-+", "-", s)
    s = s.strip("-")

    return s[:max_len]


# ─────────────────────────────────────────────────────────────────
# STEP 1: Fetch all Physique collège resources
# ─────────────────────────────────────────────────────────────────

def fetch_resources():
    """Return list of (rid, numericId, title, schoolType, language, year, slug)."""
    r = q(
        """
        SELECT r.id, r."numericId", r.title, r."schoolType", r.language, r.year, r.slug
        FROM "Resource" r
        JOIN "Subject" s ON s.id = r."subjectId"
        WHERE s.slug = 'physique'
          AND r."classId" IN (SELECT id FROM "Class" WHERE slug IN ('7eme','8eme','9eme'))
        """
    )
    return r.get("response", [{}])[0].get("data", {}).get("rows", [])


def fetch_texts(resource_ids):
    """Return dict of {rid: text}."""
    if not resource_ids:
        return {}
    ids_str = ",".join(f"'{rid}'" for rid in resource_ids)
    r = q(f'SELECT "resourceId", "fullText" FROM "ResourceContent" WHERE "resourceId" IN ({ids_str})')
    return {row[0]: row[1] for row in r.get("response", [{}])[0].get("data", {}).get("rows", [])}


# ─────────────────────────────────────────────────────────────────
# STEP 2: Plan all changes
# ─────────────────────────────────────────────────────────────────

def plan_changes(resources, texts):
    """Return list of (rid, new_schoolType, new_language, new_title, new_slug)."""
    changes = []
    for rid, nid, title, st_db, lang_db, year, slug in resources:
        text = texts.get(rid, "")
        real_lang = classify_real_lang(text)
        target_st = "PILOTE" if real_lang == "FR" else "PUBLIC"
        target_lang = "fr" if real_lang == "FR" else "ar"

        # Translate title if schoolType changes OR if title is in wrong language
        new_title = title
        is_title_arabic = bool(re.search(r"[\u0600-\u06FF]", title))
        has_pilote_in_title = bool(re.search(r"Collège pilote", title, re.IGNORECASE))

        if target_st == "PUBLIC" and has_pilote_in_title and not is_title_arabic:
            # PILOTE → PUBLIC, title is FR with "Collège pilote" → translate to AR
            new_title = fr_to_ar(title)
        elif target_st == "PILOTE" and is_title_arabic:
            # PUBLIC → PILOTE, title is AR → translate to FR + add "Collège pilote"
            new_title = ar_to_fr(title, add_pilote=True)
        elif target_st == "PILOTE" and not is_title_arabic and not has_pilote_in_title:
            # PILOTE → PILOTE, FR title without "Collège pilote" → add it
            # Insert after first segment
            m = re.match(r"^([^-]+?)\s*-\s*", title)
            if m:
                new_title = f"{m.group(1).strip()} - Collège pilote - {title[m.end():]}"
            else:
                new_title = f"Collège pilote - {title}"

        # Normalize: trim, remove double spaces
        new_title = re.sub(r"\s+", " ", new_title).strip()
        # Only regen slug if title changed
        if new_title != title:
            new_slug = slugify(new_title)
        else:
            new_slug = slug  # keep existing

        # Only plan if something changes
        if st_db != target_st or lang_db != target_lang or new_title != title or new_slug != slug:
            changes.append((rid, target_st, target_lang, new_title, new_slug))

    return changes


# ─────────────────────────────────────────────────────────────────
# STEP 3: Apply changes (or dry-run)
# ─────────────────────────────────────────────────────────────────

def apply_changes(changes, dry_run=True):
    """Apply each change via individual UPDATE statements (safe + idempotent)."""
    # Group by change type for stats
    stats = Counter()
    errors = []

    for i, (rid, new_st, new_lang, new_title, new_slug) in enumerate(changes):
        # Escape single quotes in title/slug for SQL
        nt = new_title.replace("'", "''")
        ns = new_slug.replace("'", "''")

        # Build UPDATE — only set fields that changed
        # We do a full UPDATE per resource (small N=~400, fast enough)
        sql = f"""UPDATE "Resource" SET "schoolType" = '{new_st}', language = '{new_lang}', title = '{nt}', slug = '{ns}', "updatedAt" = NOW() WHERE id = '{rid}'"""

        if dry_run:
            stats["dry_run_planned"] += 1
        else:
            try:
                q(sql)
                stats["applied"] += 1
            except Exception as e:
                errors.append((rid, str(e)))
                stats["errors"] += 1

        if (i + 1) % 50 == 0:
            print(f"  Processed {i+1}/{len(changes)}...")

    return stats, errors


# ─────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Don't apply, just show plan")
    parser.add_argument("--apply", action="store_true", help="Apply changes to DB")
    args = parser.parse_args()

    if not args.dry_run and not args.apply:
        args.dry_run = True  # default

    print("=" * 80)
    print(f"PHYSICAL COLLÈGE DATA FIX — {'DRY-RUN' if args.dry_run else 'APPLY'}")
    print("=" * 80)

    print("\n[1/3] Fetching 423 Physique collège resources...")
    resources = fetch_resources()
    print(f"      Got {len(resources)} resources")

    print("\n[2/3] Fetching extracted texts...")
    texts = fetch_texts([r[0] for r in resources])
    print(f"      Got {len(texts)} texts")

    print("\n[3/3] Planning changes...")
    changes = plan_changes(resources, texts)
    print(f"      Planned {len(changes)} changes")

    # Show stats by type
    schooltype_changes = sum(1 for c in changes if c[1] != next((r[3] for r in resources if r[0] == c[0]), None))
    language_changes = sum(1 for c in changes if c[2] != next((r[4] for r in resources if r[0] == c[0]), None))
    title_changes = sum(1 for c in changes if c[3] != next((r[2] for r in resources if r[0] == c[0]), None))
    slug_changes = sum(1 for c in changes if c[4] != next((r[6] for r in resources if r[0] == c[0]), None))

    print()
    print("=" * 80)
    print("PLAN SUMMARY")
    print("=" * 80)
    print(f"  Total changes:  {len(changes)}")
    print(f"  schoolType:     {schooltype_changes}")
    print(f"  language:       {language_changes}")
    print(f"  title:          {title_changes}")
    print(f"  slug:           {slug_changes}")

    # Sample 5 changes
    print()
    print("=== 5 SAMPLE CHANGES ===")
    for rid, new_st, new_lang, new_title, new_slug in changes[:5]:
        orig = next((r for r in resources if r[0] == rid), None)
        if orig:
            _, nid, old_title, old_st, old_lang, _, old_slug = orig
            print(f"#{nid}")
            print(f"  schoolType: {old_st} → {new_st}")
            print(f"  language:   {old_lang} → {new_lang}")
            print(f"  title:      {old_title}")
            print(f"         →   {new_title}")
            print(f"  slug:       {old_slug}")
            print(f"         →   {new_slug}")
            print()

    if args.dry_run:
        print()
        print("=" * 80)
        print("DRY-RUN — no changes applied. Use --apply to commit.")
        print("=" * 80)
    else:
        print()
        print("=" * 80)
        print("APPLYING CHANGES (use --apply flag)...")
        print("=" * 80)
        stats, errors = apply_changes(changes, dry_run=False)
        print(f"  Applied: {stats['applied']}")
        print(f"  Errors:  {stats['errors']}")
        if errors:
            print()
            print("ERRORS:")
            for rid, e in errors[:5]:
                print(f"  {rid}: {e[:200]}")


if __name__ == "__main__":
    main()
