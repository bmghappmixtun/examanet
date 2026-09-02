#!/usr/bin/env python3
"""
Regenerate ResourceMetadata.keyPoints for 36 AR Physique collège files.
Replaces FR keyPoints with AR-only ones using GPT-4o-mini.
"""
import os
import sys
import json
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
    prompt = f"""Tu es un expert en éducation tunisienne. Extrait les POINTS CLÉS de ce document scolaire.

DOCUMENT:
Titre: {title}
Type: {type_str}
Matière: {subject}
Niveau: {level}

TEXTE EXTRAIT DU PDF:
---
{text[:5000]}
---

TÂCHE: Liste 5-8 points clés CONCRETS du document en ARABE tunisien.

RÈGLES STRICTES:
- TOUS les points doivent être en ARABE (PAS de français, PAS d'anglais)
- Chaque point = 2-6 mots CONCRETS (un concept, une formule, un exercice)
- EXTRAIS les détails du texte, n'invente pas
- Pas de phrases génériques comme "Concepts fondamentaux"

Exemples de BONS points:
- "مبدأ حفظ المادة"
- "الكتلة الحجمية"
- "التيار الكهربائي المستمر"
- "التفاعل الكيميائي المتوازن"
- "الضوء وانتشاره في خطوط مستقيمة"

Exemples de MAUVAIS points (à NE PAS générer):
- "Concepts fondamentaux de la Physique" (FR)
- "Exercices pratiques" (générique)
- "Préparation aux examens" (générique)

Réponds UNIQUEMENT en JSON:
{{"keyPoints": ["point1", "point2", "point3", "point4", "point5"]}}"""

    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps({
            "model": "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": "Tu réponds UNIQUEMENT en JSON valide. Tu extrais les points clés en ARABE uniquement."},
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


def update_keypoints(rid, keypoints):
    """Update ResourceMetadata.keyPoints."""
    kp_json = json.dumps(keypoints, ensure_ascii=False)
    kp_escaped = kp_json.replace("'", "''")
    sql = f'UPDATE "ResourceMetadata" SET "keyPoints" = \'{kp_escaped}\' WHERE "resourceId" = \'{rid}\''
    return neon_query(sql, role="neondb_owner")


def main():
    apply = "--apply" in sys.argv

    print(f"\n{'='*70}")
    print(f"Regenerate keyPoints for AR Physique collège (v2)")
    print(f"{'='*70}\n")
    print(f"Mode: {'🔴 APPLY' if apply else '🟡 DRY-RUN'}\n")

    # Get the 36 files with their metadata
    sql = '''SELECT r.id, r."numericId", r.title, r.type, rm.id as rm_id, rm."keyPoints",
                    rc."fullText"
             FROM "Resource" r
             JOIN "Subject" s ON r."subjectId" = s.id
             JOIN "Class" c ON r."classId" = c.id
             LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
             LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
             WHERE s.slug = 'physique'
               AND c.slug IN ('7eme', '8eme', '9eme')
               AND r.language = 'ar'
               AND r.description LIKE '%Matière:%'
             ORDER BY r."numericId"'''
    result = neon_query(sql)
    rows = result["response"][0]["data"]["rows"]
    print(f"Found {len(rows)} files\n")

    success = 0
    errors = 0
    skipped = 0

    for i, (rid, nid, title, type_str, rm_id, current_kp, text) in enumerate(rows, 1):
        if not text or len(text) < 100:
            print(f"⚠️  #{nid}: OCR text too short, skipping")
            skipped += 1
            continue
        if not rm_id:
            print(f"⚠️  #{nid}: no ResourceMetadata, skipping")
            skipped += 1
            continue

        # Parse Postgres array literal: {"item1","item2"}
        def parse_pg_array(s):
            if not s:
                return []
            if isinstance(s, list):
                return s
            if not s.startswith('{'):
                return []
            inner = s[1:-1]  # strip { and }
            # Split by "," but respect quoted strings
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
        
        kp_list = parse_pg_array(current_kp)
        fr_count = sum(1 for kp in kp_list if any(c.isascii() and c.isalpha() and ord(c) < 128 for c in kp))
        ar_count = len(kp_list) - fr_count

        if fr_count == 0 and ar_count >= 5:
            # Already good
            print(f"[{i}/{len(rows)}] #{nid}: ✅ already AR ({ar_count} AR, {fr_count} FR), skip")
            success += 1
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

        print(f"[{i}/{len(rows)}] #{nid}: {ar_count} AR + {fr_count} FR → regenerating...")

        try:
            result = gpt_keypoints(text, title, type_ar, "Physique", level)
            new_kp = result.get("keyPoints", [])

            if not new_kp or len(new_kp) < 3:
                print(f"   ❌ GPT returned too few keypoints")
                errors += 1
                continue

            # Verify all are AR
            fr_in_new = sum(1 for kp in new_kp if any(c.isascii() and c.isalpha() and ord(c) < 128 for c in kp))
            if fr_in_new > 0:
                print(f"   ⚠️  {fr_in_new} FR still in result, retrying...")
                # Filter out FR
                new_kp = [kp for kp in new_kp if not any(c.isascii() and c.isalpha() and ord(c) < 128 for c in kp)]

            print(f"   ✅ {len(new_kp)} AR keypoints")
            for kp in new_kp[:3]:
                print(f"      - {kp}")

            if apply:
                update_result = update_keypoints(rid, new_kp)
                if update_result.get("success"):
                    success += 1
                else:
                    err = update_result.get("response", [{}])[0].get("error", "unknown")
                    print(f"   ❌ Update error: {err[:100]}")
                    errors += 1
            else:
                success += 1

        except Exception as e:
            print(f"   ❌ Error: {e}")
            errors += 1

        time.sleep(0.3)

    print(f"\n{'='*70}")
    print(f"RESULTS: {success} success, {errors} errors, {skipped} skipped")
    print(f"{'='*70}\n")


if __name__ == "__main__":
    main()
