"""Fix NID 14808 (the example) and similar corrupt titles"""
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
    'physique': 'Sciences Physiques',
    'mathematiques': 'Mathématiques',
    'svt': 'SVT',
    'informatique': 'Informatique',
    'francais': 'Français',
    'anglais': 'Anglais',
    'arabe': 'Arabe',
    'histoire': 'Histoire',
    'geographie': 'Géographie',
    'algo-prog': 'Algorithmique-Programmation',
    '3eme-langue': '3ème Langue',
    'pensee-islamique': 'Pensée Islamique',
    'economie': 'Économie',
    'gestion': 'Gestion',
    'economie-gestion': 'Économie-Gestion',
    'philosophie': 'Philosophie',
    'philo': 'Philosophie',
}

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

# ============================================
# FIX 1: NID 14808 (user's example)
# ============================================
print("=" * 60)
print("FIX 1: NID 14808 (user's example)")
print("=" * 60)

r = m.neon_query('''
SELECT r.id, r.title, r."homeworkSubtype", r."homeworkNumber", r.year, r.trimester, r."subjectId",
  c.slug as cls, sec.slug as sec
FROM "Resource" r
JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Section" sec ON sec.id = r."sectionId"
WHERE r."numericId" = 14808
''')
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    rid, title, hst, hwn, year, trim, sid, cls, sec = row
    # PDF says: "Devoir de Révision n°5" → subtype=REVISION
    # URL says: 2014-2015
    # Subject: physique
    new_hst = 'REVISION'
    new_year = '2014-2015'
    class_label = get_class_label(cls, sec)
    subject_label = SUBJ_FR.get('physique', 'Physique')
    
    parts = [f"Devoir de Révision N°{hwn}", subject_label, class_label]
    if trim:
        parts.append(f"Trim{trim}")
    parts.append(f"({new_year})")
    new_title = ' - '.join(parts)
    new_title = re.sub(r'\s+', ' ', new_title).strip()
    new_slug = title_to_slug(new_title, 14808)
    
    print(f'  OLD: {title}')
    print(f'  NEW: {new_title}')
    
    # Backup
    m.neon_query(f'''
INSERT INTO "ResourceTitleBackup" ("resourceId", "numericId", "oldTitle", "newTitle", "regeneratedAt", "regeneratedBy")
VALUES ('{rid}', 14808, '{title.replace(chr(39), chr(39)+chr(39))}', '{new_title.replace(chr(39), chr(39)+chr(39))}', NOW(), 'fix_14808')
ON CONFLICT ("resourceId") DO UPDATE SET "oldTitle" = EXCLUDED."oldTitle", "newTitle" = EXCLUDED."newTitle", "regeneratedAt" = NOW(), "regeneratedBy" = EXCLUDED."regeneratedBy"
''')
    
    # Update
    m.neon_query(f'''
UPDATE "Resource" 
SET "homeworkSubtype" = '{new_hst}', year = '{new_year}', title = '{new_title.replace(chr(39), chr(39)+chr(39))}', slug = '{new_slug}'
WHERE id = '{rid}'
''')
    print('  ✓ Updated')

# ============================================
# FIX 2: Trailing digit bug (30+ cases)
# Pattern: "Devoir de Contrôle N°5 - Math - 8ème (2014-2015) 2"
# Should be: "Devoir de Contrôle N°5 - Math - 8ème (2014-2015)"
# ============================================
print("\n" + "=" * 60)
print("FIX 2: Remove trailing digit bug (~30 cases)")
print("=" * 60)

r = m.neon_query('''
SELECT id, "numericId", title
FROM "Resource"
WHERE title ~ '\\s\\d+$'
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'  Found {len(rows)} titles with trailing digit')

for rid, nid, title in rows:
    # Remove trailing " N" where N is a single digit
    new_title = re.sub(r'\s+\d+$', '', title)
    if new_title != title:
        new_slug = title_to_slug(new_title, nid)
        # Backup
        m.neon_query(f'''
INSERT INTO "ResourceTitleBackup" ("resourceId", "numericId", "oldTitle", "newTitle", "regeneratedAt", "regeneratedBy")
VALUES ('{rid}', {nid}, '{title.replace(chr(39), chr(39)+chr(39))}', '{new_title.replace(chr(39), chr(39)+chr(39))}', NOW(), 'fix_trailing_digit')
ON CONFLICT ("resourceId") DO UPDATE SET "oldTitle" = EXCLUDED."oldTitle", "newTitle" = EXCLUDED."newTitle", "regeneratedAt" = NOW(), "regeneratedBy" = EXCLUDED."regeneratedBy"
''')
        # Update title and slug
        m.neon_query(f"UPDATE \"Resource\" SET title = '{new_title.replace(chr(39), chr(39)+chr(39))}', slug = '{new_slug}' WHERE id = '{rid}'")
print(f'  ✓ {len(rows)} titles fixed')

# ============================================
# FIX 3: "Série d'exercices" with type=DEVOIR
# These might be misclassified (PDF probably says "Devoir" not "Série")
# Or the title is wrong (should be "Devoir ...")
# For safety: just regen the title to "Devoir de..." format
# ============================================
print("\n" + "=" * 60)
print("FIX 3: 'Série d'exercices' with type=DEVOIR (6 cases)")
print("=" * 60)

r = m.neon_query('''
SELECT r.id, r."numericId", r.title, r."homeworkSubtype", r."homeworkNumber", r.year, r.trimester,
  c.slug as cls, sec.slug as sec
FROM "Resource" r
JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Section" sec ON sec.id = r."sectionId"
WHERE r.title LIKE 'Série d%' AND r.type = 'DEVOIR'
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])

# For each, get subject and rebuild
for rid, nid, title, hst, hwn, year, trim, cls, sec in rows:
    r2 = m.neon_query(f'SELECT sub.slug FROM "Resource" r JOIN "Subject" sub ON sub.id = r."subjectId" WHERE r.id = \'{rid}\'')
    sslug = r2.get('response', [{}])[0].get('data', {}).get('rows', [])[0][0]
    
    subject_label = SUBJ_FR.get(sslug, sslug.title())
    class_label = get_class_label(cls, sec)
    subtype_label = {'CONTROLE': 'Contrôle', 'SYNTHESE': 'Synthèse', 'REVISION': 'Révision', 'MAISON': 'Maison'}.get(hst, hst) if hst else 'Devoir'
    
    if hst == 'REVISION':
        new_title = f"Devoir de Révision N°{hwn} - {subject_label} - {class_label}"
    else:
        new_title = f"Devoir de {subtype_label} N°{hwn} - {subject_label} - {class_label}"
    
    if trim:
        new_title += f" - Trim{trim}"
    if year:
        new_title += f" - ({year})"
    
    new_title = re.sub(r'\s+', ' ', new_title).strip()
    new_slug = title_to_slug(new_title, nid)
    
    print(f'\n  NID {nid}:')
    print(f'    OLD: {title[:80]}')
    print(f'    NEW: {new_title}')
    
    # Backup
    m.neon_query(f'''
INSERT INTO "ResourceTitleBackup" ("resourceId", "numericId", "oldTitle", "newTitle", "regeneratedAt", "regeneratedBy")
VALUES ('{rid}', {nid}, '{title.replace(chr(39), chr(39)+chr(39))}', '{new_title.replace(chr(39), chr(39)+chr(39))}', NOW(), 'fix_serie_to_devoir')
ON CONFLICT ("resourceId") DO UPDATE SET "oldTitle" = EXCLUDED."oldTitle", "newTitle" = EXCLUDED."newTitle", "regeneratedAt" = NOW(), "regeneratedBy" = EXCLUDED."regeneratedBy"
''')
    # Update
    m.neon_query(f"UPDATE \"Resource\" SET title = '{new_title.replace(chr(39), chr(39)+chr(39))}', slug = '{new_slug}' WHERE id = '{rid}'")
    print('    ✓ Updated')
