#!/usr/bin/env python3
"""
Detect subject↔content mismatches using GPT-4o-mini.

For each resource with extracted text, ask GPT-4o-mini to identify the actual
subject of the document, then compare with the DB subject.

Output: CSV of mismatches (NID, db_subject, ai_subject, confidence)
"""
import os, json, time, sys, csv
import urllib.request
from openai import OpenAI

NEON_API_KEY = os.environ['NEON_API_KEY']
NEON_PROJECT = 'little-silence-94324724'
BRANCH_ID = 'br-purple-recipe-as2x8yyo'
ROLE = 'edutunisie_app'

client = OpenAI()

OUTPUT_FILE = '/workspace/edutunisie/pdf-test/mismatches.csv'
PROGRESS_FILE = '/workspace/edutunisie/pdf-test/detect_mismatches_progress.json'


def neon_query(sql):
    body = {
        'db_name': 'neondb',
        'role_name': ROLE,
        'query': sql,
        'branch_id': BRANCH_ID,
    }
    req = urllib.request.Request(
        f'https://console.neon.tech/api/v2/projects/{NEON_PROJECT}/query',
        data=json.dumps(body).encode(),
        headers={'Authorization': f'Bearer {NEON_API_KEY}', 'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        result = json.loads(resp.read())
    if result.get('response'):
        for item in result['response']:
            if item.get('error'):
                raise Exception(f"SQL error: {item['error'][:300]}")
    return result


def sql_escape(val):
    if val is None:
        return 'NULL'
    if isinstance(val, (int, float)):
        return str(val)
    s = str(val).replace("\\", "\\\\").replace("'", "''")
    if len(s) > 30000:
        s = s[:30000]
    return f"'{s}'"


# Tunisian subject taxonomy (matching DB)
VALID_SUBJECTS = [
    'mathematiques', 'physique', 'svt', 'arabe', 'francais', 'anglais',
    'allemand', 'espagnol', 'italien', '3eme-langue',
    'informatique', 'technologie', 'philosophie', 'histoire',
    'geographie', 'histoire-geographie', 'economie', 'economie-gestion',
    'gestion', 'sport', 'eps', 'musique', 'theatre', 'education-islamique',
    'education-civique', 'tic', 'autre'
]

MISMATCH_PROMPT = """You are a Tunisian education expert. Given a document's text and metadata, identify the ACTUAL subject taught in the document.

Subject taxonomy (use the exact slug):
- mathematiques, physique, svt (Sciences de la Vie et de la Terre)
- arabe (Arabic language), francais, anglais, allemand, espagnol, italien, 3eme-langue
- informatique, technologie, philosophie, histoire, geographie, histoire-geographie
- economie, economie-gestion, gestion, sport, eps, musique, theatre
- education-islamique, education-civique, tic, autre

Context:
- The current DB subject is: {db_subject}
- The resource title is: {title}
- The document is from a Tunisian school
- Math, Physics, SVT, etc. are taught in ARABIC in Tunisian collège (7-9ème)
- Arabic language class is for ARABIC LITERATURE (études de texte, créations littéraires)

If the document title and DB subject say "Mathématiques" but the content is Arabic text about literature analysis (étude de texte, figures de style, poésie), it's ARABE not Mathématiques.
If the document is about historical events, dates, civilizations -> histoire
If it's about maps, countries, geography -> geographie

Document text (first 2000 chars):
{text}

Return ONLY a JSON object:
{{"actual_subject": "<slug>", "confidence": "high"|"medium"|"low", "reason": "<1 sentence in English>"}}
"""


def detect_subject(text, title, db_subject):
    """Ask GPT-4o-mini to identify the actual subject of the document."""
    try:
        r = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[{
                'role': 'user',
                'content': MISMATCH_PROMPT.format(
                    db_subject=db_subject,
                    title=title[:200],
                    text=text[:600]  # Reduced for faster GPT calls
                )
            }],
            max_tokens=80,  # Reduced for speed
            temperature=0,
            response_format={'type': 'json_object'}
        )
        result = json.loads(r.choices[0].message.content)
        return result
    except Exception as e:
        return {'actual_subject': db_subject, 'confidence': 'error', 'reason': str(e)[:100]}


def get_resources_to_check(limit=10000, offset=0):
    """Get resources with text, joining subject."""
    sql = f'''
    SELECT r.id, r."numericId", r.title, s.slug as subject, LEFT(rc."fullText", 3000) as text_sample
    FROM "Resource" r
    JOIN "ResourceContent" rc ON rc."resourceId" = r.id
    JOIN "Subject" s ON s.id = r."subjectId"
    WHERE LENGTH(COALESCE(rc."fullText", '')) >= 100
    AND rc."fullText" NOT ILIKE '%unable%'
    AND rc."fullText" NOT ILIKE '%cannot%'
    AND rc."fullText" NOT ILIKE '%sorry%'
    ORDER BY r."numericId"
    LIMIT {limit} OFFSET {offset}
    '''
    r = neon_query(sql)
    return r.get('response', [{}])[0].get('data', {}).get('rows', [])


def load_progress():
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            return json.load(f)
    return {'done': [], 'mismatches': []}


def save_progress(progress):
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress, f)


def main():
    print('Loading resources with text...')
    rows = get_resources_to_check(limit=15000)
    print(f'  Found {len(rows)} resources to check')

    progress = load_progress()
    done_ids = set(progress['done'])
    todo = [r for r in rows if r[0] not in done_ids]
    print(f'  Already checked: {len(done_ids)} | To check: {len(todo)}')

    if not todo:
        print('Nothing to do!')
        return

    # CSV writer (append mode to preserve previous results)
    write_header = not os.path.exists(OUTPUT_FILE) or os.path.getsize(OUTPUT_FILE) == 0
    csv_file = open(OUTPUT_FILE, 'a', newline='')
    writer = csv.writer(csv_file)
    if write_header:
        writer.writerow(['numericId', 'db_subject', 'ai_subject', 'confidence', 'reason', 'title'])

    stats = {'checked': 0, 'mismatch_high': 0, 'mismatch_med': 0, 'mismatch_low': 0, 'errors': 0}
    start = time.time()

    for i, (rid, nid, title, db_subject, text) in enumerate(todo):
        if rid in done_ids:
            continue

        result = detect_subject(text, title, db_subject)
        actual = result.get('actual_subject', db_subject)
        conf = result.get('confidence', 'unknown')
        reason = result.get('reason', '')

        if actual != db_subject and actual in VALID_SUBJECTS:
            writer.writerow([nid, db_subject, actual, conf, reason, title[:100]])
            csv_file.flush()
            if conf == 'high':
                stats['mismatch_high'] += 1
            elif conf == 'medium':
                stats['mismatch_med'] += 1
            else:
                stats['mismatch_low'] += 1
            print(f'[{i+1}] NID {nid}: {db_subject} -> {actual} ({conf}) | {title[:60]}')
        elif 'error' in conf:
            stats['errors'] += 1

        progress['done'].append(rid)
        stats['checked'] += 1

        # Save progress every 10
        if (i + 1) % 10 == 0:
            save_progress(progress)
            elapsed = time.time() - start
            rate = (i + 1) / elapsed
            eta = (len(todo) - i - 1) / rate if rate > 0 else 0
            print(f'[{i+1}/{len(todo)}] {rate:.1f}/s | ETA {eta/60:.1f}min | '
                  f'high={stats["mismatch_high"]} med={stats["mismatch_med"]} '
                  f'low={stats["mismatch_low"]} err={stats["errors"]}')

    save_progress(progress)
    csv_file.close()
    elapsed = time.time() - start
    print()
    print('=' * 60)
    print(f'DONE in {elapsed/60:.1f}min')
    print(f'  Checked:           {stats["checked"]}')
    print(f'  Mismatch HIGH:     {stats["mismatch_high"]}')
    print(f'  Mismatch MED:      {stats["mismatch_med"]}')
    print(f'  Mismatch LOW:      {stats["mismatch_low"]}')
    print(f'  Errors:            {stats["errors"]}')


if __name__ == '__main__':
    main()
