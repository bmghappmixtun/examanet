#!/usr/bin/env python3
"""P8c: More pattern variations."""
import importlib.util, re, json
spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

PROGRESS = '/workspace/edutunisie/pdf-test/fix_p8_dup_progress.json'
done = {}
import os
if os.path.exists(PROGRESS):
    with open(PROGRESS) as f: done = json.load(f)

r = m.neon_query('''
SELECT id, "numericId", title FROM "Resource" 
WHERE title ~* 'N°?\s*[0-9].*N°?\s*[0-9]'
''')
targets = [{'id': r[0], 'nid': r[1], 'title': str(r[2])} for r in r.get('response', [{}])[0].get('data', {}).get('rows', [])]
print(f'Candidates: {len(targets)}', flush=True)

def clean(title):
    new = title
    
    # Pattern: "Série d'exercices N°1 - Série N°1 - X" → "Série d'exercices N°1 - X"
    new = re.sub(
        r"(S[eé]rie\s+d['\u2019]exercices\s+N[°o]?\s*(\d+))\s*-\s*S[eé]rie\s+N[°o]?\s*\2\s*-",
        r'\1 -',
        new, flags=re.IGNORECASE
    )
    
    # Pattern: "Devoir de Contrôle N°1 - Sciences physiques devoir de contrôle N°1 - X" 
    # or "Devoir de Contrôle N°1 - Sciences physiques Devoir de Contrôle N°1 - X"
    new = re.sub(
        r'-\s*(?:[A-Z][a-zéèê]+(?:\s+[a-z]+)?\s+)?(devoir\s+(?:de\s+)?(?:contr[oô]le|synth[eè]se))\s*N[°o]?\s*(\d+)\s*-',
        r'-',
        new, flags=re.IGNORECASE
    )
    
    # Pattern: "Devoir de Contrôle N°1 - dev de contrôle N 1 - X" (with space)
    new = re.sub(
        r'-\s*(?:[A-Z][a-zéèê]+(?:\s+[a-z]+)?\s+)?dev\s+de\s+(?:contr[oô]le|synth[eè]se)\s+N?\s*(\d+)\s*-',
        r'-',
        new, flags=re.IGNORECASE
    )
    
    # Pattern: "Devoir Corrigé de Synthèse N°2 - Bases de données DSN°2 - X" - keep "DSN°2" (different)
    # Don't strip these - they're abbreviations
    
    # Cleanup
    new = re.sub(r' +', ' ', new).strip()
    new = re.sub(r' - +', ' - ', new)
    new = re.sub(r' {2,}', ' ', new)
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

with open(PROGRESS, 'w') as f: json.dump(done, f)
print(f'\nTotal cleaned: {cleaned}')
