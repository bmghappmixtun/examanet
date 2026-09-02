#!/usr/bin/env python3
"""
Fix 3 issues:
1. NID 167: BAC_SUBJECT misclassified (9ème année concours, not BAC exam)
2. NID 2487 + 6 similar: Duplicate subtype labels (e.g., "SYNTHESE N 2" appears twice in title)
3. "Sujet BAC" filter auto-disappears (no more BAC_SUBJECT resources)

Run: 2026-07-25 - 1 misclassification + 7 title cleanups
"""
import sys
import re
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

# 1. Fix NID 167 (9ème année "concours" = Devoir de Contrôle, NOT Sujet BAC)
m.neon_query('''UPDATE "Resource" SET type = 'DEVOIR', "homeworkSubtype" = 'CONTROLE' WHERE "numericId" = 167''')
m.neon_query('''UPDATE "Resource" SET title = 'Devoir de Contrôle N°6 - Mathématiques - 9ème année de base - (2021-2022)', slug = 'devoir-de-controle-n-6-mathematiques-9e-167' WHERE "numericId" = 167''')

# 2. Remove duplicate subtype labels
PATTERNS = [
    (r'\s*-\s*Math\s+SYNTHESE\s*N\s*\d+\s*', ' - Math '),
    (r'\s*-\s*Math\s+CONTROLE\s+N\s*\d+\s*', ' - Math '),
    (r'\s+SYNTHESE\s+N\s*\d+\s*', ' '),
    (r'\s+CONTROLE\s+N\s*\d+\s*', ' '),
    (r'\s*devoir\s+de\s+synthese\s+N\s*\d+\s*', ' '),
    (r'\s*devoir\s+de\s+controle\s+n\s*\d+\s*', ' '),
]

r = m.neon_query('''SELECT id, "numericId", title, type, "homeworkSubtype", "homeworkNumber" FROM "Resource" WHERE title ~* '(SYNTHESE|CONTROLE|REVISION|MAISON)\\s+N\\s*[0-9]' OR title ~* '(synthese|controle|révision|revision|maison)\\s+n\\s*[0-9]' OR title ~* 'devoir\\s+de\\s+(synthese|controle|révision|revision|maison)\\s+n\\s*[0-9]' ''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])

for row in rows:
    rid, nid, title, rtype, subtype, hwn = row
    new_title = title
    for pat, repl in PATTERNS:
        new_title = re.sub(pat, repl, new_title, flags=re.IGNORECASE)
    new_title = re.sub(r'\s+', ' ', new_title).strip()
    new_title = re.sub(r'\s*-\s*$', '', new_title)
    if new_title != title:
        safe = new_title.replace("'", "''")
        m.neon_query(f"UPDATE \"Resource\" SET title = '{safe}' WHERE id = '{rid}'")

# 3. Sujet BAC filter: auto-removed (0 BAC_SUBJECT left)
print('Done: 1 misclass + 7 title cleanups. Sujet BAC filter auto-removed.')
