#!/usr/bin/env python3
"""AI extraction using GPT-4o-mini."""
import json
import os
import time
from pathlib import Path
from openai import OpenAI

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

METADATA_PROMPT = """Tu es un expert en éducation tunisienne. Analyse ce document scolaire (devoir, exercice ou cours) et extrait les métadonnées au format JSON strict.

RÈGLE ABSOLUE: Si une info n'est PAS dans le document, retourne null. N'invente JAMAIS. Jamais "Mr X", "Lycée X", "2025-2026" par défaut.

Header du document:
{header}

Body (première page, 2000 premiers caractères):
{body}

Footer (dernière page):
{footer}

Métadonnées du fichier:
- Titre: {title}
- Type connu: {type}
- Matière connue: {subject}
- Classe connue: {class_name}

Réponds UNIQUEMENT avec ce JSON:
{{
  "profNames": ["Mme Jeridi HAYET"] | [],
  "schoolName": "Lycée pilote El Menzah 8" | null,
  "year": "2014-2015" | null,
  "type": "devoir" | "série" | "cours" | "examen" | "résumé" | "autre",
  "subtype": "synthèse" | "contrôle" | "révision" | "maison" | null,
  "subject": "objet du sujet" | null,
  "dossierTechnique": "Habitat" | null,
  "systemName": "Porte automatique" | null,
  "duration": "2h" | "1h30" | null,
  "level": "standard" | "avancé" | "élémentaire" | null,
  "keyPoints": ["point 1", "point 2", "point 3"],
  "topics": ["topic 1", "topic 2"],
  "difficulty": "facile" | "moyen" | "difficile",
  "estimatedTimeMinutes": 30
}}

RÈGLES:
- profNames: regarde UNIQUEMENT le header. Inclus "Mr"/"Mme"/"Mlle"/"Dr" UNIQUEMENT s'il est présent dans le document. Si tu vois juste "Jeridi HAYET" sans prefix, retourne ["Jeridi HAYET"] sans prefix inventé. Si rien, retourne [].
- schoolName: nom exact de l'établissement. Si absent, null.
- year: année scolaire au format "YYYY-YYYY" (ex: "2014-2015"). Si tu vois "2014" seul, mets "2014" (on ajoutera -2015 après). Si rien, null.
- type: distingue bien "série" (EXERCISE) de "devoir" (HOMEWORK). Cours = "cours".
- subject: objet précis (ex: "Logarithme", "Réseaux", "Réactions acido-basiques").
- dossierTechnique: SEULEMENT pour Technologie/Sciences techniques. Catégorie principale: "Habitat", "Énergie", "Communication", "Transport", "Matériaux", "Génie mécanique", "Génie électrique", "Génie civil", "Mécanique", "Électrique", "Civil", "Construction". Sinon null.
- systemName: SEULEMENT pour Technologie/Sciences techniques. Le système spécifique étudié dans le document (ex: "Porte automatique", "Alarme", "Chauffage", "Éolienne", "Moteur asynchrone", "Pont roulant"). Pour Informatique et autres matières, mettre null. (collège 7-9ème) ou "Sciences techniques" (lycée 4ème). Extraire la spécialité: "Génie mécanique", "Génie électrique", "Génie civil", "Habitat", "Énergie", "Transport", "Communication", "Matériaux", etc. Pour Informatique et autres matières, mettre null (la matière est déjà dans subject).
- difficulty: facile/moyen/difficile basé sur la complexité réelle (pas toujours moyen).
}}"""


SUMMARY_PROMPT = """Tu es un expert en éducation tunisienne. Génère un résumé intelligent de ce document scolaire.

Titre: {title}
Type: {type}
Matière: {subject}

Texte complet (max 6000 chars):
{text}

Réponds UNIQUEMENT avec ce JSON:
{{
  "summary": "Résumé de 3-5 phrases du contenu principal du document. Mentionne les exercices/théorèmes/concepts clés.",
  "prerequisites": ["prérequis 1", "prérequis 2"],
  "keyInsights": ["insight 1", "insight 2", "insight 3"]
}}"""


def call_openai(prompt, max_tokens=800, temperature=0.1):
    """Call GPT-4o-mini and parse JSON response."""
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Tu réponds UNIQUEMENT en JSON valide. Pas de texte avant/après."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=max_tokens,
            temperature=temperature,
        )
        content = response.choices[0].message.content.strip()
        # Strip code fences if any
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()
        return json.loads(content), response.usage.total_tokens
    except json.JSONDecodeError as e:
        return {"error": f"JSON parse error: {e}", "raw": content[:500]}, 0
    except Exception as e:
        return {"error": str(e)}, 0


def normalize_year(year_str):
    """If year is just YYYY (4 digits), append next year as YYYY-YYYY."""
    if not year_str or year_str is None:
        return None
    year_str = str(year_str).strip()
    # Already a range
    if "-" in year_str and len(year_str) >= 7:
        return year_str
    # Just 4 digits
    import re
    m = re.match(r'^(\d{4})$', year_str)
    if m:
        y = int(m.group(1))
        return f"{y}-{y+1}"
    # Try 2 digits like "14-15"
    m = re.match(r'^(\d{2})-(\d{2})$', year_str)
    if m:
        y1, y2 = int(m.group(1)) + 2000, int(m.group(2)) + 2000
        return f"{y1}-{y2}"
    return year_str


def process_pdf(pdf_id, data, known_type, known_subject, known_class):
    """Run metadata + summary extraction."""
    pages = data.get("pages", [])
    if not pages:
        return {"error": "No pages extracted"}

    # Combine headers/footers from first/last pages
    header = data.get("headerText", "")[:2000]
    footer = data.get("footerText", "")[:1000]
    first_page_body = pages[0].get("body", "")[:2000] if pages else ""
    full_text = data.get("fullText", "")[:6000]

    # 1. Metadata extraction
    md_prompt = METADATA_PROMPT.format(
        header=header or "(vide)",
        body=first_page_body or "(vide)",
        footer=footer or "(vide)",
        title=data.get("title", "?"),
        type=known_type or "?",
        subject=known_subject or "?",
        class_name=known_class or "?",
    )
    metadata, md_tokens = call_openai(md_prompt, max_tokens=500)

    # Post-process: normalize year
    if isinstance(metadata, dict) and "year" in metadata:
        metadata["year"] = normalize_year(metadata.get("year"))

    # 2. Summary extraction
    sm_prompt = SUMMARY_PROMPT.format(
        title=data.get("title", "?"),
        type=known_type or "?",
        subject=known_subject or "?",
        text=full_text,
    )
    summary, sm_tokens = call_openai(sm_prompt, max_tokens=600)

    return {
        "metadata": metadata,
        "summary": summary,
        "tokens_used": md_tokens + sm_tokens,
    }


def main():
    with open("extracted.json") as f:
        extracted = json.load(f)

    # Load known metadata from DB query result
    db_meta = {}
    db_file = "/tmp/url_list.txt"
    with open(db_file) as f:
        for line in f:
            parts = line.strip().split("\t")
            if len(parts) >= 3:
                db_meta[parts[0]] = {"url": parts[1], "title": parts[2]}

    # Load full DB data
    with open("/tmp/files.json") as f:
        db_full = json.load(f)
    db_rows = db_full.get("response", [{}])[0].get("data", {}).get("rows", [])
    for row in db_rows:
        rid = str(row[0])
        db_meta[rid] = {
            "title": row[2],
            "type": row[3],
            "subject": "",  # from join
            "class": "",
        }

    results = {}
    total_tokens = 0

    for pdf_id, data in sorted(extracted.items()):
        if "error" in data:
            continue

        meta = db_meta.get(pdf_id, {})
        print(f"Processing {pdf_id} ({meta.get('type', '?')}/{meta.get('subject', '?')})...", end=" ")
        t0 = time.time()

        result = process_pdf(
            pdf_id, data,
            meta.get("type"), meta.get("subject"), meta.get("class")
        )
        result["duration"] = round(time.time() - t0, 2)
        result["pages"] = data["pageCount"]
        result["words"] = data["wordCount"]
        results[pdf_id] = result
        total_tokens += result.get("tokens_used", 0)
        print(f"done in {result['duration']}s, {result.get('tokens_used', 0)} tokens")

    with open("ai_extracted.json", "w") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"\n=== TOTAL ===")
    print(f"Files: {len(results)}")
    print(f"Tokens: {total_tokens}")
    print(f"Cost est: ${total_tokens * 0.0000005:.4f} (input) + ${total_tokens * 0.000002:.4f} (output)")


if __name__ == "__main__":
    main()
