#!/usr/bin/env python3
"""
Fix 492 titles where title says wrong subject vs DB.

Strategy:
1. Detect type and hwn from OLD title (preserves real type)
2. Replace subject in title with the correct DB subject
3. Backup, update title + slug
"""
import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import csv
import re

def to_slug(s):
    s = s.lower()
    for old, new in [('é','e'),('è','e'),('ê','e'),('à','a'),('â','a'),('î','i'),
                     ('ô','o'),('ù','u'),('ç','c'),('ñ','n')]:
        s = s.replace(old, new)
    s = s.replace('’', '').replace("'", '').replace('"', '')
    s = re.sub(r'[^a-z0-9\s-]', ' ', s)
    s = re.sub(r'\s+', '-', s)
    s = re.sub(r'-+', '-', s)
    return s.strip('-')

TYPE_LABELS = {
    'HOMEWORK': 'Devoir', 'EXERCISE': "Série d'exercices", 'COURSE': 'Cours',
    'OTHER': 'Document', 'SUMMARY': 'Résumé', 'BAC_SUBJECT': 'Sujet Bac',
}

# Smart type detection from old title
def detect_type_and_hwn(old_title):
    if not old_title:
        return ('HOMEWORK', None)
    
    title = old_title.strip()
    title_lower = title.lower()
    hwn = None
    
    # Try to find homework number
    nm = re.search(r'N[°o]?\s*(\d+)', title, re.IGNORECASE)
    if nm:
        hwn = int(nm.group(1))
    
    # Detect type
    if re.match(r'^\s*Sujet\s+Bac\b', title, re.IGNORECASE):
        return ('BAC_SUBJECT', hwn)
    if title_lower.startswith('examen'):
        return ('HOMEWORK', hwn)
    if title_lower.startswith('devoir avec correction') or 'devoir de synthese avec correction' in title_lower:
        return ('HOMEWORK', hwn)
    if title_lower.startswith('devoir'):
        return ('HOMEWORK', hwn)
    if title_lower.startswith("série d'exercices") or title_lower.startswith("serie d'exercices") or title_lower.startswith("série d"):
        return ('EXERCISE', hwn)
    if title_lower.startswith('série'):
        return ('EXERCISE', hwn)
    if title_lower.startswith('cours'):
        return ('COURSE', hwn)
    if title_lower.startswith('résumé'):
        return ('SUMMARY', hwn)
    if title_lower.startswith('document'):
        return ('OTHER', hwn)
    
    return ('HOMEWORK', hwn)

SUBJECT_LABELS = {
    'mathematiques': 'Mathématiques', 'physique': 'Physique', 'svt': 'Sciences de la vie et de la terre',
    'francais': 'Français', 'anglais': 'Anglais', 'arabe': 'Arabe', 'philosophie': 'Philosophie',
    'pensee-islamique': 'Pensée Islamique', 'education-islamique': 'Éducation Islamique',
    'education-civique': 'Éducation Civique', 'sport': 'Sport', 'technologie': 'Technologie',
    'informatique': 'Informatique', 'algo-prog': 'Algorithmique et Programmation',
    'bases-donnees': 'Bases de Données', 'tic': 'TIC', 'economie': 'Économie',
    'gestion': 'Gestion', 'histoire': 'Histoire', 'geographie': 'Géographie',
    '3eme-langue': '3ème Langue', 'musique': 'Éducation Musicale', 'theatre': 'Théâtre',
    'histoire-geographie': 'Histoire-Géographie',
    'systeme-exploitation-reseaux': "Système d'Exploitation et Réseaux",
}

CLASS_LABELS = {
    '1ere-secondaire': '1ère année secondaire', '2eme-secondaire': '2ème année secondaire',
    '3eme-secondaire': '3ème année secondaire', '4eme-secondaire': '4ème année secondaire (Bac)',
    '7eme': '7ème année de base', '8eme': '8ème année de base', '9eme': '9ème année de base',
}

SECTION_LABELS = {
    'eco-services': 'Économie et services', 'eco-gestion': 'Économie-Gestion',
    'sciences': 'Sciences', 'sciences-experimentales': 'Sciences Expérimentales',
    'sciences-informatique': "Sciences de l'informatique",
    'technologies-informatique': "Technologies de l'informatique",
    'maths': 'Mathématiques', 'technique': 'Technique', 'lettres': 'Lettres', 'sport': 'Sport',
}

def generate_title(old_title, db_subj, cls, sec, year, trim):
    """Generate proper title using old title's type/hwn but DB's subject"""
    type_, hwn = detect_type_and_hwn(old_title)
    type_label = TYPE_LABELS.get(type_, 'Document')
    if 'avec correction' in old_title.lower() and 'correction' not in type_label.lower():
        type_label += ' Avec correction'
    
    parts = [type_label]
    
    if hwn and type_ in ('HOMEWORK', 'EXERCISE'):
        parts.append(f"N°{hwn}")
    
    subj_label = SUBJECT_LABELS.get(db_subj, db_subj.title() if db_subj else '')
    if subj_label:
        parts.append(f'- {subj_label}')
    
    class_label = CLASS_LABELS.get(cls, '')
    if class_label:
        parts.append(f'- {class_label}')
    
    sec_label = SECTION_LABELS.get(sec or '', '')
    if sec_label and sec_label not in ('Sciences Expérimentales',):
        parts.append(sec_label)
    
    if trim:
        parts.append(f'- Trim{trim}')
    
    if year:
        parts.append(f'- {year}')
    
    return ' '.join(parts)

def main():
    apply = '--apply' in sys.argv
    
    # Read all mismatches
    mismatches = []
    with open('/workspace/edutunisie/pdf-test/title_mismatches_classified.csv', 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get('status') == 'title_wrong':
                mismatches.append(row)
    
    print(f'Total to fix: {len(mismatches)}')
    
    # Get all NIDs and BATCH fetch
    nids = [m['nid'] for m in mismatches]
    
    print('Fetching resource info...')
    all_info = {}
    batch_size = 200
    for i in range(0, len(nids), batch_size):
        batch = nids[i:i+batch_size]
        nid_list = ','.join(batch)
        r = m.neon_query(f'''
            SELECT r."numericId", r.id, r.title, r.slug, r.type, r.year, r.trimester,
              sub.slug as db_subj, c.slug as cls, sec.slug as sec
            FROM "Resource" r
            LEFT JOIN "Subject" sub ON sub.id = r."subjectId"
            LEFT JOIN "Class" c ON c.id = r."classId"
            LEFT JOIN "Section" sec ON sec.id = r."sectionId"
            WHERE r."numericId" IN ({nid_list})
        ''')
        for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
            all_info[str(row[0])] = {
                'rid': row[1], 'old_title': row[2], 'old_slug': row[3],
                'type': row[4], 'year': row[5], 'trim': row[6],
                'db_subj': row[7], 'cls': row[8], 'sec': row[9]
            }
    
    print(f'Fetched: {len(all_info)} resources')
    
    # Build new titles
    updates = []
    for m_row in mismatches:
        nid = m_row['nid']
        info = all_info.get(nid)
        if not info:
            continue
        
        new_title = generate_title(
            info['old_title'],
            info['db_subj'], info['cls'], info['sec'],
            info['year'], info['trim']
        )
        new_slug = to_slug(new_title)[:100]
        
        updates.append({
            'nid': nid, 'rid': info['rid'],
            'old_title': info['old_title'],
            'new_title': new_title, 'new_slug': new_slug
        })
    
    if not apply:
        print(f'\n*** DRY RUN - first 10 samples ***')
        for u in updates[:10]:
            print(f'\n  NID {u["nid"]}:')
            print(f'    Old: {u["old_title"][:80]}')
            print(f'    New: {u["new_title"]}')
            print(f'    Slug: {u["new_slug"]}')
        print(f'\nUse --apply to actually update {len(updates)} resources')
        return
    
    # Check for slug collisions
    print('\nChecking slug collisions...')
    for u in updates:
        nid = u['nid']
        slug = u['new_slug']
        r = m.neon_query(f"SELECT COUNT(*)::int FROM \"Resource\" WHERE slug = '{slug}' AND \"numericId\" != {nid}")
        count = int(r.get('response', [{}])[0].get('data', {}).get('rows', [[0]])[0][0])
        if count > 0:
            u['new_slug'] = f'{slug}-{nid}'
    
    # Apply changes
    print(f'\nApplying {len(updates)} updates...')
    fixed = 0
    errors = 0
    for i, u in enumerate(updates, 1):
        try:
            # Backup
            m.neon_query(f"""
                INSERT INTO "ResourceTitleBackup" 
                ("resourceId", "numericId", "oldTitle", "newTitle", "regeneratedBy", "regeneratedAt")
                VALUES ('{u["rid"]}', {u["nid"]}, $${u["old_title"]}$$, $${u["new_title"]}$$, 'fix_title_subject_mismatch', NOW())
                ON CONFLICT ("resourceId") DO UPDATE SET
                    "oldTitle" = EXCLUDED."oldTitle",
                    "newTitle" = EXCLUDED."newTitle",
                    "regeneratedBy" = EXCLUDED."regeneratedBy",
                    "regeneratedAt" = EXCLUDED."regeneratedAt"
            """)
            
            # Update
            m.neon_query(f"""
                UPDATE "Resource" 
                SET title = $${u["new_title"]}$$,
                    slug = '{u["new_slug"]}',
                    "updatedAt" = NOW()
                WHERE id = '{u["rid"]}'
            """)
            fixed += 1
        except Exception as e:
            errors += 1
            if errors <= 3:
                print(f'  [ERR] NID {u["nid"]}: {str(e)[:200]}')
        
        if i % 100 == 0:
            print(f'  [{i}/{len(updates)}] done', flush=True)
    
    print(f'\n✅ Fixed: {fixed}')
    print(f'❌ Errors: {errors}')

if __name__ == '__main__':
    main()
