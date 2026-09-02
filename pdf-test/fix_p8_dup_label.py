#!/usr/bin/env python3
"""P8b: Clean duplicate N°X patterns in title.
Patterns:
- "Devoir de Contrôle N°1 - Devoir N°1 - X" → "Devoir de Contrôle N°1 - X"
- "Devoir de Synthese N°2 - X pour Devoir de synthèse N°2 - Y" → "Devoir de Synthèse N°2 - X pour Y"
"""
import importlib.util, re
spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

PROGRESS = '/workspace/edutunisie/pdf-test/fix_p8_dup_progress.json'
import os, json
done = {}
if os.path.exists(PROGRESS):
    with open(PROGRESS) as f: done = json.load(f)

# Get all candidates
r = m.neon_query('''
SELECT id, "numericId", title FROM "Resource" 
WHERE title ~* 'N°?\s*[0-9].*N°?\s*[0-9]'
''')
targets = [{'id': r[0], 'nid': r[1], 'title': str(r[2])} for r in r.get('response', [{}])[0].get('data', {}).get('rows', [])]
print(f'Candidates: {len(targets)}', flush=True)

def clean(title):
    new = title
    
    # Pattern 1: "Devoir de Contrôle N°1 - Devoir N°1 - X" → "Devoir de Contrôle N°1 - X"
    new = re.sub(
        r'(Devoir\s+(?:de\s+)?(?:Contr[oô]le|Synth[eè]se|Corrrig[eé]|R[eé]vision))\s*N[°o]?\s*(\d+)\s*-\s*(?:Devoir\s+)?N[°o]?\s*\2\s*-',
        r'\1 N°\2 -',
        new, flags=re.IGNORECASE
    )
    
    # Pattern 2: "Devoir de Synthese N°2 - X pour Devoir de synthèse N°2 - Y" → "Devoir de Synthèse N°2 - X pour Y"
    new = re.sub(
        r'((?:Devoir|S[eé]rie|Cours)\s+(?:de\s+)?(?:Contr[oô]le|Synth[eè]se|Corrrig[eé]|R[eé]vision|Exercices?))\s*N[°o]?\s*(\d+)\s*-\s*(.+?)\s+(?:pour|et|sur|avec|revision|R[eé]vision)\s+\3\s*-\s*(.+)$',
        r'\1 N°\2 - \3 \4',
        new, flags=re.IGNORECASE
    )
    
    # Pattern 3: "Devoir N°1 - Subject - X" (no "de Contrôle" prefix)
    # This is fine - "Devoir N°1" is the proper type indicator
    
    # Cleanup
    new = re.sub(r' +', ' ', new).strip()
    new = re.sub(r' - +', ' - ', new)
    new = re.sub(r' {2,}', ' ', new)
    # Remove trailing dash
    new = re.sub(r'\s*-\s*$', '', new)
    return new

cleaned = 0
for i, t in enumerate(targets):
    nid_s = str(t['nid'])
    if done.get(nid_s) == 'ok':
        continue
    new = clean(t['title'])
    if new != t['title']:
        new_clean = new.replace("'", "''")
        try:
            m.neon_query(f"UPDATE \"Resource\" SET title = $${new_clean}$$ WHERE id = '{t['id']}'")
            done[nid_s] = 'ok'
            cleaned += 1
            print(f'  NID {t["nid"]}: {repr(t["title"][:80])} → {repr(new[:80])}')
        except Exception as e:
            done[nid_s] = f'fail:{e}'
    else:
        done[nid_s] = 'no_change'
    if (i+1) % 25 == 0:
        with open(PROGRESS, 'w') as f: json.dump(done, f)
        print(f'[{i+1}/{len(targets)}] {cleaned} cleaned', flush=True)

with open(PROGRESS, 'w') as f: json.dump(done, f)
print(f'\nTotal cleaned: {cleaned}')
