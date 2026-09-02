#!/usr/bin/env python3
"""
Fix the 24 AR Physique collège files that still have FR keyPoints.
Re-extracts AR-only keyPoints from OCR text and updates the DB.
"""
import os
import sys
import json
import re
import urllib.request
import time

NEON_API_KEY = os.environ.get("NEON_API_KEY")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    with open(".env.local") as f:
        for line in f:
            if "OPENAI" in line:
                OPENAI_API_KEY = line.split("=", 1)[1].strip().strip('"')
                os.environ["OPENAI_API_KEY"] = OPENAI_API_KEY
                break

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


def gpt_keypoints(text, title, type_str, subject, level):
    """Generate AR keyPoints from OCR text."""
    prompt = f"""Tu es un expert en éducation tunisienne. Extrait 5-7 POINTS CLÉS CONCRETS de ce document en ARABE.

Titre: {title}
Type: {type_str}
Matière: {subject}
Niveau: {level}

Texte:
---
{text[:5000]}
---

RÈGLES STRICTES:
- TOUS en ARABE (pas de français, pas d'anglais)
- 2-6 mots CONCRETS par point (concept, formule, exercice)
- EXTRAIS du texte, n'invente pas
- Pas de "Concepts fondamentaux" ou "Exercices pratiques" (génériques)

Exemples BONS: "مبدأ حفظ المادة", "الكتلة الحجمية", "التيار المستمر"
Exemples MAUVAIS: "Concepts fondamentaux de la Physique" (FR), "Exercices pratiques" (générique)

JSON uniquement: {{"keyPoints": ["p1", "p2", "p3", "p4", "p5"]}}"""

    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps({
            "model": "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": "Tu réponds UNIQUEMENT en JSON valide. Tous les points en ARABE."},
                {"role": "user", "content": prompt}
            ],
            "max_tokens": 400,
            "temperature": 0.0
        }).encode("utf-8"),
        headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        content = data["choices"][0]["message"]["content"]
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()
        return json.loads(content)


def to_pg_array(items):
    """Convert list to Postgres array literal."""
    parts = []
    for item in items:
        escaped = item.replace("\\", "\\\\").replace('"', '\\"')
        parts.append(f'"{escaped}"')
    return '{' + ','.join(parts) + '}'


def update_keypoints(rid, keypoints):
    """Update ResourceMetadata.keyPoints."""
    kp_pg = to_pg_array(keypoints)
    kp_escaped = kp_pg.replace("'", "''")
    sql = f"UPDATE \"ResourceMetadata\" SET \"keyPoints\" = '{kp_escaped}'::text[] WHERE \"resourceId\" = '{rid}'"
    return neon_query(sql, role="neondb_owner")


def parse_pg_array(s):
    if not s or not s.startswith('{'):
        return []
    inner = s[1:-1]
    result = []
    current = ''
    in_quote = False
    for c in inner:
        if c == '"' and (not current or current[-1] != '\\'):
            in_quote = not in_quote
        elif c == ',' and not in_quote:
            if current.strip():
                result.append(current.strip())
            current = ''
        else:
            current += c
    if current.strip():
        result.append(current.strip())
    return result


def main():
    apply = "--apply" in sys.argv

    print(f"\n{'='*70}")
    print(f"Fix remaining FR keyPoints for 24 AR Physique collège files")
    print(f"{'='*70}\n")
    print(f"Mode: {'🔴 APPLY' if apply else '🟡 DRY-RUN'}\n")

    # Get the 24 files with FR keyPoints
    sql = '''SELECT r.id, r."numericId", r.title, r.type, rm."keyPoints", rc."fullText"
             FROM "Resource" r
             JOIN "Subject" s ON r."subjectId" = s.id
             JOIN "Class" c ON r."classId" = c.id
             LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
             LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
             WHERE s.slug = 'physique'
               AND c.slug IN ('7eme', '8eme', '9eme')
               AND r.language = 'ar'
             ORDER BY r."numericId"'''
    result = neon_query(sql)
    rows = result["response"][0]["data"]["rows"]

    files_to_fix = []
    for r in rows:
        rid, nid, title, type_str, kp_str, text = r
        kp_list = parse_pg_array(kp_str)
        kp_fr = [k for k in kp_list if any(c.isascii() and c.isalpha() and ord(c) < 128 for c in k)]
        if len(kp_fr) >= 2:
            files_to_fix.append((rid, nid, title, type_str, kp_list, kp_fr, text))

    print(f"Found {len(files_to_fix)} files with FR keyPoints\n")
    
    if not files_to_fix:
        print("Nothing to do!")
        return

    success = 0
    errors = 0

    for i, (rid, nid, title, type_str, old_kp, fr_kp, text) in enumerate(files_to_fix, 1):
        if not text or len(text) < 100:
            print(f"[{i}/{len(files_to_fix)}] #{nid}: ⚠️ no OCR text, skipping")
            errors += 1
            continue

        # Determine level
        if "السابعة" in title:
            level = "7ème année de base"
        elif "التاسعة" in title:
            level = "9ème année de base"
        else:
            level = "8ème année de base"

        type_map = {"synthese": "فرض تأليفي", "controle": "فرض مراقبة", "cours": "درس"}
        type_ar = type_map.get(type_str or "", type_str or "Document")

        print(f"[{i}/{len(files_to_fix)}] #{nid}: {len(fr_kp)} FR → regenerating...")
        print(f"   {title[:60]}")

        try:
            result = gpt_keypoints(text, title, type_ar, "Physique", level)
            new_kp = result.get("keyPoints", [])

            if not new_kp or len(new_kp) < 3:
                print(f"   ❌ Too few keypoints")
                errors += 1
                continue

            # Filter out any remaining FR (keep AR only)
            new_kp_ar = [kp for kp in new_kp if not (any(c.isascii() and c.isalpha() and ord(c) < 128 for c in kp) and len(kp) > 3 and not any('\u0600' <= c <= '\u06FF' for c in kp))]
            if len(new_kp_ar) < 3:
                new_kp_ar = new_kp  # fallback if filter too aggressive

            print(f"   ✅ {len(new_kp_ar)} AR keypoints: {new_kp_ar[:3]}")

            if apply:
                upd = update_keypoints(rid, new_kp_ar)
                if upd.get("success"):
                    success += 1
                else:
                    err = upd.get("response", [{}])[0].get("error", "unknown")
                    print(f"   ❌ Update error: {err[:150]}")
                    errors += 1
            else:
                success += 1
        except Exception as e:
            print(f"   ❌ Error: {e}")
            errors += 1

        time.sleep(0.3)

    print(f"\n{'='*70}")
    print(f"RESULTS: {success} success, {errors} errors")
    print(f"{'='*70}\n")


if __name__ == "__main__":
    main()
