"""Fix ali nafkha's misclassified math resources (should be Allemand)"""
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

math_nids = [8371, 8469, 8470, 8472, 8473, 8474, 8476, 8477, 14633]

# Check if NID 8371 was already partially done (N°=1, year=2024-2025 indicates regen done)
# But the subject wasn't changed. Let me re-do it.
r = m.neon_query('SELECT id FROM "Subject" WHERE slug = \'3eme-langue\'')
allemand_id = r.get('response', [{}])[0].get('data', {}).get('rows', [])[0][0]

for nid in math_nids:
    r = m.neon_query(f'''
SELECT r.id, r.title, r."homeworkSubtype", r."homeworkNumber", r.year, r.trimester, r."subjectId",
  c.slug as cls, sec.slug as sec
FROM "Resource" r
JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Section" sec ON sec.id = r."sectionId"
WHERE r."numericId" = {nid}
''')
    for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
        rid, title, hst, hwn, year, trim, sid, cls, sec = row
        
        # Skip if already changed
        if sid == allemand_id:
            print(f'NID {nid}: already allemand, skip')
            continue
        
        # Get math subject id
        r2 = m.neon_query('SELECT id FROM "Subject" WHERE slug = \'mathematiques\'')
        math_id = r2.get('response', [{}])[0].get('data', {}).get('rows', [])[0][0]
        if sid != math_id:
            print(f'NID {nid}: not math, skip')
            continue
        
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
        
        if hst == 'CONTROLE':
            st_label = 'Contrôle'
        elif hst == 'SYNTHESE':
            st_label = 'Synthèse'
        else:
            st_label = hst
        
        parts = [f"Devoir de {st_label} N°{hwn}", '3ème Langue', class_label]
        if trim:
            parts.append(f"Trim{trim}")
        parts.append(f"({year})")
        new_title = ' - '.join(parts)
        new_title = re.sub(r'\s+', ' ', new_title).strip()
        new_slug = title_to_slug(new_title, nid)
        
        print(f'\nNID {nid}:')
        print(f'  OLD: {title}')
        print(f'  NEW: {new_title}')
        
        # Backup title
        m.neon_query(f'''
INSERT INTO "ResourceTitleBackup" ("resourceId", "numericId", "oldTitle", "newTitle", "regeneratedAt", "regeneratedBy")
VALUES ('{rid}', {nid}, '{title.replace(chr(39), chr(39)+chr(39))}', '{new_title.replace(chr(39), chr(39)+chr(39))}', NOW(), 'fix_ali_nafkha_allemand')
ON CONFLICT ("resourceId") DO UPDATE SET "oldTitle" = EXCLUDED."oldTitle", "newTitle" = EXCLUDED."newTitle", "regeneratedAt" = NOW(), "regeneratedBy" = EXCLUDED."regeneratedBy"
''')
        
        # Backup subject reclassify
        m.neon_query(f'''
INSERT INTO "ResourceSubjectReclassify" ("resourceId", "numericId", "oldSubjectSlug", "newSubjectSlug", "aiSubject", "aiTitle", "changedAt", "changedBy")
VALUES ('{rid}', {nid}, 'mathematiques', '3eme-langue', 'Mathématiques', '{title.replace(chr(39), chr(39)+chr(39))}', NOW(), 'fix_ali_nafkha_allemand')
ON CONFLICT DO NOTHING
''')
        
        # Update
        m.neon_query(f'''
UPDATE "Resource" 
SET "subjectId" = '{allemand_id}', title = '{new_title.replace(chr(39), chr(39)+chr(39))}', slug = '{new_slug}'
WHERE id = '{rid}'
''')
        print('  ✓ Updated')

# Also update teaching subjects for teacher ali nafkha
r = m.neon_query('SELECT "teachingSubjects" FROM "User" WHERE slug = \'ali-nafkha\'')
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    print(f'\nTeacher teachingSubjects: {row[0]}')
