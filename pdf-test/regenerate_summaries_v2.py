#!/usr/bin/env python3
"""
Regenerate AI summaries for 36 AR Physique collège files using improved GPT-4o-mini prompt.

Avoids generic templates, forces extraction of specific exercises, concepts, and difficulty.
Updates both Resource.summary and Resource.description.
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


def gpt_summary(text, title, type_str, subject, level):
    """Improved prompt v2 - no templates, specific extraction."""
    prompt = f"""Tu es un expert en éducation tunisienne qui crée des résumés de fiches scolaires pour Examanet.com.

DOCUMENT:
Titre: {title}
Type: {type_str}
Matière: {subject}
Niveau: {level}

TEXTE EXTRAIT DU PDF (peut contenir des erreurs OCR):
---
{text[:5000]}
---

TÂCHE: Génère un résumé PRÉCIS et SPÉCIFIQUE en arabe tunisien.

INTERDICTIONS STRICTES:
- NE COMMENCE PAS par "يتناول هذا" ou "يتعلق هذا" ou "هذا الوثيقة"
- NE SOIS PAS GÉNÉRIQUE
- N'invente pas de contenu qui n'est pas dans le texte

STRUCTURE:
1. Phrase d'introduction directe (ex: "يحتوي هذا الفرض على تمارين حول...")
2. Liste des exercices concrets
3. Concepts/théorèmes clés
4. Difficulté (سهل/متوسط/صعب)

Réponds UNIQUEMENT en JSON:
{{"summary": "Résumé de 3-5 phrases en arabe", "keyTopics": [...], "exerciseTypes": [...], "difficulty": "..."}}"""

    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps({
            "model": "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": "Tu es un expert en éducation tunisienne. Tu réponds UNIQUEMENT en JSON valide. Tu ne fais JAMAIS de résumés génériques - tu extrais les détails concrets du texte fourni."},
                {"role": "user", "content": prompt}
            ],
            "max_tokens": 800,
            "temperature": 0.0
        }).encode("utf-8"),
        headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        content = data["choices"][0]["message"]["content"]
        # Strip code fences if any
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()
        return json.loads(content)


def update_resource(rid, summary, description):
    """Update Resource.summary and Resource.description."""
    summary_escaped = summary.replace("'", "''")
    desc_escaped = description.replace("'", "''")
    sql = f'UPDATE "Resource" SET summary = \'{summary_escaped}\', description = \'{desc_escaped}\' WHERE id = \'{rid}\''
    return neon_query(sql, role="neondb_owner")


def main():
    apply = "--apply" in sys.argv
    limit = None
    for arg in sys.argv:
        if arg.startswith("--limit="):
            limit = int(arg.split("=")[1])

    print(f"\n{'='*70}")
    print(f"Regenerate summaries for AR Physique collège (v2 prompt)")
    print(f"{'='*70}\n")
    print(f"Mode: {'🔴 APPLY' if apply else '🟡 DRY-RUN (no changes)'}\n")

    # Get the 36 files
    sql = '''SELECT r.id, r."numericId", r.title, r.type, rc."fullText"
             FROM "Resource" r
             JOIN "Subject" s ON r."subjectId" = s.id
             JOIN "Class" c ON r."classId" = c.id
             LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
             WHERE s.slug = 'physique'
               AND c.slug IN ('7eme', '8eme', '9eme')
               AND r.language = 'ar'
               AND r.description LIKE 'يتناول%'
             ORDER BY r."numericId"'''
    if limit:
        sql += f" LIMIT {limit}"

    result = neon_query(sql)
    rows = result["response"][0]["data"]["rows"]
    print(f"Found {len(rows)} files to process\n")

    if not rows:
        print("Nothing to do.")
        return

    success = 0
    errors = 0
    total_cost = 0
    summaries = []

    for i, (rid, nid, title, type_str, text) in enumerate(rows, 1):
        if not text or len(text) < 100:
            print(f"⚠️  #{nid}: OCR text too short ({len(text) if text else 0} chars), skipping")
            continue

        # Map type to Arabic
        type_map = {
            "synthese": "فرض تأليفي",
            "controle": "فرض مراقبة",
            "cours": "درس",
            "exercice": "تمرين",
            "examen": "امتحان"
        }
        type_ar = type_map.get(type_str or "", type_str or "Document")

        # Get level from class (we know it's all 7eme/8eme/9eme here)
        # Infer from title
        if "السابعة" in title or "7ème" in title or "7eme" in title:
            level = "7ème année de base"
        elif "التاسعة" in title or "9ème" in title or "9eme" in title:
            level = "9ème année de base"
        else:
            level = "8ème année de base"

        print(f"[{i}/{len(rows)}] #{nid}: {title[:50]}...")

        try:
            result = gpt_summary(text, title, type_ar, "Physique", level)
            new_summary = result["summary"]
            topics = result.get("keyTopics", [])
            exercises = result.get("exerciseTypes", [])
            difficulty = result.get("difficulty", "متوسط")

            # Build description (HTML-like, with metadata at top)
            desc_parts = [
                f"<strong>Matière:</strong> Physique",
                f"<strong>Type:</strong> {type_str or '?'}",
                f"<strong>Résumé:</strong> {new_summary}",
            ]
            if topics:
                desc_parts.append(f"<strong>Concepts:</strong> {', '.join(topics)}")
            if exercises:
                desc_parts.append(f"<strong>Exercices:</strong> {', '.join(exercises)}")
            desc_parts.append(f"<strong>Difficulté:</strong> {difficulty}")
            new_description = "<br>".join(desc_parts)

            print(f"   ✅ {len(new_summary.split())} mots | {len(topics)} topics | {len(exercises)} types")

            if apply:
                update_result = update_resource(rid, new_summary, new_description)
                if update_result.get("success"):
                    success += 1
                else:
                    err = update_result.get("response", [{}])[0].get("error", "unknown")
                    print(f"   ❌ Update error: {err[:100]}")
                    errors += 1
            else:
                success += 1

            summaries.append({"nid": nid, "title": title, "summary": new_summary, "rid": rid})

        except Exception as e:
            print(f"   ❌ Error: {e}")
            errors += 1

        # Small delay to avoid rate limit
        time.sleep(0.5)

    print(f"\n{'='*70}")
    print(f"RESULTS:")
    print(f"  Processed: {len(rows)}")
    print(f"  Success:   {success}")
    print(f"  Errors:    {errors}")
    print(f"{'='*70}\n")

    if not apply:
        print("🟡 DRY-RUN: No changes made. Use --apply to actually update.\n")


if __name__ == "__main__":
    main()
