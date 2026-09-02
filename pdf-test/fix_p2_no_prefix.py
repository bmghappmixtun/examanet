#!/usr/bin/env python3
"""P2: Add type prefix to 211 titles without proper prefix.
Strategy: If type=DEVOIR and subtype=CONTROLE → prefix "Devoir de Contrôle N°X"
Use existing type/subtype + hwn to construct proper title.
"""
import os, json, re, importlib.util

spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

PROGRESS = '/workspace/edutunisie/pdf-test/fix_p2_progress.json'

TYPE_PREFIX = {
    'DEVOIR': {
        'CONTROLE': 'Devoir de Contrôle',
        'SYNTHESE': 'Devoir de Synthèse',
        'MAISON': 'Devoir de Maison',
        'REVISION': 'Devoir de Révision',
    },
    'EXERCISE': "Série d'exercices",
    'COURSE': 'Cours',
    'SUMMARY': 'Résumé',
    'BAC_SUBJECT': 'Sujet BAC',
}

def build_prefix(typ, subtyp, hwn):
    """Get type prefix and optional N°X."""
    tp = TYPE_PREFIX.get(typ, {})
    if isinstance(tp, dict):
        base = tp.get(subtyp) or tp.get('CONTROLE') or 'Document'
    else:
        base = tp or 'Document'
    if hwn and typ in ('DEVOIR', 'EXERCISE') and subtyp:
        return f"{base} N°{hwn} - "
    return f"{base} - "

def has_proper_prefix(title):
    """Check if title has any of the known type prefixes."""
    title_lower = title.lower()
    for typ_dict in TYPE_PREFIX.values():
        if isinstance(typ_dict, dict):
            for prefix in typ_dict.values():
                if prefix.lower() in title_lower:
                    return True
        elif isinstance(typ_dict, str):
            if typ_dict.lower() in title_lower:
                return True
    return False

def add_prefix_if_missing(title, typ, subtyp, hwn):
    """Add type prefix if missing."""
    if has_proper_prefix(title):
        return title
    prefix = build_prefix(typ, subtyp, hwn)
    return f"{prefix}{title}"

# Load progress
done = {}
if os.path.exists(PROGRESS):
    with open(PROGRESS) as f: done = json.load(f)

# Get all 211 without proper prefix
print('Loading targets...', flush=True)
r = m.neon_query('''
SELECT r.id, r."numericId", r.title, r.type, r."homeworkSubtype", r."homeworkNumber"
FROM "Resource" r
WHERE r.title !~* 'Devoir de|Série d|Cours|Résumé|Bac|Contrôle|Synthèse|Maison|Révision|Concours| Examen'
  AND r.title !~ '^\\s*$'
''')
targets = [{'id': r[0], 'nid': r[1], 'title': r[2], 'type': r[3], 'subtype': r[4], 'hwn': r[5]} for r in r.get('response', [{}])[0].get('data', {}).get('rows', [])]
print(f'Total: {len(targets)}', flush=True)

# Show first 20 examples
print('\nFirst 20 examples (before fix):')
for t in targets[:20]:
    new = add_prefix_if_missing(t['title'], t['type'], t['subtype'], t['hwn'])
    print(f'  NID {t["nid"]}: "{t["title"][:50]}" → "{new[:70]}"')

# Apply
ok = 0
fail = 0
for i, t in enumerate(targets):
    nid_s = str(t['nid'])
    if done.get(nid_s) == 'ok':
        continue
    new_title = add_prefix_if_missing(t['title'], t['type'], t['subtype'], t['hwn'])
    if new_title == t['title']:
        done[nid_s] = 'no_change'
        continue
    new_clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', new_title).replace("'", "''")
    sql = f"UPDATE \"Resource\" SET title = $${new_clean}$$ WHERE id = '{t['id']}'"
    try:
        m.neon_query(sql)
        done[nid_s] = 'ok'
        ok += 1
    except Exception as e:
        done[nid_s] = f'fail:{str(e)[:50]}'
        fail += 1
    
    if (i+1) % 25 == 0:
        print(f'[{i+1}/{len(targets)}] OK:{ok} FAIL:{fail}', flush=True)
        with open(PROGRESS, 'w') as f: json.dump(done, f)

with open(PROGRESS, 'w') as f: json.dump(done, f)
print(f'\nDone: {ok} OK, {fail} fail, {sum(1 for v in done.values() if v == "no_change")} no_change')
