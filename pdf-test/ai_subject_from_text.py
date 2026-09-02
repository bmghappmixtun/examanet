#!/usr/bin/env python3
"""
Re-determine the subject of a resource using the extracted text + ChatGPT.

For each resource:
1. Get the fullText (first ~3000 chars)
2. Send to GPT-4o-mini to identify the subject
3. Compare with current DB subject
4. Report mismatches
"""
import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import os
import json
import time
import urllib.request
from openai import OpenAI

# Subject list (canonical slugs)
SUBJECTS = [
    'mathematiques', 'physique', 'svt', 'technologie', 
    'informatique', 'algo-prog', 'bases-donnees', 'tic',
    'francais', 'anglais', 'arabe', '3eme-langue',
    'economie', 'gestion', 'histoire', 'geographie',
    'philosophie', 'pensee-islamique', 'education-islamique',
    'sport', 'musique',
]

PROMPT_TEMPLATE = """Tu es un expert en éducation tunisienne. Analyse ce texte extrait d'un PDF scolaire et détermine sa matière principale.

MATIÈRES POSSIBLES (utilise exactement le slug):
{subjects}

Le texte peut être en français, arabe, ou mixte. Considère:
- Le vocabulaire technique (algèbre, équation → math; courant, force → physique; cellule, ADN → svt)
- Le niveau scolaire (collège 7-9, lycée 1AS-4AS, BAC technique)
- La section si mentionnée (math, sciences, technique, eco-gestion, lettres)

Réponds UNIQUEMENT avec un JSON:
{{"subject": "<slug>", "confidence": <0-100>, "reasoning": "<explication courte en français>"}}

TEXTE:
{text}
"""

def detect_subject(text, client, model="gpt-4o-mini"):
    """Use ChatGPT to detect the subject of the text."""
    truncated = text[:3500] if text else ""
    if not truncated.strip():
        return None, 0, "Empty text"
    
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{
                "role": "user",
                "content": PROMPT_TEMPLATE.format(
                    subjects=', '.join(SUBJECTS),
                    text=truncated
                )
            }],
            response_format={"type": "json_object"},
            max_tokens=200,
            temperature=0.1,
        )
        result = json.loads(response.choices[0].message.content)
        return result.get('subject'), result.get('confidence', 0), result.get('reasoning', '')
    except Exception as e:
        return None, 0, f"API error: {str(e)[:100]}"


def main():
    test_only = '--test' in sys.argv
    limit = None
    for arg in sys.argv[1:]:
        if arg.startswith('--limit='):
            limit = int(arg.split('=')[1])
        elif arg.isdigit():
            limit = int(arg)
    
    client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY'))
    
    # Get resources
    lim = f'LIMIT {limit}' if limit else ''
    r = m.neon_query(f"""
        SELECT r.id, r."numericId", r.title, s.slug as db_subject, rm.subject as ai_subject,
          LEFT(rc."fullText", 3500) as text_preview
        FROM "Resource" r
        JOIN "ResourceContent" rc ON rc."resourceId" = r.id
        LEFT JOIN "Subject" s ON s.id = r."subjectId"
        LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
        WHERE r.status = 'PUBLISHED'
          AND LENGTH(rc."fullText") > 500
        {lim}
    """)
    rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])

    print(f'Processing {len(rows)} resources...')
    print()
    
    matches = 0
    mismatches = []
    errors = 0
    
    for i, row in enumerate(rows, 1):
        rid, nid, title, db_subject, ai_subject, text = row
        new_subj, confidence, reasoning = detect_subject(text, client)
        
        if new_subj is None:
            errors += 1
            continue
        
        if new_subj == db_subject:
            matches += 1
        else:
            mismatches.append((nid, title, db_subject, new_subj, confidence, reasoning))
        
        if i % 10 == 0:
            print(f'  [{i}/{len(rows)}] matches={matches} mismatches={len(mismatches)} errors={errors}', flush=True)
    
    print()
    print(f'✅ Matches: {matches} ({matches/len(rows)*100:.1f}%)')
    print(f'❌ Mismatches: {len(mismatches)}')
    print(f'⚠️  Errors: {errors}')
    
    if mismatches:
        print()
        print('=== First 20 mismatches ===')
        for m_data in mismatches[:20]:
            nid, title, db, new, conf, reason = m_data
            print(f'\nNID {nid}: {db} → {new} (confidence: {conf})')
            print(f'  Title: {title[:60]}')
            print(f'  Reason: {reason[:120] if reason else "N/A"}')
    
    # Save results to CSV
    with open('/tmp/ai_subject_review.csv', 'w') as f:
        f.write('nid,db_subject,ai_new_subject,confidence,reasoning\n')
        for m_data in mismatches:
            nid, title, db, new, conf, reason = m_data
            reason_e = reason.replace('"', '""').replace('\n', ' ') if reason else ''
            title_e = title.replace('"', '""').replace('\n', ' ')
            f.write(f'{nid},{db},{new},{conf},"{reason_e}"\n')
    print(f'\nMismatches saved to /tmp/ai_subject_review.csv')

if __name__ == '__main__':
    main()
