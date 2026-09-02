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

# Get subject IDs
r = m.neon_query('SELECT id, slug FROM "Subject" WHERE slug IN (\'pensee-islamique\', \'histoire\', \'3eme-langue\')')
sub_ids = {}
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    sub_ids[row[1]] = row[0]
print(f'Subject IDs: {sub_ids}')

# Fixes: (NID, new_subj_slug_or_None, new_subj_label, subtype, hwn, year, trim)
fixes = [
    (15370, 'pensee-islamique', 'Pensée Islamique', 'CONTROLE', 2, '2012-2013', None),  # Was histoire
    (15373, None, '3ème Langue', 'SYNTHESE', 3, '2012-2013', None),
    (15375, None, '3ème Langue', 'SYNTHESE', 3, '2012-2013', None),
    (15376, None, '3ème Langue', 'SYNTHESE', 3, '2012-2013', None),
    (15377, None, '3ème Langue', 'SYNTHESE', 3, '2012-2013', None),
]

SUBTYPE_FR = {'CONTROLE': 'Contrôle', 'SYNTHESE': 'Synthèse', 'REVISION': 'Révision', 'MAISON': 'Maison'}

for nid, new_subj_slug, new_subj_label, subtype, hwn, year, trim in fixes:
    r = m.neon_query(f'''
SELECT r.id, r.title, r."homeworkSubtype", r."homeworkNumber", r.year, r.trimester, r."subjectId",
  c.slug as cls, sec.slug as sec
FROM "Resource" r
JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Section" sec ON sec.id = r."sectionId"
WHERE r."numericId" = {nid}
''')
    for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
        rid, title, hst, old_hwn, old_year, old_trim, sid, cls, sec = row
        
        # Get old subject
        r2 = m.neon_query(f'SELECT slug FROM "Subject" WHERE id = \'{sid}\'')
        old_subj_slug = r2.get('response', [{}])[0].get('data', {}).get('rows', [])[0][0]
        
        # Class label
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
        
        subtype_label = SUBTYPE_FR.get(subtype, subtype)
        parts = [f"Devoir de {subtype_label} N°{hwn}", new_subj_label, class_label]
        if trim:
            parts.append(f"Trim{trim}")
        parts.append(f"({year})")
        new_title = ' - '.join(parts)
        new_title = re.sub(r'\s+', ' ', new_title).strip()
        new_slug = title_to_slug(new_title, nid)
        
        print(f'\nNID {nid}:')
        print(f'  OLD: [{old_subj_slug}/type=EXAM] {title}')
        print(f'  NEW: [{new_subj_slug or old_subj_slug}/type=HOMEWORK/{subtype}/N°{hwn}] {new_title}')
        
        # Backup title
        m.neon_query(f'''
INSERT INTO "ResourceTitleBackup" ("resourceId", "numericId", "oldTitle", "newTitle", "regeneratedAt", "regeneratedBy")
VALUES ('{rid}', {nid}, '{title.replace(chr(39), chr(39)+chr(39))}', '{new_title.replace(chr(39), chr(39)+chr(39))}', NOW(), 'fix_5_examens')
ON CONFLICT ("resourceId") DO UPDATE SET "oldTitle" = EXCLUDED."oldTitle", "newTitle" = EXCLUDED."newTitle", "regeneratedAt" = NOW(), "regeneratedBy" = EXCLUDED."regeneratedBy"
''')
        
        # Subject change (only if needed)
        if new_subj_slug and new_subj_slug != old_subj_slug:
            new_sid = sub_ids[new_subj_slug]
            m.neon_query(f'''
INSERT INTO "ResourceSubjectReclassify" ("resourceId", "numericId", "oldSubjectSlug", "newSubjectSlug", "aiSubject", "aiTitle", "changedAt", "changedBy")
VALUES ('{rid}', {nid}, '{old_subj_slug}', '{new_subj_slug}', 'histoire', '{title.replace(chr(39), chr(39)+chr(39))}', NOW(), 'fix_5_examens')
ON CONFLICT DO NOTHING
''')
            m.neon_query(f'UPDATE "Resource" SET "subjectId" = \'{new_sid}\' WHERE id = \'{rid}\'')
            print(f'  Subject: {old_subj_slug} → {new_subj_slug}')
        
        # Update: type, subtype, hwn, title, slug
        m.neon_query(f'''
UPDATE "Resource" 
SET type = 'HOMEWORK', "homeworkSubtype" = '{subtype}', "homeworkNumber" = {hwn},
    year = '{year}', trimester = NULL, title = '{new_title.replace(chr(39), chr(39)+chr(39))}', slug = '{new_slug}'
WHERE id = '{rid}'
''')
        print('  ✓ Updated')
