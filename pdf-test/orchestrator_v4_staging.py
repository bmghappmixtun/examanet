#!/usr/bin/env python3
"""
Orchestrator v4 — STAGING version.

Reads text from ResourceContentStaging (Tesseract re-OCR output)
INSTEAD of the live ResourceContent table.

Generates AI metadata (subject, keyPoints, prof, school, type, year, etc.)
Saves results to ResourceMetadataStaging.

NO modifications to the live DB or UI.
"""
import os, json, time, sys, re, argparse, importlib.util
from pathlib import Path

# Load v4 from original
spec = importlib.util.spec_from_file_location('orchestrator_v4', '/workspace/edutunisie/pdf-test/orchestrator_v4.py')
v4 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v4)

# Re-use the v4 utilities
# neon_query is imported from _bulk (bulk_math_v5)
import importlib.util as _il
_bulk_spec = _il.spec_from_file_location('_bulk', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
_bulk = _il.module_from_spec(_bulk_spec)
_bulk_spec.loader.exec_module(_bulk)
neon_query = _bulk.neon_query


def fetch_staging_data(numeric_id):
    """Fetch text from staging (Tesseract) instead of live ResourceContent."""
    sql = f'''
    SELECT rcs."resourceId", rcs."numericId", rcs."stagingText", rcs."pageCount", rcs."stagingMethod",
           r."title", r."fileKey", c.slug AS class_slug, s.slug AS subject_slug,
           rcs."degradationScore", rcs."degradationReasons"
    FROM "ResourceContentStaging" rcs
    JOIN "Resource" r ON r.id = rcs."resourceId"
    LEFT JOIN "Class" c ON c.id = r."classId"
    LEFT JOIN "Subject" s ON s.id = r."subjectId"
    WHERE rcs."numericId" = {numeric_id}
    '''
    result = neon_query(sql)
    if not result.get('response') or not result['response'][0].get('data', {}).get('rows'):
        return None
    return result['response'][0]['data']['rows'][0]


def get_staging_ids(limit=10000, offset=0):
    """Get numericIds that have been re-OCR'd in staging."""
    sql = f'''
    SELECT "numericId" FROM "ResourceContentStaging"
    WHERE "stagingText" IS NOT NULL
    ORDER BY "numericId"
    LIMIT {limit} OFFSET {offset}
    '''
    result = neon_query(sql)
    if result.get('response') and result['response'][0].get('data', {}).get('rows'):
        return [int(row[0]) for row in result['response'][0]['data']['rows']]
    return []


def run_orchestrator_on_staging_text(numeric_id, dry_run=True):
    """Run orchestrator v4 on staging text for one resource."""
    data = fetch_staging_data(numeric_id)
    if not data:
        return {'id': numeric_id, 'status': 'NOT_IN_STAGING'}
    
    resource_id, _, text, page_count, method, title, file_key, class_slug, subject_slug, deg_score, deg_reasons = data
    text = text or ''
    
    # Use the v4 pre-extraction
    pre_hints = v4.pre_extract_metadata(text, title or '')
    
    # Call the 3 specialist agents directly (subject, keyPoints, metadata)
    from openai import OpenAI
    client = OpenAI()
    
    # Use flex tier for non-urgent (50% off)
    # Actually no, we need speed here. Use default tier.
    
    # 1. Subject extraction
    subject_prompt = f"""Tu es un expert en classification de ressources éducatives tunisiennes.

Classe: {class_slug or '?'}
Sujet connu: {subject_slug or '?'}
Titre: {title or ''}

Texte du document (premiers 3000 chars):
{text[:3000]}

Détermine le sujet général de ce document (ex: "Les nombres réels", "La poésie", "La cellule").

Retourne un objet JSON avec le champ "subject".
Exemple: {{"subject": "Les nombres réels"}}"""
    
    try:
        sub_resp = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[{'role': 'user', 'content': subject_prompt}],
            response_format={'type': 'json_object'},
            max_tokens=100,
        )
        subject_data = json.loads(sub_resp.choices[0].message.content)
        subject_fr = subject_data.get('subject') or subject_data.get('sujet') or subject_data.get('name') or subject_data.get('title') or ''
    except Exception as e:
        return {'id': numeric_id, 'status': 'SUBJECT_ERROR', 'error': str(e)}
    
    # 2. Key points extraction
    kp_prompt = f"""Tu es un expert en pédagogie tunisienne.

Sujet: {subject_fr}
Classe: {class_slug or '?'}
Titre: {title or ''}

Texte du document (premiers 4000 chars):
{text[:4000]}

Identifie les 4-6 concepts/points clés de ce document. 
Pour chaque point, donne un TITRE COURT (2-3 mots MAX) en français qui sera affiché comme un badge cliquable.
Exemples: "Nombres réels", "Équations", "Théorème de Pythagore"

Retourne un JSON: {{"key_points": ["point1", "point2", ...]}}"""
    
    try:
        kp_resp = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[{'role': 'user', 'content': kp_prompt}],
            response_format={'type': 'json_object'},
            max_tokens=200,
        )
        kp_data = json.loads(kp_resp.choices[0].message.content)
        key_points = kp_data.get('key_points', [])
        if not isinstance(key_points, list):
            key_points = []
    except Exception as e:
        key_points = []
    
    # 3. Metadata extraction
    hints_str = json.dumps(pre_hints, ensure_ascii=False)
    meta_prompt = f"""Tu es un expert en extraction de métadonnées pour documents scolaires tunisiens.

Sujet: {subject_fr}
Classe: {class_slug or '?'}
Sujet DB: {subject_slug or '?'}
Titre: {title or ''}

Texte du document (premiers 3000 chars):
{text[:3000]}

Indices regex pré-extraits: {hints_str}

Extrais les métadonnées suivantes en JSON:
- profLastName: nom du prof en français (sans titre)
- profLastNameAr: nom du prof en arabe
- schoolName: nom de l'école en français
- schoolNameAr: nom de l'école en arabe
- type: type de document (DEVOIR/EXERCICE/EXAMEN/COURSE/RESUME)
- academicYear: année scolaire (ex: "2019-2020") ou null
- trimester: trimestre (1, 2, ou 3) ou null
- duration: durée (ex: "55 minutes") ou null
- confidence: niveau de confiance 0-1

Retourne UNIQUEMENT le JSON, sans markdown."""
    
    try:
        meta_resp = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[{'role': 'user', 'content': meta_prompt}],
            response_format={'type': 'json_object'},
            max_tokens=500,
        )
        meta = json.loads(meta_resp.choices[0].message.content)
    except Exception as e:
        return {'id': numeric_id, 'status': 'META_ERROR', 'error': str(e), 'subject': subject_fr, 'key_points': key_points}
    
    # Compile result
    result = {
        'subject': subject_fr,
        'keyPoints': key_points,
        'profLastName': meta.get('profLastName'),
        'profLastNameAr': meta.get('profLastNameAr'),
        'schoolName': meta.get('schoolName'),
        'schoolNameAr': meta.get('schoolNameAr'),
        'type': meta.get('type'),
        'academicYear': meta.get('academicYear'),
        'trimester': meta.get('trimester'),
        'duration': meta.get('duration'),
        'confidence': meta.get('confidence', 0.5),
    }
    
    if dry_run:
        return {
            'id': numeric_id,
            'status': 'DRY_RUN_OK',
            'class': class_slug,
            'subject': subject_slug,
            'subject_extracted': result['subject'],
            'key_points': result['keyPoints'],
            'prof': result['profLastNameAr'] or result['profLastName'],
            'school': result['schoolNameAr'] or result['schoolName'],
            'type': result['type'],
            'year': result['academicYear'],
            'duration': result['duration'],
            'confidence': result['confidence'],
        }
    
    # Save to staging
    save_metadata_to_staging(numeric_id, resource_id, result)
    return {
        'id': numeric_id,
        'status': 'METADATA_STAGED',
        'class': class_slug,
        'subject': subject_slug,
        'subject_extracted': result['subject'],
        'prof': result['profLastNameAr'] or result['profLastName'],
        'school': result['schoolNameAr'] or result['schoolName'],
        'confidence': result['confidence'],
    }


def save_metadata_to_staging(numeric_id, resource_id, meta):
    """Save orchestrator v4 output to ResourceMetadataStaging."""
    def esc(s):
        if s is None: return ''
        s = str(s).replace('\\', '\\\\').replace("'", "''")
        return s
    
    # Format key_points as text array
    kp_array = '{' + ','.join(f'"{esc(p)}"' for p in (meta.get('keyPoints') or [])) + '}'
    
    sql = f'''
    INSERT INTO "ResourceMetadataStaging"
        ("resourceId", "numericId", "subject", "keyPoints",
         "profLastName", "profLastNameAr",
         "schoolName", "schoolNameAr",
         "type", "academicYear", "trimester", "duration",
         "confidence", "sourceTable", "modelUsed", "isApplied")
    VALUES
        ('{esc(resource_id)}', {numeric_id}, '{esc(meta.get("subject"))}', '{kp_array}'::text[],
         '{esc(meta.get("profLastName"))}', '{esc(meta.get("profLastNameAr"))}',
         '{esc(meta.get("schoolName"))}', '{esc(meta.get("schoolNameAr"))}',
         '{esc(meta.get("type"))}', '{esc(meta.get("academicYear"))}', '{esc(meta.get("trimester"))}', '{esc(meta.get("duration"))}',
         {meta.get("confidence") or 0.5}, 'ResourceContentStaging', 'orchestrator_v4_staging', FALSE)
    ON CONFLICT ("resourceId") DO UPDATE SET
        "subject" = EXCLUDED."subject",
        "keyPoints" = EXCLUDED."keyPoints",
        "profLastName" = EXCLUDED."profLastName",
        "profLastNameAr" = EXCLUDED."profLastNameAr",
        "schoolName" = EXCLUDED."schoolName",
        "schoolNameAr" = EXCLUDED."schoolNameAr",
        "type" = EXCLUDED."type",
        "academicYear" = EXCLUDED."academicYear",
        "trimester" = EXCLUDED."trimester",
        "duration" = EXCLUDED."duration",
        "confidence" = EXCLUDED."confidence",
        "extractedAt" = NOW()
    '''
    neon_query(sql)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ids', help='comma-separated numericIds')
    ap.add_argument('--limit', type=int, default=10)
    ap.add_argument('--offset', type=int, default=0)
    ap.add_argument('--apply', action='store_true', help='Save metadata to staging (else dry-run)')
    args = ap.parse_args()
    
    dry_run = not args.apply
    
    print(f"{'[DRY-RUN]' if dry_run else '[APPLY]'} Reading from ResourceContentStaging")
    
    if args.ids:
        ids = [int(x) for x in args.ids.split(',')]
    else:
        ids = get_staging_ids(args.limit, args.offset)
    
    if not ids:
        print("No IDs in staging")
        return
    
    print(f"Processing {len(ids)} resources")
    print(f"{'─' * 90}")
    
    start = time.time()
    results = []
    for i, nid in enumerate(ids):
        r = run_orchestrator_on_staging_text(nid, dry_run=dry_run)
        results.append(r)
        if (i + 1) % 1 == 0 or r['status'] in ('METADATA_STAGED', 'EXTRACTION_ERROR'):
            elapsed = time.time() - start
            prof = r.get('prof') or '?'
            print(f"  [{i+1}/{len(ids)}] {r['status']} #{nid} prof={prof[:30]!r} (elapsed {elapsed:.0f}s)")
    
    # Summary
    print(f"\n{'=' * 90}")
    print(f"SUMMARY ({time.time()-start:.1f}s)")
    print(f"{'=' * 90}")
    by_status = {}
    for r in results:
        by_status.setdefault(r['status'], []).append(r)
    for status, items in sorted(by_status.items()):
        print(f"  {status}: {len(items)}")
    
    # Show metadata stats
    metadata_count = sum(1 for r in results if r['status'] in ('METADATA_STAGED', 'DRY_RUN_OK'))
    if metadata_count > 0:
        profs = sum(1 for r in results if r.get('prof') and r['prof'] != '?')
        schools = sum(1 for r in results if r.get('school'))
        print(f"\nQuality on {metadata_count} resources:")
        print(f"  prof detected: {profs}/{metadata_count}")
        print(f"  school detected: {schools}/{metadata_count}")


if __name__ == '__main__':
    main()
