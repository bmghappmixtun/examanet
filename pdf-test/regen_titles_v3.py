#!/usr/bin/env python3
"""
Regenerate resource titles from AI metadata - BATCHED version.
Faster: builds ONE big UPDATE+INSERT statement per batch.
"""
import os, json, time, re
from pathlib import Path
import urllib.request

NEON_API_KEY = os.environ['NEON_API_KEY']
NEON_PROJECT = 'little-silence-94324724'
BRANCH_ID = 'br-purple-recipe-as2x8yyo'
ROLE = 'edutunisie_app'
LOG_FILE = Path('/workspace/edutunisie/pdf-test/regen_titles_v3.log')

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

SUBTYPE_LABELS = {
    'CONTROLE': 'de contrôle',
    'SYNTHESE': 'de synthèse',
    'MAISON': 'à la maison',
    'SURVEILLE': 'surveillé',
    'COURS': 'de cours',
    'BAC_BLANC': 'BAC blanc',
    'EXAMEN': "d'examen",
}

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
        headers={
            'Authorization': f'Bearer {NEON_API_KEY}',
            'Content-Type': 'application/json',
        }
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read())


def build_title(row):
    rtype = row.get('type') or 'OTHER'
    subtype = row.get('subtype')
    subject = row.get('subject_slug')
    class_name = row.get('class_name') or ''
    section_name = row.get('section_name') or ''
    year = row.get('year') or ''
    homework_number = row.get('homeworkNumber')
    trimester = row.get('trimester')

    type_label = TYPE_LABELS.get(rtype, 'Document')
    subtype_label = SUBTYPE_LABELS.get(subtype or '', '')

    if rtype == 'HOMEWORK' and homework_number:
        if subtype_label:
            type_part = f"Devoir {subtype_label} N°{homework_number}"
        else:
            type_part = f"Devoir N°{homework_number}"
    elif rtype == 'HOMEWORK' and subtype_label:
        type_part = f"Devoir {subtype_label}"
    elif rtype == 'EXERCISE':
        type_part = type_label
    elif rtype == 'REVISION' and subtype_label:
        type_part = f"Révision {subtype_label}"
    elif rtype == 'BAC_SUBJECT':
        type_part = 'Sujet BAC'
    else:
        type_part = type_label

    subject_label = SUBJECT_LABELS.get(subject, subject.replace('-', ' ').title() if subject else 'Mathématiques')

    class_part = ''
    if class_name:
        class_part = class_name
        if section_name:
            class_part = f"{class_name} {section_name}"

    trimestre_part = ''
    if trimester:
        try:
            t_int = int(trimester)
            if t_int in (1, 2, 3):
                trimestre_part = f"Trim{t_int}"
        except (ValueError, TypeError):
            pass

    year_part = ''
    if year and str(year) not in ('null', 'None', ''):
        y = str(year).strip()
        m = re.match(r'^(\d{4})-(\d{4})$', y)
        if m:
            year_part = y
        elif re.match(r'^\d{4}-$', y):
            year_part = y.rstrip('-')
        elif len(y) == 4 and y.isdigit():
            year_part = f"{y}-{int(y)+1}"
        else:
            year_part = y

    parts = [type_part, subject_label]
    if class_part:
        parts.append(class_part)
    if trimestre_part:
        parts.append(trimestre_part)
    if year_part:
        parts.append(year_part)

    return ' - '.join(parts)


def is_incomplete_title(current_title, new_title):
    if not current_title or len(current_title.strip()) < 5:
        return True
    current_words = len(current_title.split())
    new_words = len(new_title.split())
    if new_words >= current_words + 3:
        return True
    if re.search(r'\d{4}-\d{4}', new_title) and not re.search(r'\d{4}-\d{4}', current_title):
        return True
    classes = ['1ère année', '2ème année', '3ème année', '4ème année', 'BAC', '7ème', '8ème', '9ème']
    for c in classes:
        if c in new_title and c not in current_title:
            return True
    if re.search(r'\bserie\b', current_title.lower()) and not re.search(r"Série d", current_title):
        return True
    if re.search(r'\bcontrole\b', current_title.lower()) and "contrôle" not in current_title.lower():
        return True
    if re.search(r'\bsynthese\b', current_title.lower()) and "synthèse" not in current_title.lower():
        return True
    return False


def main():
    log('=== STARTING regen_titles_v3 (batched) ===')
    
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
            rme.trimester::text
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
    log(f'Loaded {len(rows)} resources')
    
    to_update = []
    for row in rows:
        row_dict = {
            'id': row[0], 'numericId': row[1], 'title': row[2],
            'type': row[3], 'subtype': row[4], 'subject_slug': row[5],
            'class_name': row[6], 'section_name': row[7], 'year': row[8],
            'homeworkNumber': row[9], 'trimester': row[10],
        }
        new_title = build_title(row_dict)
        if is_incomplete_title(row_dict['title'], new_title):
            to_update.append((row_dict['id'], row_dict['numericId'], row_dict['title'], new_title))
    
    log(f'To update: {len(to_update)}')
    
    if not to_update:
        log('Nothing to update')
        return

    # Optional: force-update even titles that look "complete" (use --force)
    import sys
    if '--force' in sys.argv:
        log('--force flag: will update ALL titles regardless of completeness')
        to_update = []
        for row in rows:
            row_dict = {
                'id': row[0], 'numericId': row[1], 'title': row[2],
                'type': row[3], 'subtype': row[4], 'subject_slug': row[5],
                'class_name': row[6], 'section_name': row[7], 'year': row[8],
                'homeworkNumber': row[9], 'trimester': row[10],
            }
            new_title = build_title(row_dict)
            to_update.append((row_dict['id'], row_dict['numericId'], row_dict['title'], new_title))
        log(f'Force-update total: {len(to_update)}')
    
    # Show first 5 samples
    log('First 5 changes:')
    for rid, nid, old, new in to_update[:5]:
        log(f'  "{old[:50]}" → "{new[:80]}"')
    
    # Apply in batches using single UPDATE with CASE
    log(f'\nApplying {len(to_update)} updates in batches...')
    updated = 0
    failed = 0
    BATCH = 200
    
    for i in range(0, len(to_update), BATCH):
        batch = to_update[i:i+BATCH]
        
        # Build backup values
        backup_values = []
        update_when = []
        for rid, nid, old, new in batch:
            rid_e = rid.replace("'", "''")
            old_e = (old or '').replace("'", "''")
            new_e = new.replace("'", "''")
            backup_values.append(f"('{rid_e}', {nid}, '{old_e}', '{new_e}')")
            update_when.append(f"WHEN id = '{rid_e}' THEN '{new_e}'")
        
        # Insert backups (one query, all rows)
        try:
            backup_sql = f"""
                INSERT INTO "ResourceTitleBackup" ("resourceId", "numericId", "oldTitle", "newTitle", "regeneratedAt", "regeneratedBy")
                VALUES {','.join(backup_values)}
                ON CONFLICT ("resourceId") DO NOTHING
            """
            neon_query(backup_sql)
        except Exception as e:
            log(f'  Backup batch {i//BATCH + 1} failed: {str(e)[:200]}')
            # Continue anyway, the ON CONFLICT may have worked partially
        
        # Update titles (one query, all rows)
        try:
            update_sql = f"""
                UPDATE "Resource"
                SET title = CASE {' '.join(update_when)} ELSE title END,
                    "updatedAt" = NOW()
                WHERE id IN ({','.join(f"'{r[0].replace(chr(39), chr(39)*2)}'" for r in batch)})
            """
            neon_query(update_sql)
            updated += len(batch)
        except Exception as e:
            log(f'  Update batch {i//BATCH + 1} failed: {str(e)[:200]}')
            failed += len(batch)
        
        log(f'  Batch {i//BATCH + 1}/{(len(to_update) + BATCH - 1)//BATCH}: {updated}/{len(to_update)} updated')
        time.sleep(0.2)
    
    log(f'\nCOMPLETE: {updated} updated, {failed} failed')


if __name__ == '__main__':
    main()
