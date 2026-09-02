#!/usr/bin/env python3
"""P8: Fix remaining minor issues.
- 1 sans année
- 4 avec \xa0
- 3 SYNTHESE sans accent
- 9 controle sans accent
- 85 avec 2x même label
"""
import importlib.util, re
spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

# 1. \xa0 replacement
print('--- Fix \\xa0 ---')
r = m.neon_query("SELECT id, \"numericId\", title FROM \"Resource\" WHERE title LIKE E'%\xc2\xa0%'")
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    nid, title = row[0], str(row[2])
    new = title.replace('\xa0', ' ').strip()
    new = re.sub(r' +', ' ', new)
    if new != title:
        new_clean = new.replace("'", "''")
        m.neon_query(f"UPDATE \"Resource\" SET title = $${new_clean}$$ WHERE id = '{nid}'")
        print(f'  NID {row[1]}: {repr(title[:50])} → {repr(new[:50])}')

# 2. SYNTHESE → Synthèse
print('\n--- Fix SYNTHESE ---')
r = m.neon_query("SELECT id, \"numericId\", title FROM \"Resource\" WHERE title LIKE '%SYNTHESE%'")
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    nid, title = row[0], str(row[2])
    new = title.replace('SYNTHESE', 'Synthèse')
    new_clean = new.replace("'", "''")
    m.neon_query(f"UPDATE \"Resource\" SET title = $${new_clean}$$ WHERE id = '{nid}'")
    print(f'  NID {row[1]}: {repr(title[:60])} → {repr(new[:60])}')

# 3. controle (lowercase) → Contrôle (capitalize with accent)
print('\n--- Fix controle lowercase ---')
r = m.neon_query("SELECT id, \"numericId\", title FROM \"Resource\" WHERE title LIKE '%controle%'")
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    nid, title = row[0], str(row[2])
    new = title.replace('controle', 'Contrôle')
    new_clean = new.replace("'", "''")
    m.neon_query(f"UPDATE \"Resource\" SET title = $${new_clean}$$ WHERE id = '{nid}'")
    print(f'  NID {row[1]}: {repr(title[:60])} → {repr(new[:60])}')

# 4. Duplicate labels N2 N2 / N3 N3
print('\n--- Fix duplicate labels (N2 N2) ---')
# Pattern: "N°X - ... - N°X" or "N°X ... N°X"  
r = m.neon_query("""
SELECT id, "numericId", title FROM "Resource" 
WHERE title ~* 'N°?[[:space:]]?[0-9].*N°?[[:space:]]?[0-9]'
""")
import re as rmod
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    nid, title = row[0], str(row[2])
    # Find pattern like "N°X ... N°X" or "N X ... N X" (same number)
    # Match: N°X or N X (X=digits) appearing twice
    matches = rmod.findall(r'(N°?\s*)(\d+)', title)
    if not matches: continue
    counts = {}
    for prefix, num in matches:
        counts[num] = counts.get(num, 0) + 1
    if any(c >= 2 for c in counts.values()):
        # Try to remove the duplicate
        new = title
        seen = set()
        for prefix, num in matches:
            key = (prefix.strip(), num)
            if num in seen and (prefix + num) in new:
                # Remove first occurrence (not the last one in the title)
                idx = new.find(prefix + num)
                # Check if it's at the END (last part of title) - keep it
                if idx > len(new) * 0.6:  # if in second half, this is the legit one
                    # Remove first occurrence
                    new = new[:idx] + new[idx+len(prefix+num):]
                    seen.add(num)
                    break  # Only do one at a time
        if new != title:
            new_clean = new.replace("'", "''").strip()
            new_clean = rmod.sub(r' +', ' ', new_clean)
            try:
                m.neon_query(f"UPDATE \"Resource\" SET title = $${new_clean}$$ WHERE id = '{nid}'")
                print(f'  NID {row[1]}:')
                print(f'    OLD: {repr(title[:80])}')
                print(f'    NEW: {repr(new[:80])}')
            except Exception as e:
                print(f'    FAIL: {e}')

# 5. NID 3651 (no year)
print('\n--- Fix NID 3651 (no year) ---')
r = m.neon_query("SELECT id, year FROM \"Resource\" WHERE \"numericId\" = 3651")
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    print(f'  Year in DB: {repr(row[1])}')
    # If year is empty, the title was already updated to "Résumé - Arabe - تفاعل الثقافات والحضارات - 9ème année de base"
    # No need to add year
    print(f'  Title was already fixed in P7b')

print('\nDone')
