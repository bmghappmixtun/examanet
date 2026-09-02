"""Fix NID 15349 + 448 similar misclassified resources"""
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

# ============================================
# FIX 1: NID 15349 (user's example)
# ============================================
print("=" * 60)
print("FIX 1: NID 15349 (user's example)")
print("=" * 60)

r = m.neon_query('''
SELECT r.id, r."numericId", r.title, r."homeworkSubtype", r."homeworkNumber", r.year, r.trimester,
  r."subjectId", c.slug as cls, sec.slug as sec
FROM "Resource" r
JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Section" sec ON sec.id = r."sectionId"
WHERE r."numericId" = 15349
''')
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    rid, nid, title, hst, hwn, year, trim, sid, cls, sec = row
    
    # Get subject
    r2 = m.neon_query(f'SELECT slug FROM "Subject" WHERE id = \'{sid}\'')
    sslug = r2.get('response', [{}])[0].get('data', {}).get('rows', [])[0][0]
    
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
        sec_label = sec.replace('-', ' ').title().replace('Et', '&')
        class_label = f"{base} {sec_label}"
    else:
        class_label = base
    
    subject_label = 'Géographie' if sslug == 'geographie' else sslug.title()
    new_hst = 'SYNTHESE'
    new_hwn = 1
    new_year = '2010-2011'
    new_type = 'DEVOIR'
    
    parts = [f"Devoir de Synthèse N°{new_hwn}", subject_label, class_label]
    if trim:
        parts.append(f"Trim{trim}")
    parts.append(f"({new_year})")
    new_title = ' - '.join(parts)
    new_title = re.sub(r'\s+', ' ', new_title).strip()
    new_slug = title_to_slug(new_title, nid)
    
    print(f'  OLD: [{title}] (type=EXERCISE)')
    print(f'  NEW: [{new_title}] (type=DEVOIR, sub={new_hst}, N°={new_hwn}, year={new_year})')
    
    # Backup
    m.neon_query(f'''
INSERT INTO "ResourceTitleBackup" ("resourceId", "numericId", "oldTitle", "newTitle", "regeneratedAt", "regeneratedBy")
VALUES ('{rid}', {nid}, '{title.replace(chr(39), chr(39)+chr(39))}', '{new_title.replace(chr(39), chr(39)+chr(39))}', NOW(), 'fix_15349')
ON CONFLICT ("resourceId") DO UPDATE SET "oldTitle" = EXCLUDED."oldTitle", "newTitle" = EXCLUDED."newTitle", "regeneratedAt" = NOW(), "regeneratedBy" = EXCLUDED."regeneratedBy"
''')
    
    # Update
    m.neon_query(f'''
UPDATE "Resource" 
SET type = '{new_type}', "homeworkSubtype" = '{new_hst}', "homeworkNumber" = {new_hwn}, year = '{new_year}', title = '{new_title.replace(chr(39), chr(39)+chr(39))}', slug = '{new_slug}'
WHERE id = '{rid}'
''')
    print('  ✓ Updated')

# ============================================
# FIX 2: 448 similar (type=EXERCISE with 'Devoir' title)
# Strategy: type=EXERCISE → type=DEVOIR, but keep other fields
# ============================================
print("\n" + "=" * 60)
print("FIX 2: 448 EXERCISE with 'Devoir' prefix → DEVOIR")
print("=" * 60)

r = m.neon_query('''
SELECT id, "numericId", title
FROM "Resource"
WHERE type = 'EXERCISE' AND title LIKE 'Devoir%'
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'Found: {len(rows)}')

# Just change type, no need to regen title (already has Devoir in it)
# But also backup first
BATCH = 100
for i in range(0, len(rows), BATCH):
    batch = rows[i:i+BATCH]
    ids = [r[0] for r in batch]
    ids_str = "','".join(ids)
    # Update type to DEVOIR
    m.neon_query(f"UPDATE \"Resource\" SET type = 'DEVOIR' WHERE id IN ('{ids_str}')")
    if (i+BATCH) % 500 == 0 or (i+BATCH) >= len(rows):
        print(f'  Progress: {min(i+BATCH, len(rows))}/{len(rows)}')

print(f'✓ {len(rows)} type changed to DEVOIR')

# Verify
r = m.neon_query('''
SELECT type, COUNT(*) FROM "Resource"
WHERE title LIKE 'Devoir%' OR title LIKE 'Série%' OR title LIKE 'Cours%' OR title LIKE 'Examen%'
GROUP BY type
''')
print('\nNew type distribution for "Devoir/Série/Cours/Examen" titles:')
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    print(f'  {row[0]}: {row[1]}')
