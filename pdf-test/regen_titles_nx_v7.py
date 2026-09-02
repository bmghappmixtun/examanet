"""Fast batch updates using multi-row VALUES"""
import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import re
import time

# Re-fetch and process - same as v6
print('Fetching all rows...')
all_rows = []
offset = 0
while True:
    r = m.neon_query(f'''
SELECT r.id, r."numericId", r.title, r."homeworkSubtype", r."homeworkNumber",
  r.year, r.trimester,
  sub.slug as subj_slug, c.slug as cls_slug, sec.slug as sec_slug
FROM "Resource" r
LEFT JOIN "Subject" sub ON sub.id = r."subjectId"
LEFT JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Section" sec ON sec.id = r."sectionId"
WHERE r.type = 'HOMEWORK' 
  AND r."homeworkSubtype" IS NOT NULL 
  AND r."homeworkSubtype" != '' 
  AND r."homeworkNumber" IS NOT NULL
  AND r.title NOT LIKE '%N°%' 
  AND r.title NOT LIKE '%N.%' 
  AND r.title NOT LIKE '%n°%' 
  AND r.title NOT LIKE '%n\\.%'
ORDER BY r.id
OFFSET {offset} LIMIT 500
''')
    rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
    if not rows:
        break
    all_rows.extend(rows)
    offset += 500
    if len(rows) < 500:
        break

print(f'Fetched: {len(all_rows)}')

SUBJ_FR = {
    'mathematiques': 'Mathématiques', 'physique': 'Physique', 'svt': 'SVT',
    'informatique': 'Informatique', 'francais': 'Français', 'anglais': 'Anglais',
    'arabe': 'Arabe', 'histoire': 'Histoire', 'geographie': 'Géographie',
    'histoire-geographie': 'Histoire-Géographie', 'philo': 'Philosophie',
    'philosophie': 'Philosophie', 'algo-prog': 'Algo-Programmation',
    'technologie': 'Technologie', 'gestion': 'Gestion', 'economie': 'Économie',
    'economie-gestion': 'Économie-Gestion', 'espagnol': 'Espagnol',
    'allemand': 'Allemand', '3eme-langue': '3ème Langue',
    'education-civique': 'Éducation Civique', 'pensee-islamique': 'Pensée Islamique',
    'theatre': 'Théâtre', 'musique': 'Musique', 'arts-plastiques': 'Arts Plastiques',
    'sport': 'Sport', 'education-islamique': 'Éducation Islamique',
    'bases-donnees': 'Base de données', 'reseaux': 'Réseaux',
    'sciences': 'Sciences', 'sciences-physiques': 'Sciences Physiques',
    'sciences-de-la-vie-et-de-la-terre': 'SVT', 'lecture': 'Lecture',
    'production-ecrite': 'Production Écrite', 'orthographe': 'Orthographe',
    'grammaire': 'Grammaire', 'conjugaison': 'Conjugaison',
    'vocabulaire': 'Vocabulaire',
}

def get_subject_label(slug):
    if not slug: return ''
    return SUBJ_FR.get(slug, slug.replace('-', ' ').title())

def get_class_label(cls, sec):
    if not cls: return ''
    m_college = re.match(r'^(7|8|9)eme', cls)
    if m_college:
        base = f'{m_college.group(1)}ème'
    else:
        m_sec = re.match(r'^(1|2|3|4)(ere|eme|ème)', cls)
        if m_sec:
            base = f'{m_sec.group(1)}AS'
        else:
            base = cls[:8]
    if sec:
        sec_label = sec.replace('-', ' ').title()
        return f"{base} {sec_label}"
    return base

def get_subtype_label(sub):
    if sub == 'CONTROLE': return 'Contrôle'
    elif sub == 'SYNTHESE': return 'Synthèse'
    elif sub == 'REVISION': return 'Révision'
    elif sub == 'MAISON': return 'Maison'
    elif sub == 'COURSE': return 'Cours'
    return sub

def get_year_from_title(title, db_year):
    m_match = re.search(r'\((\d{4}-\d{4})\)', title)
    if m_match: return m_match.group(1)
    m_match2 = re.search(r'\b(\d{4}-\d{4})\b', title)
    if m_match2: return m_match2.group(1)
    return db_year

def get_trim_from_title(title, db_trim):
    m_match = re.search(r'Trim(?:estre)?\s*(\d)', title, re.IGNORECASE)
    if m_match: return int(m_match.group(1))
    return db_trim

updates = []
skipped = 0
for row in all_rows:
    rid, nid, title, hst, hwn, db_year, db_trim, sslug, cslug, secslug = row
    hwn_int = int(hwn) if hwn else None
    year = get_year_from_title(title, db_year)
    trim = get_trim_from_title(title, db_trim)
    if not year:
        skipped += 1
        continue
    
    subject_label = get_subject_label(sslug)
    class_label = get_class_label(cslug, secslug)
    subtype_label = get_subtype_label(hst)
    parts = [f"Devoir de {subtype_label} N°{hwn_int}", subject_label, class_label]
    if trim:
        parts.append(f"Trim{trim}")
    parts.append(f"({year})")
    new_title = ' - '.join(parts)
    new_title = re.sub(r'\s+', ' ', new_title).strip()
    updates.append((rid, nid, title, new_title))

print(f'Updates to apply: {len(updates)} (skipped {skipped})')

# 1. Backup all in one big INSERT (chunked)
BATCH = 200
total_backup = 0
print('\nStep 1: Backup to ResourceTitleBackup...')
for i in range(0, len(updates), BATCH):
    batch = updates[i:i+BATCH]
    values = []
    for rid, nid, old, new in batch:
        # Escape quotes
        old_e = old.replace("'", "''")
        new_e = new.replace("'", "''")
        values.append(f"('{rid}', {nid}, '{old_e}', '{new_e}', NOW(), 'regen_nx_v6')")
    
    sql = f'''
    INSERT INTO "ResourceTitleBackup" ("resourceId", "numericId", "oldTitle", "newTitle", "regeneratedAt", "regeneratedBy")
    VALUES {','.join(values)}
    ON CONFLICT ("resourceId") DO UPDATE SET "oldTitle" = EXCLUDED."oldTitle", "newTitle" = EXCLUDED."newTitle", "regeneratedAt" = NOW(), "regeneratedBy" = EXCLUDED."regeneratedBy"
    '''
    try:
        m.neon_query(sql)
        total_backup += len(batch)
        if (i+BATCH) % 600 == 0:
            print(f'  Backed up: {min(i+BATCH, len(updates))}/{len(updates)}')
    except Exception as e:
        print(f'  ERROR at {i}: {e}')

print(f'  Total backup: {total_backup}')

# 2. Update all in one big UPDATE using VALUES JOIN
print('\nStep 2: Apply title updates...')
total_update = 0
for i in range(0, len(updates), BATCH):
    batch = updates[i:i+BATCH]
    values = []
    for rid, nid, old, new in batch:
        new_e = new.replace("'", "''")
        values.append(f"('{rid}', '{new_e}')")
    
    # Use UPDATE with FROM (VALUES)
    sql = f'''
    UPDATE "Resource" r SET title = v.new_title
    FROM (VALUES {','.join(values)}) AS v(id, new_title)
    WHERE r.id = v.id
    '''
    try:
        m.neon_query(sql)
        total_update += len(batch)
        if (i+BATCH) % 600 == 0:
            print(f'  Updated: {min(i+BATCH, len(updates))}/{len(updates)}')
    except Exception as e:
        print(f'  ERROR at {i}: {e}')

print(f'  Total updated: {total_update}')
print(f'\n✅ Done! {total_update} titles regenerated.')
