import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import re

# Pattern: match each OTHER title and decide type
r = m.neon_query('''
SELECT id, "numericId", title
FROM "Resource"
WHERE type = 'OTHER' AND (
  title ~* 'فرض' OR title ~* 'اختبار' OR title ~* 'سلسلة' OR
  title ~* 'Devoir|Contrôle|Synthèse|Serie|Test|Examen'
)
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])

# Categorize each
updates_type = {}  # id -> (new_type, new_subtype)
for rid, nid, title in rows:
    new_type = None
    new_subtype = None
    title_lower = title.lower()
    
    # سلسلة = Série d'exercices = EXERCISE
    if 'سلسلة' in title or 'serie d' in title_lower:
        new_type = 'EXERCISE'
    # فرض تأليفي = Devoir de Synthèse
    elif 'فرض تأليفي' in title or 'فرض تاليفي' in title or 'synth' in title_lower:
        new_type = 'DEVOIR'
        new_subtype = 'SYNTHESE'
    # فرض مراقبة = Devoir de Contrôle
    elif 'فرض مراقبة' in title or 'contr' in title_lower:
        new_type = 'DEVOIR'
        new_subtype = 'CONTROLE'
    # فرض عادي = Devoir Normal (= Devoir de Contrôle)
    elif 'فرض عادي' in title or 'فرض' in title:
        new_type = 'DEVOIR'
        new_subtype = 'CONTROLE'
    # اختبار كتابي = Test écrit = could be DEVOIR or EXAM
    elif 'اختبار كتابي' in title or 'اختبار' in title:
        new_type = 'DEVOIR'
        new_subtype = 'CONTROLE'  # default
    # Devoir in French
    elif 'devoir' in title_lower:
        new_type = 'DEVOIR'
        if 'synth' in title_lower:
            new_subtype = 'SYNTHESE'
        elif 'contr' in title_lower:
            new_subtype = 'CONTROLE'
    
    if new_type:
        updates_type[rid] = (new_type, new_subtype)

print(f'Updates to apply: {len(updates_type)}')

# Apply in batches
updates = list(updates_type.items())
BATCH = 100
for i in range(0, len(updates), BATCH):
    batch = updates[i:i+BATCH]
    for rid, (new_type, new_subtype) in batch:
        if new_subtype:
            m.neon_query(f"UPDATE \"Resource\" SET type = '{new_type}', \"homeworkSubtype\" = '{new_subtype}' WHERE id = '{rid}'")
        else:
            m.neon_query(f"UPDATE \"Resource\" SET type = '{new_type}' WHERE id = '{rid}'")
    print(f'  Progress: {min(i+BATCH, len(updates))}/{len(updates)}')

# Check final state of OTHER
r = m.neon_query('SELECT COUNT(*) FROM "Resource" WHERE type = \'OTHER\'')
remaining = r.get('response', [{}])[0].get('data', {}).get('rows', [])[0][0]
print(f'\nRemaining OTHER: {remaining}')

# Final
r = m.neon_query('SELECT type, COUNT(*) FROM "Resource" GROUP BY type ORDER BY COUNT(*) DESC')
print('\nFinal distribution:')
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    print(f'  {row[0]}: {row[1]}')
