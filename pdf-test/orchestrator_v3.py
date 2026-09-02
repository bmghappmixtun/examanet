"""
Examanet Bulk Extraction Orchestrator v3 — With metadata extractor + guardrails (2026-07-31)

Extends v2 with:
  1. **MetadataExtractor agent** — pulls structured metadata from OCR text:
     - profName (FR + AR)
     - schoolName (FR + AR)
     - resourceType (DEVOIR, EXAM, EXERCISE, COURSE, OTHER)
     - academicYear (e.g. "2014-2015")
     - trimestre (1, 2, 3)
     - duration (e.g. "1h", "2 heures")
  2. **Anti-generic guardrail** on KeyPointsAgent:
     - Uses output_guardrail to reject keyPoints containing "generic" words
     - Forces the model to retry with stricter prompt
  3. **3 specialist agents** in sequence (subject, keypoints, metadata)

Total: 3 model calls per resource
Cost: ~$0.0009/file (gpt-4o-mini @ flex tier)
"""
import os
import sys
import json
import time
import argparse
import importlib.util
import types
from typing import List, Optional

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

# === Import agents SDK ===
del sys.modules['openai']
from pydantic import BaseModel, Field, field_validator
from agents import (
    Agent, Runner, function_tool, RunContextWrapper,
    set_tracing_disabled, GuardrailFunctionOutput, InputGuardrailTripwireTriggered,
    OutputGuardrailTripwireTriggered, output_guardrail, RunContextWrapper,
)

set_tracing_disabled(True)

# === Schemas ===

# Generic words to reject in keyPoints (anti-generic guardrail)
GENERIC_KP_WORDS = {
    # Type/number of exercise
    'فرض', 'الفرض', 'مراقبة', 'اختبار', 'تأليفي', 'سلسلة', 'تمارين',
    'devoir', 'examen', 'contrôle', 'série',
    # School
    'المدرسة', 'الإعدادية', 'النموذجية', 'المعهد', 'الثانوية', 'الكلية',
    'école', 'collège', 'lycée', 'institut', 'college',
    # Class/level
    'السنة', 'أساسي', 'الثامنة', 'التاسعة', 'السابعة', 'الأولى', 'الثانية', 'الثالثة', 'الرابعة',
    'année', 'niveau',
    # Subject alone
    'الرياضيات', 'الفيزياء', 'علوم', 'الفرنسية', 'الإنقليزية', 'العربية',
    'mathématiques', 'physique', 'sciences',
    # Year
    '2010', '2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026',
    # Generic
    'الإجابة', 'صحيحة', 'التمرين', 'المدرسة', 'التعليم', 'مدرس',
}


class SubjectOutput(BaseModel):
    generalSubject: str = Field(..., min_length=3, max_length=80)
    isArabic: bool


class KeyPoint(BaseModel):
    text: str = Field(..., min_length=2, max_length=40)
    isArabic: bool


class KeyPointsOutput(BaseModel):
    keyPoints: List[KeyPoint] = Field(..., min_length=3, max_length=5)
    isArabic: bool

    # Note: anti-generic validation is done in the output_guardrail, NOT here.
    # Pydantic validators throw ValidationError → ModelBehaviorError, which
    # can't trigger the retry loop. The output guardrail fires OutputGuardrailTripwireTriggered
    # which is catchable for retry.


class MetadataOutput(BaseModel):
    """Structured metadata extracted from the OCR text."""
    profFirstNameFr: Optional[str] = None
    profLastNameFr: Optional[str] = None
    profFirstNameAr: Optional[str] = None
    profLastNameAr: Optional[str] = None
    schoolNameFr: Optional[str] = None
    schoolNameAr: Optional[str] = None
    resourceType: str = Field(..., description="DEVOIR, EXAM, EXERCISE, COURSE, SUMMARY, OTHER")
    academicYear: Optional[str] = None  # e.g. "2014-2015"
    trimestre: Optional[str] = None  # "1", "2", "3", or null
    duration: Optional[str] = None  # e.g. "1h", "2 heures", "ساعة"
    confidence: float = Field(..., ge=0, le=1, description="0-1 confidence score")

    @field_validator('resourceType')
    @classmethod
    def validate_type(cls, v):
        valid = {'DEVOIR', 'EXAM', 'EXERCISE', 'COURSE', 'SUMMARY', 'OTHER'}
        v = v.upper().strip()
        if v not in valid:
            return 'OTHER'
        return v


# === Pre-fetch helper ===
def fetch_resource_data(numericId: int) -> dict:
    """Pre-fetch a resource's data for the agent. No tool call needed."""
    r = _bulk.neon_query(f'''
        SELECT r.id, r.title, r.language, c.slug as cls, s.slug as subj,
               LEFT(rc."fullText", 4000) as text
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


# === Output guardrail (anti-generic) ===
@output_guardrail
async def anti_generic_kp_guardrail(
    ctx: RunContextWrapper,
    agent: Agent,
    output: KeyPointsOutput,
) -> GuardrailFunctionOutput:
    """Reject keyPoints output if it contains too many generic terms.

    Triggers tripwire if 2+ keyPoints are too generic.
    """
    if not isinstance(output, KeyPointsOutput):
        return GuardrailFunctionOutput(
            output_info={"tripwire": False, "reason": "wrong type"},
            tripwire_triggered=False,
        )

    generic_count = 0
    generic_items = []
    for kp in output.keyPoints:
        for word in GENERIC_KP_WORDS:
            if word in kp.text:
                generic_count += 1
                generic_items.append(f"{kp.text!r} contains {word!r}")
                break

    # Tripwire if 30%+ of keyPoints are generic
    threshold = max(1, int(len(output.keyPoints) * 0.3))
    if generic_count >= threshold:
        return GuardrailFunctionOutput(
            output_info={
                "tripwire": True,
                "generic_count": generic_count,
                "items": generic_items,
            },
            tripwire_triggered=True,
        )

    return GuardrailFunctionOutput(
        output_info={"tripwire": False, "generic_count": generic_count},
        tripwire_triggered=False,
    )


# === Specialist agents ===
subject_agent = Agent(
    name="SubjectAgent",
    instructions="""Tu es un expert en synthèse pédagogique tunisienne pour le collège.

OBJECTIF: à partir d'un texte pédagogique fourni dans le message utilisateur, extraire
le **sujet général** (3-6 mots, même langue que le texte, concept spécifique).

EXEMPLES BONS: "Les fonctions logarithmes népériens", "La tectonique des plaques",
"الثورة الفرنسية 1789", "الضوء والعدسات", "حماية الدارات الكهربائية"
EXEMPLES À ÉVITER: "Mathématiques", "Exercices de maths", "الرياضيات", "تمارين رياضيات"

Renvoie UNIQUEMENT le sujet général (pas de phrase, pas de ponctuation finale).""",
    output_type=SubjectOutput,
    model="gpt-4o-mini",
    model_settings=__import__('agents').ModelSettings(service_tier="flex"),
)

keypoints_agent = Agent(
    name="KeyPointsAgent",
    instructions="""Tu es un expert en extraction de concepts-clés pour affichage en badges UI.

OBJECTIF: extraire 3 à 5 concepts COURTS (2-3 mots chacun) en AR ou FR selon le texte fourni.

⚠️ RÈGLE CRITIQUE — IGNORER LES MÉTADONNÉES DU DOCUMENT:
NE JAMAIS inclure dans les keyPoints:
- Le numéro/type de l'exercice (فرض, مراقبة, اختبار, تأليفي, devoir, examen, série, contrôle)
- Le nom de l'école (المدرسة, الإعدادية, النموذجية, ابن سينا, collège, lycée)
- La classe/niveau (السنة السابعة, الثامنة, التاسعة, année, niveau, 7ème)
- La matière seule (الرياضيات, الفيزياء, mathématiques, physique)
- L'année scolaire (2014-2015, 2023-2024)
- Le nom du prof (Mr, Mme, Mlle + nom)
- Les mots "إجابة", "صحيحة", "مدرس", "التمرين"

→ Les keyPoints doivent UNIQUEMENT décrire le CONTENU PÉDAGOGIQUE du document.

RÈGLES:
- 3 à 5 concepts DISTINCTS
- Chaque concept = 2 à 3 mots MAX (courts pour badges)
- MÊME LANGUE que le texte (AR → AR, FR → FR)
- PAS de phrases, PAS de verbes conjugués, PAS de ponctuation
- Focus: concepts mathématiques/scientifiques/théoriques

EXEMPLES BONS:
  (AR): "حماية الدارات", "الدارة الكهربائية", "زاويتان متكاملتان", "قوى الأعداد", "عوامل أولية", "القيمة المطلقة", "المعادلات"
  (FR): "Logarithme népérien", "Fonction dérivée", "Théorème de Pythagore", "Factorisation"

EXEMPLES À ÉVITER: "الفرض 1", "المدرسة الإعدادية", "الرياضيات السابعة", "تمارين عددية" (trop générique), "رياضيات أساسية" (trop générique)""",
    output_type=KeyPointsOutput,
    model="gpt-4o-mini",
    model_settings=__import__('agents').ModelSettings(service_tier="flex"),
    output_guardrails=[anti_generic_kp_guardrail],
)

metadata_agent = Agent(
    name="MetadataExtractorAgent",
    instructions="""Tu es un expert en extraction de métadonnées à partir de PDFs éducatifs tunisiens.

OBJECTIF: à partir du texte d'un PDF éducatif tunisien, extraire les métadonnées suivantes:

1. **profName** (Nom du prof):
   - profFirstNameFr + profLastNameFr (en français/latin)
   - profFirstNameAr + profLastNameAr (en arabe)
   - Si 2 profs avec trait d'union (ex: "العياري-العبيدي"), c'est 2 profs distincts (seulement leurs noms de famille)
   - Si tu ne trouves pas, mets null

2. **schoolName** (Nom de l'école/établissement):
   - schoolNameFr (en français) + schoolNameAr (en arabe)
   - Si tu ne trouves pas, mets null

3. **resourceType** (Type de la resource):
   - DEVOIR (فرض مراقبة / فرض تأليفي / contrôle / devoir surveillé / devoir de synthèse)
   - EXAM (اختبار / امتحان / examen)
   - EXERCISE (سلسلة تمارين / تمارين / exercices)
   - COURSE (درس / cours)
   - SUMMARY (ملخص / résumé)
   - OTHER (autre / unknown)

4. **academicYear** (Année scolaire, ex: "2014-2015" ou "2023-2024")

5. **trimestre** (1, 2, 3, ou null si non trouvé)

6. **duration** (Durée du devoir, ex: "1h", "2 heures", "ساعة واحدة", null si non trouvé)

7. **confidence** (Ton score de confiance 0-1)

⚠️ RÈGLES IMPORTANTES:
- En Tunisie, les PDF scolaires ont généralement un en-tête avec: école, prof, classe, année
- L'année est souvent au format "2014-2015" ou "2014 - 2015"
- Le prof est souvent préfixé par "Mr", "Mme", "Mlle", "الأستاذ" (FR: "M." "Mme")
- Si tu ne trouves pas une info, mets null plutôt qu'inventer
- confidence < 0.5 si tu n'es pas sûr des valeurs extraites

PROCESSUS:
1. Lis le texte attentivement
2. Cherche les indices: "Lycée X", "Collège Y", "Mr Z", "2014-2015", "السنة السابعة", "الفصل 1"
3. Extrais chaque champ avec confiance
4. Renvoie le JSON structuré""",
    output_type=MetadataOutput,
    model="gpt-4o-mini",
    model_settings=__import__('agents').ModelSettings(service_tier="flex"),
)


# === Manual orchestrator (3 specialists) ===
def run_orchestrator(numericId: int) -> dict:
    """Run all 3 specialists on a single resource. Returns combined result + metadata."""
    t0 = time.time()
    
    # Step 0: Pre-fetch resource data
    resource = fetch_resource_data(numericId)
    if 'error' in resource:
        raise ValueError(resource['error'])
    text = (resource.get('text') or '')[:4000]
    title = resource.get('title') or ''
    language = resource.get('language') or 'fr'
    cls = resource.get('cls') or ''
    subj = resource.get('subj') or ''
    
    # Step 1: Subject
    t1 = time.time()
    subject_result = Runner.run_sync(
        subject_agent,
        input=f"""Resource #{numericId}
Titre: {title}
Classe: {cls}
Matière: {subj}
Langue: {language}

Texte (4000 premiers caractères):
{text}

→ Sujet général (3-6 mots, même langue que le texte):""",
        max_turns=2,
    )
    subject_out: SubjectOutput = subject_result.final_output
    t_subject = int((time.time() - t1) * 1000)
    
    # Step 2: Key points (with anti-generic guardrail)
    t2 = time.time()
    kp_guardrail_triggered = False
    kp_guardrail_info = None
    try:
        kp_result = Runner.run_sync(
            keypoints_agent,
            input=f"""Resource #{numericId}
Titre: {title}
Classe: {cls}
Matière: {subj}
Langue: {language}

Texte (4000 premiers caractères):
{text}

→ Extraire 3-5 concepts-clés (2-3 mots chacun, UNIQUEMENT du contenu pédagogique, PAS de métadonnées):""",
            max_turns=2,
        )
        kp_out: KeyPointsOutput = kp_result.final_output
    except OutputGuardrailTripwireTriggered as e:
        kp_guardrail_triggered = True
        kp_guardrail_info = str(e)
        # Retry with a stronger prompt
        kp_result = Runner.run_sync(
            keypoints_agent,
            input=f"""⚠️ ATTENTION: ta réponse précédente a été REJETÉE car elle contenait des MÉTADONNÉES (nom d'école, type d'exercice, classe, matière, année). 

Resource #{numericId} (matière={subj}, classe={cls}, langue={language})
Texte (3000 premiers caractères):
{text[:3000]}

→ Extrais UNIQUEMENT des concepts PÉDAGOGIQUES (théorèmes, formules, types d'exercices spécifiques, notions). 2-3 mots MAX, MÊME LANGUE que le texte.""",
            max_turns=2,
        )
        kp_out: KeyPointsOutput = kp_result.final_output
    t_kp = int((time.time() - t2) * 1000)
    
    # Step 3: Metadata
    t3 = time.time()
    metadata_result = Runner.run_sync(
        metadata_agent,
        input=f"""Resource #{numericId}
Titre: {title}
Classe: {cls} (DB value)
Matière: {subj} (DB value)
Langue: {language}

Texte (4000 premiers caractères):
{text}

→ Extraire les métadonnées structurées (prof, école, type, année, trimestre, durée). Mets null si introuvable.""",
        max_turns=2,
    )
    metadata_out: MetadataOutput = metadata_result.final_output
    t_meta = int((time.time() - t3) * 1000)
    
    total_ms = int((time.time() - t0) * 1000)
    
    return {
        'numericId': numericId,
        'generalSubject': subject_out.generalSubject,
        'generalSubjectIsAr': subject_out.isArabic,
        'keyPoints': [kp.text for kp in kp_out.keyPoints],
        'keyPointsIsAr': kp_out.isArabic,
        'kp_guardrail_triggered': kp_guardrail_triggered,
        'kp_guardrail_info': kp_guardrail_info,
        'metadata': {
            'profFirstNameFr': metadata_out.profFirstNameFr,
            'profLastNameFr': metadata_out.profLastNameFr,
            'profFirstNameAr': metadata_out.profFirstNameAr,
            'profLastNameAr': metadata_out.profLastNameAr,
            'schoolNameFr': metadata_out.schoolNameFr,
            'schoolNameAr': metadata_out.schoolNameAr,
            'resourceType': metadata_out.resourceType,
            'academicYear': metadata_out.academicYear,
            'trimestre': metadata_out.trimestre,
            'duration': metadata_out.duration,
            'confidence': metadata_out.confidence,
        },
        'subjectMs': t_subject,
        'keypointsMs': t_kp,
        'metadataMs': t_meta,
        'totalMs': total_ms,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=10)
    ap.add_argument('--offset', type=int, default=0)
    ap.add_argument('--class-filter', default='7eme', help='e.g. 7eme, 8eme, 9eme')
    ap.add_argument('--subject', default='mathematiques')
    args = ap.parse_args()
    
    print(f"Fetching {args.limit} {args.subject} collège {args.class_filter} resources (offset={args.offset})...", flush=True)
    r = _bulk.neon_query(f'''
        SELECT r."numericId", r.language
        FROM "Resource" r
        JOIN "Class" c ON c.id = r."classId"
        LEFT JOIN "Subject" s ON s.id = r."subjectId"
        WHERE s.slug = '{args.subject}'
          AND c.slug = '{args.class_filter}'
          AND r."publishedAt" IS NOT NULL
        ORDER BY r."numericId"
        LIMIT {args.limit} OFFSET {args.offset}
    ''')
    rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
    print(f"Found {len(rows)} resources\n", flush=True)
    
    results = []
    total_ms = 0
    for row in rows:
        numericId = int(row[0])
        try:
            result = run_orchestrator(numericId)
            total_ms += result['totalMs']
            
            print(f"\n{'═' * 100}")
            print(f"#{numericId} ({result['totalMs']}ms total: subject={result['subjectMs']}ms, kp={result['keypointsMs']}ms, meta={result['metadataMs']}ms)")
            print(f"{'═' * 100}")
            print(f"  📚 Subject:  {result['generalSubject']}  {'(AR)' if result['generalSubjectIsAr'] else '(FR)'}")
            print(f"  🏷️  KeyPoints ({len(result['keyPoints'])}): {result['keyPoints']}")
            
            if result['kp_guardrail_triggered']:
                print(f"  ⚠️  Anti-generic guardrail TRIGGERED (retried)")
            
            m = result['metadata']
            print(f"  👤 Prof:     {m['profFirstNameFr'] or '?'} {m['profLastNameFr'] or '?'}  /  {m['profFirstNameAr'] or '?'} {m['profLastNameAr'] or '?'}")
            print(f"  🏫 School:   {m['schoolNameFr'] or '?'}  /  {m['schoolNameAr'] or '?'}")
            print(f"  📋 Type:     {m['resourceType']}")
            print(f"  📅 Year:     {m['academicYear'] or '?'}  | Trim: {m['trimestre'] or '?'}  | Duration: {m['duration'] or '?'}")
            print(f"  🎯 Confidence: {m['confidence']:.2f}")
            
            results.append(result)
        except Exception as e:
            print(f"\n#{numericId} ERROR: {e}")
            import traceback; traceback.print_exc()
    
    # Global summary
    if results:
        print(f"\n{'═' * 100}")
        print(f"GLOBAL SUMMARY: {len(results)}/{len(rows)} OK, avg {total_ms/len(results):.0f}ms")
        print(f"{'═' * 100}")
        guardrail_count = sum(1 for r in results if r['kp_guardrail_triggered'])
        print(f"Anti-generic guardrail triggered: {guardrail_count}/{len(results)} times")
        print(f"Prof detected:  {sum(1 for r in results if r['metadata']['profLastNameFr'])}/{len(results)}")
        print(f"School detected: {sum(1 for r in results if r['metadata']['schoolNameFr'])}/{len(results)}")
        print(f"Type detected:  {sum(1 for r in results if r['metadata']['resourceType'] != 'OTHER')}/{len(results)}")
        print(f"Year detected:  {sum(1 for r in results if r['metadata']['academicYear'])}/{len(results)}")


if __name__ == '__main__':
    main()
