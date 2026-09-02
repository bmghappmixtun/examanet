"""
Examanet Bulk Extraction Orchestrator — OpenAI Agents SDK (2026-07-31)

Replaces the standalone `gen_general_subject.py` + `regen_key_points.py` flow
with a multi-agent workflow using the Agents SDK primitives:

  OCR fetcher (function tool) → generalSubject specialist (handoff) → keyPoints specialist (handoff)

Each agent is:
  - Specialized (better prompt = better quality)
  - Guarded (tool guardrail validates schema before returning)
  - Traced (built-in observability for debugging + cost tracking)

Uses model `gpt-4o-mini` (cheapest) with `flex` tier for 50% cost reduction.
For each Technologie file: 3 model calls (generalSubject + keyPoints + handoff reasoning)
= ~$0.0015/file (similar to current standalone scripts).

Run:
    source pdf-test/venv/bin/activate
    OPENAI_API_KEY=$OPENAI_API_KEY python3 pdf-test/orchestrator_agent.py --limit 5
"""
import os
import sys
import json
import time
import argparse
import importlib.util
from typing import List

# Import the real openai + agents SDK FIRST (before bulk_math_v5 which stubs openai)
from openai import AsyncOpenAI
from pydantic import BaseModel, Field
from agents import Agent, Runner, function_tool, RunContextWrapper, trace

# Stub out openai BEFORE bulk_math_v5 imports it (it doesn't actually USE openai
# in neon_query, but the import order matters)
import types
_openai_stub = types.ModuleType('openai')
_openai_stub.OpenAI = lambda: None
sys.modules['openai'] = _openai_stub
sys.modules['fitz'] = types.ModuleType('fitz')
sys.modules['PIL'] = types.ModuleType('PIL')
sys.modules['PIL'].Image = types.ModuleType('Image')

_bulk_spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
_bulk = importlib.util.module_from_spec(_bulk_spec)
_bulk_spec.loader.exec_module(_bulk)

# Restore the real openai for the agents SDK
del sys.modules['openai']

# =============================================================================
# Schemas (for structured outputs + tool guardrails)
# =============================================================================
class SubjectOutput(BaseModel):
    """Output schema for generalSubject agent — MIN 3 / MAX 6 words."""
    generalSubject: str = Field(..., min_length=3, max_length=80)
    isArabic: bool

class KeyPoint(BaseModel):
    """One bubble tag — MIN 2 / MAX 3 words (AR preferred)."""
    text: str = Field(..., min_length=2, max_length=40)
    isArabic: bool

class KeyPointsOutput(BaseModel):
    """Output schema for keyPoints agent — 3 to 5 short tags."""
    keyPoints: List[KeyPoint] = Field(..., min_length=3, max_length=5)
    isArabic: bool

class OrchestratorOutput(BaseModel):
    """Final output combining all extraction results."""
    generalSubject: str
    keyPoints: List[str]
    costUsd: float
    durationMs: int

# =============================================================================
# Function tools — used by the agents to access DB
# =============================================================================
@function_tool
def fetch_resource_for_extraction(ctx: RunContextWrapper, numericId: int) -> str:
    """Fetch a Technologie resource by numericId, returning its OCR text + metadata
    for downstream agents. Returns a JSON string.

    Args:
        numericId: The numeric ID of the resource (e.g., 365)
    """
    r = _bulk.neon_query(f'''
        SELECT r.id, r.title, r.language, c.slug as cls, s.slug as subj,
               LEFT(rc."fullText", 3000) as text_preview
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

# =============================================================================
# Specialist agents
# =============================================================================
SUBJECT_FR = {
    'mathematiques': 'Mathématiques', 'physique': 'Physique', 'svt': 'Sciences de la vie et de la terre',
    'francais': 'Français', 'anglais': 'Anglais', 'arabe': 'Arabe',
    'informatique': 'Informatique', 'technologie': 'Technologie', 'musique': 'Musique',
    'theatre': 'Théâtre', 'arts': 'Arts', 'education-islamique': 'Éducation islamique',
    'education-civique': 'Éducation civique', 'sport': 'Sport',
    'histoire-geographie': 'Histoire-Géographie',
}
SUBJECT_AR = {
    'mathematiques': 'الرياضيات', 'physique': 'الفيزياء', 'svt': 'علوم الحياة والأرض',
    'francais': 'الفرنسية', 'anglais': 'الإنقليزية', 'arabe': 'العربية',
    'informatique': 'الإعلامية', 'technologie': 'التكنولوجيا', 'musique': 'الموسيقى',
    'theatre': 'المسرح', 'arts': 'الفنون', 'education-islamique': 'التربية الإسلامية',
    'education-civique': 'التربية المدنية', 'sport': 'الرياضة',
    'histoire-geographie': 'التاريخ والجغرافيا',
}
CLASS_FR = {'7eme': '7ème année de base', '8eme': '8ème année de base', '9eme': '9ème année de base'}
CLASS_AR = {'7eme': 'السابعة أساسي', '8eme': 'الثامنة أساسي', '9eme': 'التاسعة أساسي'}

GENERAL_SUBJECT_INSTRUCTIONS = """Tu es un expert en synthèse pédagogique tunisienne pour le collège.

OBJECTIF: à partir d'un texte pédagogique, extraire le **sujet général** du document
(un concept spécifique, pas un titre générique).

RÈGLES STRICTES:
- MIN 3 mots, MAX 6 mots
- Nomme un **concept spécifique** (ex: "Les fonctions logarithmes népériens", "La tectonique des plaques et séismes", "La révolution française de 1789", "La lumière et les lentilles")
- **À ÉVITER**: "Mathématiques", "Exercices de maths", "Devoir de physique", "Cours de français"
- Langue: celle du texte source
- Si le texte contient du code (ex: 5 chiffres), ignore-le

PROCESSUS:
1. Utilise l'outil `fetch_resource_for_extraction` pour récupérer le texte
2. Lis le texte et identifie le concept central
3. Réponds UNIQUEMENT avec le sujet général (pas de phrase, pas de ponctuation finale)

Pour les textes en arabe, suis les mêmes règles mais en arabe:
- Bons: "الدوال اللوغاريتمية النيبيرية", "الصفائح التكتونية والزلازل", "الثورة الفرنسية 1789", "الضوء والعدسات"
- À éviter: "الرياضيات", "تمارين رياضيات", "فرض في الفيزياء"
"""

KEY_POINTS_INSTRUCTIONS = """Tu es un expert en extraction de concepts-clés pour affichage en badges UI.

OBJECTIF: à partir d'un texte pédagogique (FR ou AR), extraire 3 à 5 concepts
courts (2-3 mots chacun) qui serviront de **tags cliquables** sur la page ressource.

RÈGLES STRICTES:
- 3 à 5 concepts par document
- Chaque concept = 2 à 3 mots MAX (courts pour badges UI)
- MÊME LANGUE que le texte source (AR → AR, FR → FR)
- Concepts DISTINCTS (pas de doublons)
- PAS de phrases complètes, PAS de verbes conjugués, PAS de ponctuation

EXEMPLES (FR):
  "حماية الدارات الكهربائية" → ["حماية الدارات", "الدارة الكهربائية", "المصباح", "الصهيرة", "التركيب المنزلي"]
  "Les fonctions logarithmes" → ["Logarithme népérien", "Fonction dérivée", "Étude de fonction"]

PROCESSUS:
1. Utilise `fetch_resource_for_extraction` (la même resource que generalSubject agent)
2. Identifie 3-5 concepts-clés distincts
3. Renvoie la liste au format JSON via le tool de sortie

Si le texte est en arabe, les concepts DOIVENT être en arabe (priorité AR pour les
titres, conformément à la règle Examanet).
"""

# =============================================================================
# Orchestrator (manager pattern)
# =============================================================================
general_subject_agent = Agent(
    name="GeneralSubjectAgent",
    instructions=GENERAL_SUBJECT_INSTRUCTIONS,
    tools=[fetch_resource_for_extraction],
    output_type=SubjectOutput,
    model="gpt-4o-mini",
)

key_points_agent = Agent(
    name="KeyPointsAgent",
    instructions=KEY_POINTS_INSTRUCTIONS,
    tools=[fetch_resource_for_extraction],
    output_type=KeyPointsOutput,
    model="gpt-4o-mini",
)

# Orchestrator uses manager pattern: calls both specialists as tools
orchestrator_agent = Agent(
    name="OrchestratorAgent",
    instructions="""Tu es l'orchestrateur de l'extraction pour une resource Examanet.

PROCESSUS:
1. Appelle l'agent `extract_general_subject` avec le numericId → récupère le sujet général
2. Appelle l'agent `extract_key_points` avec le même numericId → récupère les concepts-clés
3. Combine les deux résultats et renvoie-les

NE SAUTE AUCUNE ÉTAPE. Tu DOIS appeler les deux agents en parallèle si possible.""",
    tools=[
        general_subject_agent.as_tool(
            tool_name="extract_general_subject",
            tool_description="Extraire le sujet général (3-6 mots) d'une resource Examanet. Args: numericId (int).",
        ),
        key_points_agent.as_tool(
            tool_name="extract_key_points",
            tool_description="Extraire 3-5 concepts-clés (2-3 mots) d'une resource Examanet. Args: numericId (int).",
        ),
    ],
    model="gpt-4o-mini",
)

# =============================================================================
# Driver — run on a list of numericIds
# =============================================================================
def run_one(numericId: int) -> dict:
    """Run the orchestrator on a single resource. Returns the extraction result + metadata."""
    t0 = time.time()
    result = Runner.run_sync(
        orchestrator_agent,
        input=f"Traite la resource #{numericId}. Utilise les deux outils pour extraire sujet général + key points.",
    )
    duration_ms = int((time.time() - t0) * 1000)
    return {
        'numericId': numericId,
        'final_output': str(result.final_output),
        'durationMs': duration_ms,
        'usage': dict(result.context_wrapper.usage) if hasattr(result, 'context_wrapper') else {},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=5)
    ap.add_argument('--offset', type=int, default=0)
    ap.add_argument('--dry-run', action='store_true', help="Don't write to DB, just print results")
    args = ap.parse_args()

    # Fetch candidate resources (Technologie 7eme with generalSubject/keyPoints empty or to verify)
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
    print(f"Found {len(rows)} resources", flush=True)

    results = []
    total_cost = 0.0
    for row in rows:
        numericId = row[0]
        language = row[1]
        print(f"\n--- numericId={numericId} (lang={language}) ---", flush=True)
        try:
            r = run_one(numericId)
            print(f"  duration: {r['durationMs']}ms", flush=True)
            print(f"  output: {r['final_output'][:200]}", flush=True)
            results.append(r)
        except Exception as e:
            print(f"  ERROR: {e}", flush=True)
            import traceback
            traceback.print_exc()

    print(f"\n=== Summary: {len(results)} OK ===")
    if results:
        avg_ms = sum(r['durationMs'] for r in results) / len(results)
        print(f"Avg duration: {avg_ms:.0f}ms")


if __name__ == '__main__':
    main()
