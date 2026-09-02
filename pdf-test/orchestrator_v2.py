"""
Examanet Bulk Extraction Orchestrator v2 — Manual manager pattern (2026-07-31)

Simpler than v1: instead of using agent-as-tool (which causes excessive model calls),
this version manually orchestrates 2 specialist agents in Python code.

Flow per resource:
  1. fetch_resource (1 tool call) → shared OCR context
  2. subject_agent.run() → generalSubject (1 model call)
  3. keypoints_agent.run() → keyPoints (1 model call)
  4. (optional) write to DB

Total: 2 model calls + 1 tool call per resource ≈ $0.0015/file

Compares to:
  - gen_general_subject.py: 1 call, ~$0.001/file
  - regen_key_points.py: 1 call, ~$0.0015/file
  - Total standalone: 2 calls, ~$0.0025/file
  - Orchestrator v2: 2 calls, ~$0.0025/file (same cost, better quality via specialization)
"""
import os
import sys
import json
import time
import argparse
import importlib.util
import types
from typing import List

# === Bootstrap bulk_math_v5 with stubs ===
_openai_stub = types.ModuleType('openai')
_openai_stub.OpenAI = lambda: None
sys.modules['openai'] = _openai_stub
sys.modules['fitz'] = types.ModuleType('fitz')
sys.modules['PIL'] = types.ModuleType('PIL')
sys.modules['PIL'].Image = types.ModuleType('Image')

_bulk_spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
_bulk = importlib.util.module_from_spec(_bulk_spec)
_bulk_spec.loader.exec_module(_bulk)

# === Import agents SDK (after stubs) ===
# Restore the real openai for agents SDK
del sys.modules['openai']
from pydantic import BaseModel, Field
from agents import Agent, Runner, function_tool, RunContextWrapper, set_tracing_disabled

set_tracing_disabled(True)  # We don't need full traces for bulk runs

# === Schemas ===
class SubjectOutput(BaseModel):
    generalSubject: str = Field(..., min_length=3, max_length=80)
    isArabic: bool

class KeyPoint(BaseModel):
    text: str = Field(..., min_length=2, max_length=40)
    isArabic: bool

class KeyPointsOutput(BaseModel):
    keyPoints: List[KeyPoint] = Field(..., min_length=3, max_length=5)
    isArabic: bool

# === Function tool (shared) — kept for reference, not used in v2 ===
# We pre-fetch the resource in Python to avoid tool call loops
@function_tool
def fetch_resource(ctx: RunContextWrapper, numericId: int) -> str:
    """Fetch an Examanet resource by numericId. Returns JSON with title, language, subject, OCR text."""
    r = _bulk.neon_query(f'''
        SELECT r.id, r.title, r.language, c.slug as cls, s.slug as subj,
               LEFT(rc."fullText", 3000) as text
        FROM "Resource" r
        JOIN "Class" c ON c.id = r."classId"
        LEFT JOIN "Subject" s ON s.id = r."subjectId"
        LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
        WHERE r."numericId" = {int(numericId)}
    ''')
    rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
    if not rows:
        return json.dumps({'error': f'Resource {numericId} not found'})
    return json.dumps(dict(rows[0]))


# === Pre-fetch helper (no tool needed in agent) ===
def fetch_resource_data(numericId: int) -> dict:
    """Pre-fetch a resource's data for the agent. No tool call needed."""
    r = _bulk.neon_query(f'''
        SELECT r.id, r.title, r.language, c.slug as cls, s.slug as subj,
               LEFT(rc."fullText", 3000) as text
        FROM "Resource" r
        JOIN "Class" c ON c.id = r."classId"
        LEFT JOIN "Subject" s ON s.id = r."subjectId"
        LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
        WHERE r."numericId" = {int(numericId)}
    ''')
    data = r.get('response', [{}])[0].get('data', {})
    fields = data.get('fields', [])
    rows = data.get('rows', [])
    if not rows:
        return {'error': f'Resource {numericId} not found'}
    return dict(zip(fields, rows[0]))

# === Specialist agents (no tools — data passed in input) ===
subject_agent = Agent(
    name="SubjectAgent",
    instructions="""Tu es un expert en synthèse pédagogique tunisienne pour le collège.

OBJECTIF: à partir d'un texte pédagogique fourni dans le message utilisateur, extraire
le **sujet général** (3-6 mots, même langue que le texte, concept spécifique).

EXEMPLES BONS: "Les fonctions logarithmes népériens", "La tectonique des plaques",
"الثورة الفرنسية 1789", "الضوء والعدسات", "حماية الدارات الكهربائية"
EXEMPLES À ÉVITER: "Mathématiques", "Exercices de maths", "الرياضيات", "تمارين رياضيات"

Renvoie UNIQUEMENT le sujet général (pas de phrase, pas de ponctuation finale).
""",
    output_type=SubjectOutput,
    model="gpt-4o-mini",
    model_settings=__import__('agents').ModelSettings(service_tier="flex"),  # 50% off, slower
)

keypoints_agent = Agent(
    name="KeyPointsAgent",
    instructions="""Tu es un expert en extraction de concepts-clés pour affichage en badges UI.

OBJECTIF: extraire 3 à 5 concepts COURTS (2-3 mots chacun) en AR ou FR selon le texte fourni.

⚠️ RÈGLE CRITIQUE — IGNORER LES MÉTADONNÉES DU DOCUMENT:
NE JAMAIS inclure dans les keyPoints:
- Le numéro/type de l'exercice ("الفرض 1", "devoir 3", "série 5", "اختبار", "examen")
- Le nom de l'école ("المدرسة الإعدادية", "النموذجية", "ابن سينا", etc.)
- La classe/niveau ("السنة السابعة", "الثامنة أساسي", "9ème année", "collège", "lycée")
- La matière seule ("الرياضيات", "الفيزياء", "mathématiques")
- L'année scolaire ("2014-2015", "2023-2024")
- Le nom du prof

→ Les keyPoints doivent UNIQUEMENT décrire le CONTENU PÉDAGOGIQUE du document.

RÈGLES:
- 3 à 5 concepts DISTINCTS
- Chaque concept = 2 à 3 mots MAX (courts pour badges)
- MÊME LANGUE que le texte (AR → AR, FR → FR)
- PAS de phrases, PAS de verbes conjugués, PAS de ponctuation
- Focus: concepts mathématiques/scientifiques/théoriques (ex: "نظرية", "قانون", "عملية", "تعريف", "خاصية")
- Pour les maths: privilégier les théorèmes, formules, types d'exercices
- Exemples BONS (AR): "حماية الدارات", "الدارة الكهربائية", "المصباح", "زاويتان متكاملتان", "قوى الأعداد", "عوامل أولية"
- Exemples BONS (FR): "Logarithme népérien", "Fonction dérivée", "Théorème de Pythagore"
- Exemples À ÉVITER: "الفرض 1", "المدرسة الإعدادية", "الرياضيات السابعة", "تمارين" (trop générique)
""",
    output_type=KeyPointsOutput,
    model="gpt-4o-mini",
    model_settings=__import__('agents').ModelSettings(service_tier="flex"),
)

# === Manual orchestrator (no sub-agents) ===
def run_orchestrator(numericId: int) -> dict:
    """Run both specialists on a single resource. Returns combined result."""
    t0 = time.time()
    
    # Step 0: Pre-fetch resource data (Python, not a tool)
    resource = fetch_resource_data(numericId)
    if 'error' in resource:
        raise ValueError(resource['error'])
    text = (resource.get('text') or '')[:3000]
    title = resource.get('title') or ''
    language = resource.get('language') or 'fr'
    
    # Step 1: Run subject agent (data passed in input, no tool needed)
    t_subject = time.time()
    subject_prompt = f"""Resource #{numericId}
Titre: {title}
Langue: {language}

Texte (3000 premiers caractères):
{text}

→ Sujet général (3-6 mots, même langue que le texte):"""
    subject_result = Runner.run_sync(
        subject_agent,
        input=subject_prompt,
        max_turns=2,
    )
    subject_out: SubjectOutput = subject_result.final_output
    subject_ms = int((time.time() - t_subject) * 1000)
    
    # Step 2: Run keypoints agent
    t_kp = time.time()
    kp_prompt = f"""Resource #{numericId}
Titre: {title}
Langue: {language}

Texte (3000 premiers caractères):
{text}

→ Extraire 3-5 concepts-clés (2-3 mots chacun, même langue):"""
    kp_result = Runner.run_sync(
        keypoints_agent,
        input=kp_prompt,
        max_turns=2,
    )
    kp_out: KeyPointsOutput = kp_result.final_output
    kp_ms = int((time.time() - t_kp) * 1000)
    
    total_ms = int((time.time() - t0) * 1000)
    
    return {
        'numericId': numericId,
        'generalSubject': subject_out.generalSubject,
        'generalSubjectIsAr': subject_out.isArabic,
        'keyPoints': [kp.text for kp in kp_out.keyPoints],
        'keyPointsIsAr': kp_out.isArabic,
        'subjectMs': subject_ms,
        'keypointsMs': kp_ms,
        'totalMs': total_ms,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=3)
    ap.add_argument('--offset', type=int, default=0)
    args = ap.parse_args()
    
    print(f"Fetching {args.limit} resources (offset={args.offset})...", flush=True)
    r = _bulk.neon_query(f'''
        SELECT r."numericId", r.language
        FROM "Resource" r
        JOIN "Class" c ON c.id = r."classId"
        LEFT JOIN "Subject" s ON s.id = r."subjectId"
        WHERE s.slug = 'technologie'
          AND c.slug = '7eme'
          AND r."publishedAt" IS NOT NULL
        ORDER BY r."numericId"
        LIMIT {args.limit} OFFSET {args.offset}
    ''')
    rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
    print(f"Found {len(rows)} resources\n", flush=True)
    
    total_ms = 0
    for row in rows:
        numericId = row[0]
        try:
            result = run_orchestrator(numericId)
            total_ms += result['totalMs']
            print(f"\n--- #{numericId} ({result['totalMs']}ms) ---")
            print(f"  subject: {result['generalSubject']}")
            print(f"  keyPoints: {result['keyPoints']}")
        except Exception as e:
            print(f"\n--- #{numericId} ERROR: {e} ---")
            import traceback; traceback.print_exc()
    
    print(f"\n=== {len(rows)} resources, avg {total_ms/max(1,len(rows)):.0f}ms ===")


if __name__ == '__main__':
    main()
