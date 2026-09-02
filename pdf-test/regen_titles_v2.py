#!/usr/bin/env python3
"""
Regenerate resource titles from AI metadata.
Template: Type N°? - Subject - Class - Year
Only updates titles that are incomplete or incorrect based on AI metadata.

Backs up old titles to ResourceTitleBackup.
"""
import os, json, time
from pathlib import Path
import urllib.request

NEON_API_KEY = os.environ['NEON_API_KEY']
NEON_PROJECT = 'little-silence-94324724'
BRANCH_ID = 'br-purple-recipe-as2x8yyo'
ROLE = 'edutunisie_app'
LOG_FILE = Path('/workspace/edutunisie/pdf-test/regen_titles_v2.log')

# Type labels (FR)
TYPE_LABELS = {
    'COURSE': 'Cours',
    'EXERCISE': "Série d'exercices",
    'HOMEWORK': 'Devoir',
    'REVISION': 'Révision',
    'BAC_SUBJECT': 'Sujet BAC',
    'CORRECTION': 'Corrigé',
    'SUMMARY': 'Résumé',
    'EXAM': 'Examen',
    'OTHER': 'Document',
}

# Subtype labels (homework, revision)
SUBTYPE_LABELS = {
    'CONTROLE': 'de contrôle',
    'SYNTHESE': 'de synthèse',
    'MAISON': 'à la maison',
    'SURVEILLE': 'surveillé',
    'COURS': 'de cours',
    'BAC_BLANC': 'BAC blanc',
    'EXAMEN': "d'examen",
}

# Subject labels
SUBJECT_LABELS = {
    'mathematiques': 'Mathématiques',
    'physique': 'Physique',
    'svt': 'SVT',
    'francais': 'Français',
    'anglais': 'Anglais',
    'arabe': 'Arabe',
    'philosophie': 'Philosophie',
    'histoire': 'Histoire',
    'geographie': 'Géographie',
    'economie': 'Économie',
    'gestion': 'Gestion',
    'technologie': 'Technologie',
    'informatique': 'Informatique',
    '3eme-langue': '3ème Langue',
    'sport': 'Sport',
    'musique': 'Musique',
    'algo-prog': 'Algorithmique',
    'bases-donnees': 'Bases de données',
    'tic': 'TIC',
    'systeme-exploitation-reseaux': 'Systèmes & Réseaux',
    'sciences-informatique-matiere': 'Sciences Info',
    'pensee-islamique': 'Pensée Islamique',
    'education-islamique': 'Éducation Islamique',
    'histoire-geographie': 'Histoire-Géo',
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


def build_title(row):
    """Build a clean title from resource + AI metadata."""
    rtype = row.get('type') or 'OTHER'
    subtype = row.get('subtype')
    subject = row.get('subject_slug')
    class_name = row.get('class_name') or ''
    section_name = row.get('section_name') or ''
    year = row.get('year') or ''
    homework_number = row.get('homeworkNumber')
    trimester = row.get('trimester')
    objet = row.get('objet') or ''

    # Start with the type label
    type_label = TYPE_LABELS.get(rtype, 'Document')
    subtype_label = SUBTYPE_LABELS.get(subtype or '', '')

    # Build the "Type N°?" part
    if rtype == 'HOMEWORK' and homework_number:
        if subtype_label:
            type_part = f"Devoir {subtype_label} N°{homework_number}"
        else:
            type_part = f"Devoir N°{homework_number}"
    elif rtype == 'HOMEWORK' and subtype_label:
        type_part = f"Devoir {subtype_label}"
    elif rtype == 'HOMEWORK':
        type_part = 'Devoir'
    elif rtype == 'EXERCISE':
        type_part = type_label  # "Série d'exercices"
    elif rtype == 'REVISION' and subtype_label:
        type_part = f"Révision {subtype_label}".strip()
    elif rtype == 'BAC_SUBJECT':
        type_part = 'Sujet BAC'
    else:
        type_part = type_label

    # Subject part
    subject_label = SUBJECT_LABELS.get(subject, subject.replace('-', ' ').title() if subject else 'Mathématiques')

    # Class part (with optional section)
    class_part = ''
    if class_name:
        class_part = class_name
        if section_name:
            class_part = f"{class_name} {section_name}"

    # Trimester (optional, only if available)
    trimestre_part = ''
    if trimester:
        try:
            t_int = int(trimester)
            if t_int in (1, 2, 3):
                trimestre_part = f"Trim{t_int}"
        except (ValueError, TypeError):
            pass

    # Year (optional)
    year_part = ''
    if year and str(year) not in ('null', 'None', ''):
        y = str(year).strip()
        # Already in YYYY-YYYY format
        import re
        m = re.match(r'^(\d{4})-(\d{4})$', y)
        if m:
            year_part = y
        elif re.match(r'^\d{4}-$', y):
            # Truncated like "2018-" - clean it
            year_part = y.rstrip('-')
        elif len(y) == 4 and y.isdigit():
            # Single year, add next year
            year_part = f"{y}-{int(y)+1}"
        else:
            year_part = y

    # Combine
    parts = [type_part, subject_label]
    if class_part:
        parts.append(class_part)
    if trimestre_part:
        parts.append(trimestre_part)
    if year_part:
        parts.append(year_part)

    title = ' - '.join(parts)
    return title


def is_incomplete_title(current_title, new_title):
    """Check if the current title is incomplete compared to the new one."""
    if not current_title or len(current_title.strip()) < 5:
        return True
    # Check if current title has fewer meaningful words
    current_words = len(current_title.split())
    new_words = len(new_title.split())
    # If new title has significantly more words, current is incomplete
    if new_words >= current_words + 3:
        return True
    # Check if new title has a year that current doesn't
    import re
    if re.search(r'\d{4}-\d{4}', new_title) and not re.search(r'\d{4}-\d{4}', current_title):
        return True
    # Check if new title has a class that current doesn't
    classes = ['1ère année', '2ème année', '3ème année', '4ème année', 'BAC', '7ème', '8ème', '9ème']
    for c in classes:
        if c in new_title and c not in current_title:
            return True
    # Check if current has weird patterns
    if re.search(r'\bserie\b', current_title.lower()) and not re.search(r"Série d", current_title):
        return True
    if re.search(r'\bcontrole\b', current_title.lower()) and "contrôle" not in current_title.lower():
        return True
    if re.search(r'\bsynthese\b', current_title.lower()) and "synthèse" not in current_title.lower():
        return True
    return False


def main():
    log('=== STARTING regen_titles_v2 ===')
    
    # Get all resources with AI metadata
    log('Fetching resources with AI metadata...')
    result = neon_query("""
        SELECT 
            r.id,
            r."numericId"::text,
            r.title,
            rm.type,
            rm.subtype,
            s.slug as subject_slug,
            c."nameFr" as class_name,
            sec."nameFr" as section_name,
            rm.year::text,
            rme."homeworkNumber"::text,
            rme.trimester::text,
            rme.objet
        FROM "Resource" r
        JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
        JOIN "Subject" s ON s.id = r."subjectId"
        LEFT JOIN "Class" c ON c.id = r."classId"
        LEFT JOIN "Section" sec ON sec.id = r."sectionId"
        LEFT JOIN "ResourceMetadataExtra" rme ON rme."resourceId" = r.id
        WHERE r.status = 'PUBLISHED'
          AND rm.type IS NOT NULL
    """)
    
    if not result.get('response') or not result['response'][0].get('data', {}).get('rows'):
        log('No resources found')
        return
    
    rows = result['response'][0]['data']['rows']
    log(f'Loaded {len(rows)} resources with AI metadata')
    
    to_update = []
    skipped = 0
    samples = []
    
    for row in rows:
        row_dict = {
            'id': row[0],
            'numericId': row[1],
            'title': row[2],
            'type': row[3],
            'subtype': row[4],
            'subject_slug': row[5],
            'class_name': row[6],
            'section_name': row[7],
            'year': row[8],
            'homeworkNumber': row[9],
            'trimester': row[10],
            'objet': row[11],
        }
        new_title = build_title(row_dict)
        if is_incomplete_title(row_dict['title'], new_title):
            to_update.append((row_dict['id'], row_dict['numericId'], row_dict['title'], new_title))
            if len(samples) < 10:
                samples.append((row_dict['title'], new_title))
        else:
            skipped += 1
    
    log(f'  To update: {len(to_update)}')
    log(f'  Already good: {skipped}')
    
    if samples:
        log('Sample changes:')
        for old, new in samples:
            log(f'  "{old[:60]}" → "{new[:80]}"')
    
    if not to_update:
        log('Nothing to update')
        return
    
    # Apply updates
    log(f'\nApplying {len(to_update)} title updates...')
    updated = 0
    failed = 0
    BATCH = 100
    for i in range(0, len(to_update), BATCH):
        batch = to_update[i:i+BATCH]
        for rid, nid, old_title, new_title in batch:
            try:
                # Escape values
                rid_e = rid.replace("'", "''")
                old_e = (old_title or '').replace("'", "''")
                new_e = new_title.replace("'", "''")
                
                # Backup old title
                neon_query(f"""
                    INSERT INTO "ResourceTitleBackup" ("resourceId", "numericId", "oldTitle", "newTitle", "regeneratedAt", "regeneratedBy")
                    SELECT '{rid_e}', {nid}, '{old_e}', '{new_e}', NOW(), 'regen_titles_v2'
                    WHERE NOT EXISTS (
                        SELECT 1 FROM "ResourceTitleBackup" WHERE "resourceId" = '{rid_e}'
                    )
                """)
                
                # Update title
                neon_query(f"""
                    UPDATE "Resource" SET title = '{new_e}', "updatedAt" = NOW() WHERE id = '{rid_e}'
                """)
                updated += 1
            except Exception as e:
                log(f'  FAILED {rid}: {str(e)[:150]}')
                failed += 1
        log(f'  Batch {i//BATCH + 1}: {updated}/{len(to_update)} done')
        time.sleep(0.3)
    
    log(f'\nCOMPLETE: {updated} updated, {failed} failed')


if __name__ == '__main__':
    main()
