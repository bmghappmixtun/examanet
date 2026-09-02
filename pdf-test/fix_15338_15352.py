import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import re
import unicodedata

def title_to_slug(title, nid):
    s = unicodedata.normalize('NFD', title)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = s.lower()
    s = re.sub(r'[\s_]+', '-', s)
    s = re.sub(r'[^a-z0-9\-]', '', s)
    s = re.sub(r'-+', '-', s)
    s = s.strip('-')
    return f"{s}-{nid}"

SUBJ_FR = {
    'svt': 'SVT', 'physique': 'Sciences Physiques', 'mathematiques': 'Mathématiques',
    'francais': 'Français', 'anglais': 'Anglais', 'informatique': 'Informatique',
    'arabe': 'Arabe', 'histoire': 'Histoire', 'geographie': 'Géographie',
}

for nid in [15338, 15352]:
    r = m.neon_query(f'''
SELECT r.id, r.title, r."homeworkSubtype", r."homeworkNumber", r.year, r.trimester,
  r."subjectId", c.slug as cls, sec.slug as sec
FROM "Resource" r
JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Section" sec ON sec.id = r."sectionId"
WHERE r."numericId" = {nid}
''')
    for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
        rid, title, hst, hwn, year, trim, sid, cls, sec = row
        r2 = m.neon_query(f'SELECT slug FROM "Subject" WHERE id = \'{sid}\'')
        sslug = r2.get('response', [{}])[0].get('data', {}).get('rows', [])[0][0]
        
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
            class_label = f"{base} {sec_label}"
        else:
            class_label = base
        
        subject_label = SUBJ_FR.get(sslug, sslug.title())
        new_hst = 'CONTROLE'  # default since "Devoir N°" without specific subtype
        new_year = year if year else None
        new_title = f"Devoir de Contrôle N°{hwn} - {subject_label} - {class_label}"
        if trim:
            new_title += f" - Trim{trim}"
        if new_year:
            new_title += f" - ({new_year})"
        new_title = re.sub(r'\s+', ' ', new_title).strip()
        new_slug = title_to_slug(new_title, nid)
        
        print(f'NID {nid}:')
        print(f'  OLD: {title}')
        print(f'  NEW: {new_title}')
        
        m.neon_query(f'''
INSERT INTO "ResourceTitleBackup" ("resourceId", "numericId", "oldTitle", "newTitle", "regeneratedAt", "regeneratedBy")
VALUES ('{rid}', {nid}, '{title.replace(chr(39), chr(39)+chr(39))}', '{new_title.replace(chr(39), chr(39)+chr(39))}', NOW(), 'fix_15338_15352')
ON CONFLICT ("resourceId") DO UPDATE SET "oldTitle" = EXCLUDED."oldTitle", "newTitle" = EXCLUDED."newTitle", "regeneratedAt" = NOW(), "regeneratedBy" = EXCLUDED."regeneratedBy"
''')
        m.neon_query(f"UPDATE \"Resource\" SET \"homeworkSubtype\" = '{new_hst}', title = '{new_title.replace(chr(39), chr(39)+chr(39))}', slug = '{new_slug}' WHERE id = '{rid}'")
        print('  ✓ Updated')
