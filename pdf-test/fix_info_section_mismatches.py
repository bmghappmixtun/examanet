import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import json
import re

with open('/tmp/info_section_mismatches.json', 'r') as f:
    raw = json.load(f)

r = m.neon_query("SELECT id, slug FROM \"Section\" WHERE slug IN ('technologies-informatique', 'sciences-informatique')")
sec_ids = {row[1]: row[0] for row in r.get('response', [{}])[0].get('data', {}).get('rows', [])}

resource_ids = [r[0] for r in raw]
ids_csv = ','.join([f"'{rid}'" for rid in resource_ids])

r = m.neon_query(f'''
SELECT r.id, r."numericId", r.title, r.slug, r."sectionId", sec.slug as sec_slug
FROM "Resource" r
LEFT JOIN "Section" sec ON sec.id = r."sectionId"
WHERE r.id IN ({ids_csv})
''')
current = {}
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    rid, nid, title, slug, sec_id, sec_slug = row
    current[rid] = {'nid': nid, 'title': title, 'slug': slug, 'old_section_id': sec_id, 'old_section_slug': sec_slug}
print(f'Loaded {len(current)} resources')

# Backup titles - include numericId
print('\n=== Backing up titles ===')
values_list = []
for rid, info in current.items():
    safe_title = info['title'].replace("'", "''")
    values_list.append(f"({info['nid']}, '{rid}', '{safe_title}', 'info-section-fix-2026-07-25', NOW())")
values_csv = ',\n'.join(values_list)
m.neon_query(f'''
INSERT INTO "ResourceTitleBackup" ("numericId", "resourceId", "oldTitle", "regeneratedBy", "regeneratedAt")
VALUES
{values_csv}
ON CONFLICT ("resourceId") DO UPDATE SET
    "oldTitle" = EXCLUDED."oldTitle",
    "regeneratedBy" = EXCLUDED."regeneratedBy",
    "regeneratedAt" = EXCLUDED."regeneratedAt"
''')
print(f'Backed up {len(current)} titles')

# Step 2: Update sectionId
print('\n=== Updating sectionId ===')
ti_ids = [rid for rid, target, _, _, _ in raw if target == 'technologies-informatique']
si_ids = [rid for rid, target, _, _, _ in raw if target == 'sciences-informatique']

if ti_ids:
    ti_csv = ','.join([f"'{rid}'" for rid in ti_ids])
    m.neon_query(f"UPDATE \"Resource\" SET \"sectionId\" = '{sec_ids['technologies-informatique']}' WHERE id IN ({ti_csv})")
    print(f'Updated {len(ti_ids)} to technologies-informatique')

if si_ids:
    si_csv = ','.join([f"'{rid}'" for rid in si_ids])
    m.neon_query(f"UPDATE \"Resource\" SET \"sectionId\" = '{sec_ids['sciences-informatique']}' WHERE id IN ({si_csv})")
    print(f'Updated {len(si_ids)} to sciences-informatique')

# Step 3: Get new state
r = m.neon_query(f'''
SELECT r.id, sub.slug as subj, c.slug as cls, sec.slug as sec,
       r.type, r."homeworkSubtype", r."homeworkNumber", r.trimester, r.year
FROM "Resource" r
JOIN "Subject" sub ON sub.id = r."subjectId"
JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Section" sec ON sec.id = r."sectionId"
WHERE r.id IN ({ids_csv})
''')
new_info = {}
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    rid, subj, cls, sec, rtype, subtype, hwn, trim, year = row
    new_info[rid] = {
        'subj': subj, 'cls': cls, 'sec': sec,
        'type': rtype, 'subtype': subtype,
        'hwn': hwn, 'trim': trim, 'year': year,
    }

SUBJECT_NAMES = {
    'mathematiques': 'Mathématiques', 'physique': 'Physique', 'svt': 'Sciences de la vie et de la terre',
    'francais': 'Français', 'anglais': 'Anglais', 'arabe': 'Arabe',
    'histoire-geographie': 'Histoire-Géographie', 'histoire': 'Histoire', 'geographie': 'Géographie',
    'philosophie': 'Philosophie', 'informatique': 'Informatique', 'algo-prog': 'Algorithme et programmation',
    'bases-donnees': 'Bases de données', 'tic': 'TIC', 'technologie': 'Technologie',
    'economie': 'Économie', 'gestion': 'Gestion', '3eme-langue': '3ème Langue',
    'sport': 'Sport', 'education-islamique': 'Éducation islamique', 'education-civique': 'Éducation civique',
}

CLASS_DISPLAY = {
    '1ere-annee': '1AS', '2eme-secondaire': '2AS', '3eme-secondaire': '3AS',
    '4eme-secondaire': '4AS', '7eme': '7ème', '8eme': '8ème', '9eme': '9ème',
}

def regen_title(info):
    rtype = info['type']
    subtype = info['subtype']
    hwn = info['hwn']
    trim = info['trim']
    year = info['year']
    cls = info['cls']
    sec = info['sec']
    subj = info['subj']
    
    if cls == '2eme-secondaire' and sec == 'technologies-informatique':
        sec_display = 'TI'
    elif cls in ('3eme-secondaire', '4eme-secondaire') and sec == 'sciences-informatique':
        sec_display = 'SI'
    else:
        sec_display = ''
    
    if rtype == 'DEVOIR' and subtype:
        if hwn:
            type_subtype = f'Devoir de {subtype.title()} N°{hwn}'
        else:
            type_subtype = f'Devoir de {subtype.title()}'
    elif rtype == 'DEVOIR' and hwn:
        type_subtype = f'Devoir N°{hwn}'
    elif rtype == 'EXERCISE' and hwn:
        type_subtype = f"Série d'exercices N°{hwn}"
    elif rtype == 'EXERCISE':
        type_subtype = "Série d'exercices"
    elif rtype == 'COURSE':
        type_subtype = 'Cours'
    elif rtype == 'SUMMARY':
        type_subtype = 'Résumé'
    else:
        type_subtype = rtype
    
    subj_display = SUBJECT_NAMES.get(subj, subj.title())
    cls_display = CLASS_DISPLAY.get(cls, cls)
    
    parts = [type_subtype, subj_display, cls_display]
    if sec_display:
        parts.append(sec_display)
    
    title = ' - '.join(parts)
    if trim:
        title += f' - Trim{trim}'
    if year:
        title += f' - ({year})'
    
    return title

title_updates = []
for rid, target_sec, nid, old_title, pattern in raw:
    info = new_info[rid]
    new_title = regen_title(info)
    title_updates.append((rid, new_title))

print('\nSamples:')
for rid, new_title in title_updates[:5]:
    print(f'  NID {current[rid]["nid"]}:')
    print(f'    OLD: {current[rid]["title"][:80]}')
    print(f'    NEW: {new_title}')

print(f'\n=== Applying {len(title_updates)} title updates ===')
case_clauses = []
for rid, new_title in title_updates:
    safe_title = new_title.replace("'", "''")
    case_clauses.append(f"WHEN id = '{rid}' THEN '{safe_title}'")
case_sql = ' '.join(case_clauses)
ids_in = ','.join([f"'{r[0]}'" for r in title_updates])
m.neon_query(f'''
UPDATE "Resource"
SET title = CASE {case_sql} ELSE title END
WHERE id IN ({ids_in})
''')
print(f'Updated {len(title_updates)} titles')

def make_slug(title, nid):
    s = title.lower()
    repl = {
        'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a',
        'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
        'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
        'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o',
        'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u',
        'ý': 'y', 'ÿ': 'y', 'ç': 'c', 'ñ': 'n',
    }
    for k, v in repl.items():
        s = s.replace(k, v)
    s = re.sub(r'[^a-z0-9\s-]', ' ', s)
    s = re.sub(r'\s+', '-', s.strip())
    s = re.sub(r'-+', '-', s)
    s = s.strip('-')
    return f'{s}-{nid}'

print(f'\n=== Updating slugs ===')
slug_cases = []
for rid, new_title in title_updates:
    nid = current[rid]['nid']
    new_slug = make_slug(new_title, nid)
    slug_cases.append(f"WHEN id = '{rid}' THEN '{new_slug}'")
slug_sql = ' '.join(slug_cases)
m.neon_query(f'''
UPDATE "Resource"
SET slug = CASE {slug_sql} ELSE slug END
WHERE id IN ({ids_in})
''')
print(f'Updated {len(title_updates)} slugs')

print('\n=== NID 15361 final state ===')
r = m.neon_query('''
SELECT r."numericId", r.title, r.slug, r."sectionId", sec.slug as sec_slug, r.type, r."homeworkSubtype", r."homeworkNumber", r.year
FROM "Resource" r
LEFT JOIN "Section" sec ON sec.id = r."sectionId"
WHERE r."numericId" = 15361
''')
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    nid, title, slug, sec_id, sec_slug, rtype, subtype, hwn, year = row
    print(f'  Title: {title}')
    print(f'  Section: {sec_slug}')
    print(f'  Slug: {slug}')

print('\n=== Final Summary ===')
print(f'  Section mismatches fixed: {len(raw)}')
print(f'  - 2AS Informatique → TI: {sum(1 for r in raw if r[4] == "2AS→TI")}')
print(f'  - 4AS Informatique → SI: {sum(1 for r in raw if r[4] == "4AS→SI")}')
