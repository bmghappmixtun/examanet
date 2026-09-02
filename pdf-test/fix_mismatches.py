#!/usr/bin/env python3
"""
Apply subject fixes from detect_mismatches.py results.

Filters out FALSE POSITIVES:
- mathematiques -> arabe (math in Arabic is legitimate in Tunisian college 7-9ème)
- arabe -> education-islamique (subject overlap)
- tic -> informatique (related, not strict mismatch)
- some others

Applies only TRUE POSITIVES:
- francais -> arabe
- svt <-> physique
- 3eme-langue -> allemand/anglais (specific language)
- etc.

Run with --apply to actually apply.
"""
import os, csv, sys
import urllib.request, json

NEON_API_KEY = os.environ['NEON_API_KEY']
NEON_PROJECT = 'little-silence-94324724'
BRANCH_ID = 'br-purple-recipe-as2x8yyo'
ROLE = 'edutunisie_app'

CSV_FILE = '/workspace/edutunisie/pdf-test/mismatches.csv'

# Patterns that are FALSE POSITIVES (don't fix)
FALSE_POSITIVE_PATTERNS = {
    # Math is taught in Arabic in Tunisian 7-9ème college
    ('mathematiques', 'arabe'),
    # Arabe class covers literary topics, may include some education islamique themes
    ('arabe', 'education-islamique'),
    # Education islamique covers pensee islamique
    ('pensee-islamique', 'education-islamique'),
    # Physique content might just be "autre" general science
    ('physique', 'autre'),
    # Some math content might be unclassifiable
    ('mathematiques', 'autre'),
    # Technologie covers many topics
    ('technologie', 'autre'),
    # Information vs TIC overlap
    ('informatique', 'tic'),
    ('tic', 'informatique'),
    # Algorithmic programming is a branch of informatique
    ('algo-prog', 'informatique'),
    # Bases de données is part of informatique
    ('bases-donnees', 'informatique'),
    # Sciences physiques may include math exercises
    ('sciences-physiques', 'mathematiques'),
    # Economie vs economie-gestion naming variation
    ('economie', 'economie-gestion'),
    # Histoire-geographie is sometimes split
    ('histoire-geographie', 'geographie'),
    ('histoire-geographie', 'histoire'),
    # Sport vs EPS
    ('sport', 'eps'),
}


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


def main():
    apply_mode = '--apply' in sys.argv
    
    # Read CSV
    rows = []
    with open(CSV_FILE) as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    
    print(f'Loaded {len(rows)} mismatches from {CSV_FILE}')
    
    # Filter
    true_positives = []
    false_positives_filtered = []
    for row in rows:
        if row['confidence'] != 'high':
            continue
        if (row['db_subject'], row['ai_subject']) in FALSE_POSITIVE_PATTERNS:
            false_positives_filtered.append(row)
        else:
            true_positives.append(row)
    
    print(f'  True positives (will fix):    {len(true_positives)}')
    print(f'  False positives (filtered):   {len(false_positives_filtered)}')
    print(f'  Medium/low confidence:        {len([r for r in rows if r["confidence"] != "high"])}')
    
    if not apply_mode:
        print('\nDRY RUN - not applying changes. Use --apply to apply.')
        # Show first 30 fixes
        print(f'\nFirst 30 fixes that WOULD be applied:')
        for row in true_positives[:30]:
            print(f'  NID {row["numericId"]:6s}: {row["db_subject"]:18s} -> {row["ai_subject"]:18s} | {row["title"][:55]}')
        return
    
    # Get subject IDs
    quoted = ','.join("'" + r['ai_subject'] + "'" for r in true_positives)
    r = neon_query(f'SELECT slug, id FROM "Subject" WHERE slug IN ({quoted})')
    subj_ids = {row[0]: row[1] for row in r.get('response', [{}])[0].get('data', {}).get('rows', [])}
    print(f'\nResolved {len(subj_ids)} subject IDs')
    
    # Apply
    print(f'Applying {len(true_positives)} fixes...')
    applied = 0
    errors = 0
    for row in true_positives:
        nid = row['numericId']
        ai_subj = row['ai_subject']
        if ai_subj not in subj_ids:
            errors += 1
            continue
        new_id = subj_ids[ai_subj]
        try:
            neon_query(f"UPDATE \"Resource\" SET \"subjectId\" = '{new_id}' WHERE \"numericId\" = {nid}")
            applied += 1
            if applied % 20 == 0:
                print(f'  Applied {applied}/{len(true_positives)}...')
        except Exception as e:
            errors += 1
            print(f'  ERR NID {nid}: {str(e)[:80]}')
    
    print(f'\nDONE. Applied: {applied} | Errors: {errors}')


if __name__ == '__main__':
    main()
