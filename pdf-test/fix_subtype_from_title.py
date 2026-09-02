"""Extract subtype from title and apply"""
import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import re

# Find all DEVOIR with title containing "Devoir de X" and apply the subtype
r = m.neon_query('''
SELECT id, "numericId", title, "homeworkSubtype", "homeworkNumber"
FROM "Resource"
WHERE type = 'DEVOIR' AND title ~* 'Devoir\s+de\s+(Contr|Synth|Maison|Révision)'
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'Found: {len(rows)}')

# For each, detect subtype from title
fixed = 0
for rid, nid, title, db_hst, hwn in rows:
    title_lower = title.lower()
    new_hst = None
    if re.search(r'devoir\s+de\s+r[ée]vision', title_lower):
        new_hst = 'REVISION'
    elif re.search(r'devoir\s+de\s+maison', title_lower):
        new_hst = 'MAISON'
    elif re.search(r'devoir\s+de\s+synth[èeéê]se', title_lower):
        new_hst = 'SYNTHESE'
    elif re.search(r'devoir\s+de\s+contr[oôö]le', title_lower):
        new_hst = 'CONTROLE'
    
    if new_hst and new_hst != db_hst:
        try:
            m.neon_query(f"UPDATE \"Resource\" SET \"homeworkSubtype\" = '{new_hst}' WHERE id = '{rid}'")
            fixed += 1
        except Exception as e:
            print(f'  Error NID {nid}: {e}')

print(f'✓ Updated {fixed} subtypes from title')

# Now also fix titles with stray "DEVOIR" word
print()
print("Fixing stray 'DEVOIR' word in titles...")
r = m.neon_query('''
SELECT id, "numericId", title
FROM "Resource"
WHERE title ~* 'DEVOIR\s+DEVOIR|Math\s+DEVOIR|Physique\s+DEVOIR'
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'Found: {len(rows)}')
for rid, nid, title in rows:
    new_title = re.sub(r'\s+DEVOIR\b', '', title)
    new_title = re.sub(r'\s+', ' ', new_title).strip()
    if new_title != title:
        m.neon_query(f"UPDATE \"Resource\" SET title = '{new_title.replace(chr(39), chr(39)+chr(39))}' WHERE id = '{rid}'")
print(f'✓ Fixed')

# Final check
r = m.neon_query('''
SELECT COUNT(*) FROM "Resource" 
WHERE type = 'DEVOIR' AND title LIKE 'Devoir%' AND ("homeworkSubtype" IS NULL OR "homeworkSubtype" = '')
''')
remaining = r.get('response', [{}])[0].get('data', {}).get('rows', [])[0][0]
print(f'\nRemaining DEVOIR with "Devoir" prefix but no subtype: {remaining}')

# Show them
r = m.neon_query('''
SELECT "numericId", title, "homeworkSubtype", "homeworkNumber", year
FROM "Resource"
WHERE type = 'DEVOIR' AND title LIKE 'Devoir%' AND ("homeworkSubtype" IS NULL OR "homeworkSubtype" = '')
LIMIT 20
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
for row in rows:
    print(f'  NID {row[0]}: {row[1][:80]}')
