#!/usr/bin/env python3
"""
Re-determine subject from text for the 339 ambiguous cases.
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
from openai import OpenAI
import csv

SUBJECTS = [
    'mathematiques', 'physique', 'svt', 'technologie', 
    'informatique', 'algo-prog', 'bases-donnees', 'tic',
    'francais', 'anglais', 'arabe', '3eme-langue',
    'economie', 'gestion', 'histoire', 'geographie',
    'philosophie', 'pensee-islamique', 'education-islamique',
    'sport', 'musique',
]

PROMPT = """Tu es un expert en éducation tunisienne. Analyse ce texte extrait d'un PDF scolaire et détermine sa matière principale.

MATIÈRES (utilise exactement ce slug): {subjects}

Réponds UNIQUEMENT avec un JSON:
{{"subject": "<slug>", "confidence": <0-100>, "reasoning": "<explication courte>"}}

TEXTE:
{text}
"""

def detect_subject(text, client, model="gpt-4o-mini"):
    truncated = text[:3500] if text else ""
    if not truncated.strip():
        return None, 0, "Empty"
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": PROMPT.format(subjects=', '.join(SUBJECTS), text=truncated)}],
            response_format={"type": "json_object"},
            max_tokens=200,
            temperature=0.1,
        )
        result = json.loads(response.choices[0].message.content)
        return result.get('subject'), result.get('confidence', 0), result.get('reasoning', '')
    except Exception as e:
        return None, 0, str(e)[:100]

def main():
    limit = None
    for arg in sys.argv[1:]:
        if arg.startswith('--limit='):
            limit = int(arg.split('=')[1])
    
    # Get NIDs
    with open('/tmp/ambiguous_nids.txt', 'r') as f:
        nids = [int(l.strip()) for l in f if l.strip()]
    if limit:
        nids = nids[:limit]
    print(f'Processing {len(nids)} ambiguous resources...')
    
    # Fetch all data
    nid_list = ','.join(str(n) for n in nids)
    r = m.neon_query(f"""
        SELECT r.id, r."numericId", r.title, s.slug as db_subject, rm.subject as ai_subject,
          LEFT(rc."fullText", 4000) as text
        FROM "Resource" r
        JOIN "ResourceContent" rc ON rc."resourceId" = r.id
        LEFT JOIN "Subject" s ON s.id = r."subjectId"
        LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
        WHERE r."numericId" IN ({nid_list})
          AND LENGTH(rc."fullText") > 200
    """)
    rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
    print(f'Found {len(rows)} with substantial text')
    
    client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY'))
    
    matches = 0
    confirms_ai = 0  # AI subject is same as current AI subject (which differs from DB)
    db_was_right = 0  # New AI detection matches DB
    new_subject = 0  # New subject different from both AI and DB
    errors = 0
    
    results = []
    start = time.time()
    
    for i, row in enumerate(rows, 1):
        rid, nid, title, db_subject, ai_subject, text = row
        new_subj, confidence, reasoning = detect_subject(text, client)
        
        if new_subj is None:
            errors += 1
            continue
        
        if new_subj == db_subject:
            db_was_right += 1
            matches += 1
        elif new_subj == ai_subject:
            confirms_ai += 1
        else:
            new_subject += 1
        
        results.append({
            'nid': nid, 'rid': rid, 'title': title, 'db': db_subject,
            'ai_old': ai_subject, 'ai_new': new_subj, 
            'confidence': confidence, 'reasoning': reasoning,
        })
        
        if i % 20 == 0:
            elapsed = time.time() - start
            rate = i / elapsed if elapsed > 0 else 0
            remaining = (len(rows) - i) / rate if rate > 0 else 0
            print(f'  [{i}/{len(rows)}] {elapsed:.0f}s, ETA {remaining:.0f}s | matches={matches} confirms_ai={confirms_ai} new={new_subject} err={errors}', flush=True)
    
    elapsed = time.time() - start
    print(f'\nTotal time: {elapsed:.0f}s ({elapsed/len(rows):.1f}s per resource)')
    print()
    print(f'✅ DB was right:    {db_was_right} ({db_was_right/len(rows)*100:.1f}%)')
    print(f'🔄 AI subject confirmed (vs DB): {confirms_ai} ({confirms_ai/len(rows)*100:.1f}%)')
    print(f'🆕 New subject (different from both): {new_subject} ({new_subject/len(rows)*100:.1f}%)')
    print(f'❌ Errors: {errors}')
    
    # Save detailed results
    with open('/workspace/edutunisie/pdf-test/ai_subject_ambiguous_results.csv', 'w') as f:
        f.write('nid,db_subject,ai_old_subject,ai_new_subject,confidence,reasoning\n')
        for r in results:
            reason_e = r['reasoning'].replace('"', '""').replace('\n', ' ')
            title_e = r['title'].replace('"', '""').replace('\n', ' ')
            f.write(f'{r["nid"]},{r["db"]},{r["ai_old"] or ""},{r["ai_new"]},{r["confidence"]},"{reason_e}"\n')
    print(f'\nResults saved to ai_subject_ambiguous_results.csv')
    
    # Show top "new subject" discoveries
    new_subj_list = [r for r in results if r['ai_new'] != r['db'] and r['ai_new'] != r['ai_old']]
    if new_subj_list:
        print(f'\n=== NEW SUBJECTS discovered (top 15) ===')
        for r in new_subj_list[:15]:
            print(f'  NID {r["nid"]}: {r["db"]} → {r["ai_new"]} (conf={r["confidence"]}) | {r["title"][:50]}')

if __name__ == '__main__':
    main()
