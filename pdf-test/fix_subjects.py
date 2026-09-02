#!/usr/bin/env python3
"""
Fix misclassified Resource.subjectId using AI-extracted subject from ResourceMetadata.
Runs in parallel with bulk_math.py without conflict.
"""
import os, json, time
from pathlib import Path
import urllib.request

NEON_API_KEY = os.environ['NEON_API_KEY']
NEON_PROJECT = 'little-silence-94324724'
BRANCH_ID = 'br-purple-recipe-as2x8yyo'
ROLE = 'edutunisie_app'
LOG_FILE = Path('/workspace/edutunisie/pdf-test/fix_subjects.log')

# Mapping from AI-extracted subject name → DB slug
SUBJECT_MAPPING = {
    'mathématiques': 'mathematiques',
    'mathematiques': 'mathematiques',
    'physique': 'physique',
    'physique-chimie': 'physique',
    'chimie': 'physique',  # Chimie is part of Physique in Tunisian BAC
    'svt': 'svt',
    'sciences de la vie et de la terre': 'svt',
    'sciences naturelles': 'svt',
    'français': 'francais',
    'francais': 'francais',
    'anglais': 'anglais',
    'allemand': '3eme-langue',
    'espagnol': '3eme-langue',
    'italien': '3eme-langue',
    'arabe': 'arabe',
    'économie et gestion': 'economie',
    'economie': 'economie',
    'économie': 'economie',
    'gestion': 'gestion',
    'histoire': 'histoire',
    'géographie': 'geographie',
    'geographie': 'geographie',
    'histoire-géographie': 'histoire-geographie',
    'philosophie': 'philosophie',
    'pensée islamique': 'pensee-islamique',
    'pensée islam': 'pensee-islamique',
    'éducation islamique': 'education-islamique',
    'education islamique': 'education-islamique',
    'éducation civique': 'education-civique',
    'technologie': 'technologie',
    'techniques': 'technologie',
    'sciences techniques': 'technologie',
    'informatique': 'informatique',
    'algorithmique et programmation': 'algo-prog',
    'algorithme et programmation': 'algo-prog',
    'algo & prog': 'algo-prog',
    'algorithme': 'algo-prog',
    'bases de données': 'bases-donnees',
    'système d\'exploitation et réseaux': 'systeme-exploitation-reseaux',
    'sciences de l\'informatique': 'sciences-informatique-matiere',
    'tic': 'tic',
    'éducation physique': 'sport',
    'sport': 'sport',
    'musique': 'musique',
    'théâtre': 'theatre',
    'éducation artistique': 'education-artistique',
}

def log(msg):
    ts = time.strftime('%H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line, flush=True)
    with open(LOG_FILE, 'a') as f:
        f.write(line + '\n')

def neon_query(sql, params=None):
    body = {
        'db_name': 'neondb',
        'role_name': ROLE,
        'query': sql,
        'branch_id': BRANCH_ID,
    }
    if params:
        body['params'] = params
    req = urllib.request.Request(
        f'https://console.neon.tech/api/v2/projects/{NEON_PROJECT}/query',
        data=json.dumps(body).encode(),
        headers={
            'Authorization': f'Bearer {NEON_API_KEY}',
            'Content-Type': 'application/json',
        }
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())

def normalize_subject(s):
    """Normalize AI subject name to a slug."""
    if not s:
        return None
    s_lower = s.lower().strip()
    # Direct lookup
    if s_lower in SUBJECT_MAPPING:
        return SUBJECT_MAPPING[s_lower]
    # Substring match
    for key, val in SUBJECT_MAPPING.items():
        if key in s_lower or s_lower in key:
            return val
    return None

def main():
    log('=== STARTING fix_subjects.py ===')
    
    # Get all subjects
    log('Loading subjects...')
    result = neon_query('SELECT id, slug FROM "Subject"')
    subject_id_by_slug = {}
    if result.get('response') and result['response'][0].get('data', {}).get('rows'):
        for row in result['response'][0]['data']['rows']:
            subject_id_by_slug[row[1]] = row[0]
    log(f'Loaded {len(subject_id_by_slug)} subjects')
    
    # Find resources with AI metadata that need subject fix
    log('Finding resources with AI metadata and potential misclassification...')
    result = neon_query('''
        SELECT 
            r.id, 
            r."numericId"::text,
            r.title,
            cs.slug as current_subject,
            m.subject as ai_subject
        FROM "Resource" r
        JOIN "ResourceMetadata" m ON m."resourceId" = r.id
        JOIN "Subject" cs ON cs.id = r."subjectId"
        WHERE m.subject IS NOT NULL 
          AND m.subject != ''
    ''')
    
    if not (result.get('response') and result['response'][0].get('data', {}).get('rows')):
        log('No resources with AI metadata found')
        return
    
    rows = result['response'][0]['data']['rows']
    log(f'Found {len(rows)} resources with AI metadata')
    
    # Categorize
    to_fix = []
    already_correct = 0
    unmapped = []
    
    for row in rows:
        rid, nid, title, current_slug, ai_subject = row[0], row[1], row[2], row[3], row[4]
        new_slug = normalize_subject(ai_subject)
        if not new_slug:
            unmapped.append((rid, ai_subject))
            continue
        if new_slug not in subject_id_by_slug:
            unmapped.append((rid, f'{ai_subject} → {new_slug} (slug not in DB)'))
            continue
        if new_slug == current_slug:
            already_correct += 1
            continue
        to_fix.append((rid, current_slug, new_slug, subject_id_by_slug[new_slug], title[:50]))
    
    log(f'✓ Already correct: {already_correct}')
    log(f'⚠ Needs fix: {len(to_fix)}')
    log(f'❓ Unmapped: {len(unmapped)}')
    
    if unmapped:
        log('Unmapped subjects (first 10):')
        for rid, subj in unmapped[:10]:
            log(f'  - {rid}: "{subj}"')
    
    if not to_fix:
        log('Nothing to fix!')
        return
    
    # Show top changes
    log('Sample changes (first 10):')
    for rid, cur, new, _, title in to_fix[:10]:
        log(f'  {rid} | {cur:>15} → {new:<15} | {title}')
    
    # Apply fixes in batches
    log(f'Applying {len(to_fix)} fixes...')
    fixed = 0
    failed = 0
    for rid, cur, new, new_id, _ in to_fix:
        try:
            # Escape single quotes in id (shouldn't be needed but safety)
            rid_safe = rid.replace("'", "''")
            neon_query(f"UPDATE \"Resource\" SET \"subjectId\" = '{new_id}', \"updatedAt\" = NOW() WHERE id = '{rid_safe}'")
            fixed += 1
        except Exception as e:
            log(f'  Failed: {rid} ({cur}→{new}): {e}')
            failed += 1
        # Rate limit
        if fixed % 50 == 0:
            log(f'  Progress: {fixed}/{len(to_fix)}')
        time.sleep(0.05)  # 50ms between calls
    
    log(f'\n{"="*60}')
    log(f'COMPLETE: {fixed} fixed, {failed} failed')
    log(f'{"="*60}')

if __name__ == '__main__':
    main()
