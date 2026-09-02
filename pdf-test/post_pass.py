#!/usr/bin/env python3
"""Post-processing passes:
- Pass 1: Extract topics + keyPoints for all 434 Technologie (fills gaps)
- Pass 2: Retry missing dossierTechnique for OCR'd files
"""
import json
import os
import sys
import time
import urllib.request
from pathlib import Path
from openai import OpenAI

sys.path.insert(0, '.')
from ai_extract import normalize_year

NEON_API_KEY = os.environ.get("NEON_API_KEY", "")
NEON_PROJECT = "little-silence-94324724"
NEON_BRANCH = "br-purple-recipe-as2x8yyo"
NEON_BASE = "https://console.neon.tech/api/v2/projects"

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))


def run_sql(query):
    payload = json.dumps({
        "db_name": "neondb",
        "role_name": "edutunisie_app",
        "query": query,
        "branch_id": NEON_BRANCH,
    })
    req = urllib.request.Request(
        f"{NEON_BASE}/{NEON_PROJECT}/query",
        data=payload.encode(),
        headers={"Authorization": f"Bearer {NEON_API_KEY}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def array_literal(arr):
    if not arr: return "ARRAY[]::text[]"
    if isinstance(arr, str):
        try: arr = json.loads(arr)
        except: return "ARRAY[]::text[]"
    if not isinstance(arr, list): return "ARRAY[]::text[]"
    items = ",".join(f"'{str(s).replace(chr(39), chr(39)+chr(39))}'" for s in arr)
    return f"ARRAY[{items}]::text[]"


def text_or_null(s):
    if s is None or s == "": return "NULL"
    return f"'{str(s).replace(chr(39), chr(39)+chr(39))}'"


def extract_topics_keypoints(title, subject, full_text):
    """Extract topics + keyPoints via focused AI call."""
    prompt = f"""Analyse ce document scolaire tunisien (matière: {subject}) et extrait UNIQUEMENT:
- 3 à 5 keyPoints (points clés du contenu)
- 3 à 6 topics (tags thématiques courts)

Titre: {title}
Texte (max 4000 chars):
{full_text[:4000]}

Réponds UNIQUEMENT avec ce JSON strict:
{{"keyPoints": ["point 1", "point 2", "point 3"], "topics": ["topic 1", "topic 2"]}}"""
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Tu réponds UNIQUEMENT en JSON valide. Pas d'invention."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=300,
            temperature=0.1,
        )
        content = response.choices[0].message.content.strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"): content = content[4:]
            content = content.strip()
        data = json.loads(content)
        return data, response.usage.total_tokens
    except Exception as e:
        return {"keyPoints": [], "topics": []}, 0


def update_metadata(numeric_id, key_points, topics):
    """Update metadata with new topics + keyPoints."""
    sql = f"""
    UPDATE "ResourceMetadata" m
    SET "keyPoints" = {array_literal(key_points)},
        "topics" = {array_literal(topics)},
        "extractedAt" = NOW()
    FROM "Resource" r
    WHERE m."resourceId" = r.id AND r."numericId" = {numeric_id}
    RETURNING m."resourceId"
    """
    return run_sql(sql).get("success", False)


def extract_dossier_technique(title, full_text, existing):
    """Extract dossierTechnique for files where it's missing."""
    if existing and existing.strip():
        return existing  # already has it
    prompt = f"""Pour ce document scolaire de Technologie tunisien, identifie le dossier technique parmi ces options:
- "Génie mécanique" (mécanique, moteurs, engrenages, etc.)
- "Génie électrique" (électronique, circuits, etc.)
- "Génie civil" (construction, structure, etc.)
- "Habitat" (logement, construction, etc.)
- "Énergie" (production d'énergie, solaire, éolien, etc.)
- "Communication" (réseaux, transmission, etc.)
- "Transport" (véhicules, circulation, etc.)
- "Matériaux" (matières, propriétés, etc.)
- "Confort et domotique"
- "Hygiène et santé"
- "Environnement"
- "Économie et gestion"

Titre: {title}
Texte (1000 chars):
{full_text[:1000]}

Réponds UNIQUEMENT avec le nom du dossier, sans guillemets. Si aucun ne correspond, réponds "null"."""
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Tu réponds UNIQUEMENT avec un dossier de la liste, sans JSON."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=50,
            temperature=0.1,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        return None


def update_dossier(numeric_id, dossier):
    """Update dossierTechnique only."""
    sql = f"""
    UPDATE "ResourceMetadata" m
    SET "dossierTechnique" = {text_or_null(dossier)},
        "extractedAt" = NOW()
    FROM "Resource" r
    WHERE m."resourceId" = r.id AND r."numericId" = {numeric_id}
    RETURNING m."resourceId"
    """
    return run_sql(sql).get("success", False)


def pass1_topics_keypoints():
    """Extract topics + keyPoints for all 434 Technologie."""
    print("\n=== PASS 1: Topics + KeyPoints for 434 Technologie ===")
    # Get all Technologie IDs that need update (missing topics OR keyPoints)
    result = run_sql("""
    SELECT r."numericId"::text as id, r.title, c."fullText"
    FROM "Resource" r
    LEFT JOIN "ResourceMetadata" m ON m."resourceId" = r.id
    LEFT JOIN "ResourceContent" c ON c."resourceId" = r.id
    LEFT JOIN "Subject" s ON r."subjectId" = s.id
    WHERE r."importedFrom" = 'devoirat.net' AND s."nameFr" = 'Technologie'
      AND r."fileUrl" IS NOT NULL
      AND (m.id IS NULL OR m."topics" IS NULL OR array_length(m."topics", 1) IS NULL
           OR m."keyPoints" IS NULL OR array_length(m."keyPoints", 1) IS NULL)
      AND c."fullText" IS NOT NULL
    ORDER BY r."numericId"
    """)
    rows = result.get("response", [{}])[0].get("data", {}).get("rows", [])
    print(f"Need update: {len(rows)}")

    total_cost = 0.0
    n_updated = 0
    for i, (id_str, title, full_text) in enumerate(rows):
        if not full_text:
            continue
        result, tokens = extract_topics_keypoints(title, "Technologie", full_text)
        kp = result.get("keyPoints", [])
        topics = result.get("topics", [])
        if kp or topics:
            update_metadata(int(id_str), kp, topics)
            n_updated += 1
            cost = tokens * 0.0000004
            total_cost += cost
        if (i+1) % 25 == 0:
            print(f"  [{i+1}/{len(rows)}] updated: {n_updated} | cost: ${total_cost:.2f}")

    print(f"PASS 1 done: {n_updated}/{len(rows)} updated, ${total_cost:.2f}")
    return n_updated, total_cost


def pass2_dossier_technique():
    """Retry missing dossierTechnique for OCR'd files."""
    print("\n=== PASS 2: DossierTechnique for OCR files ===")
    result = run_sql("""
    SELECT r."numericId"::text as id, r.title, c."fullText", m."dossierTechnique"
    FROM "Resource" r
    LEFT JOIN "ResourceMetadata" m ON m."resourceId" = r.id
    LEFT JOIN "ResourceContent" c ON c."resourceId" = r.id
    LEFT JOIN "Subject" s ON r."subjectId" = s.id
    WHERE r."importedFrom" = 'devoirat.net' AND s."nameFr" = 'Technologie'
      AND c."extractionMethod" = 'tesseract-ocr'
      AND (m."dossierTechnique" IS NULL OR m."dossierTechnique" = '')
    ORDER BY r."numericId"
    """)
    rows = result.get("response", [{}])[0].get("data", {}).get("rows", [])
    print(f"OCR files needing dossier: {len(rows)}")

    n_updated = 0
    total_cost = 0.0
    for i, (id_str, title, full_text, existing) in enumerate(rows):
        if not full_text:
            continue
        dossier = extract_dossier_technique(title, full_text, existing)
        if dossier and dossier != "null":
            update_dossier(int(id_str), dossier)
            n_updated += 1
            total_cost += 0.0001  # rough estimate

    print(f"PASS 2 done: {n_updated}/{len(rows)} updated, ${total_cost:.2f}")
    return n_updated, total_cost


if __name__ == "__main__":
    n1, c1 = pass1_topics_keypoints()
    n2, c2 = pass2_dossier_technique()
    print(f"\n=== TOTAL ===")
    print(f"Pass 1: {n1} updated, ${c1:.2f}")
    print(f"Pass 2: {n2} updated, ${c2:.2f}")
    print(f"Total: ${c1+c2:.2f}")
