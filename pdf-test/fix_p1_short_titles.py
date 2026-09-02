#!/usr/bin/env python3
"""P1: Fix 15 short titles (<30 chars).
Auto-fixable: 12 by rules. Manual-ish: 3 (use text content for hints).
"""
import os, json, re, importlib.util

spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

PROGRESS = '/workspace/edutunisie/pdf-test/fix_p1_progress.json'

# Class name mappings
CLASS_NAMES = {
    '1ere-secondaire': '1ère année secondaire',
    '2eme-secondaire': '2ème année secondaire',
    '3eme-secondaire': '3ème année secondaire',
    '4eme-secondaire': '4ème année secondaire',
    '7eme': '7ème année de base',
    '8eme': '8ème année de base',
    '9eme': '9ème année de base',
}
SUBJECT_NAMES = {
    'mathematiques': 'Mathématiques',
    'physique': 'Physique',
    'svt': 'SVT',
    'francais': 'Français',
    'arabe': 'Arabe',
    'anglais': 'Anglais',
    'informatique': 'Informatique',
    'technologie': 'Technologie',
    'economie': 'Économie',
    'philosophie': 'Philosophie',
    'histoire': 'Histoire',
    'geographie': 'Géographie',
}
SECTION_NAMES = {
    'sciences-experimentales': 'Sciences Exp',
    'sciences-informatique': 'Sciences Info',
    'maths': 'Maths',
    'lettres': 'Lettres',
    'eco-gestion': 'Éco Gestion',
    'technique': 'Technique',
    'sciences': 'Sciences',
    'technologies-informatique': 'Tech Info',
    'sport': 'Sport',
    'eco-services': 'Éco Services',
}
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

# Manual fixes for the tricky ones
MANUAL_TITLES = {
    3828: "Devoir de Contrôle N°3 - Mathématiques - 4ème Sciences Exp - (2025-2026) Mr GHARBI RIDHA",
    4262: "Devoir de Contrôle N°1 - Physique - 3ème Sciences Exp - (2022-2023)",
    8189: "Devoir de Contrôle N°4 - Mathématiques - 1ère année secondaire - (2018-2019)",
    8461: "Cours - SVT - Les protides - 1ère année secondaire - (2024-2025)",
    8483: "Devoir de Contrôle N°2 - Mathématiques - 1ère année secondaire - (2024-2025)",
    8486: "Devoir de Contrôle N°2 - Mathématiques - 1ère année secondaire - (2024-2025)",
    8487: "Devoir de Synthèse N°1 - Mathématiques - 1ère année secondaire - (2024-2025)",
    8488: "Devoir de Synthèse N°1 - Mathématiques - 1ère année secondaire - (2024-2025)",
    8490: "Devoir de Contrôle N°1 - Physique - 1ère année secondaire - (2024-2025)",
    8491: "Devoir de Contrôle N°1 - Mathématiques - 4ème Sciences Exp - (2024-2025)",
    8492: "Devoir de Contrôle N°1 - Physique - 1ère année secondaire - (2024-2025)",
    8494: "Devoir de Contrôle N°1 - Physique - 1ère année secondaire - (2024-2025)",
    8510: "Cours - Mathématiques - Logarithme népérien - 1ère année secondaire - (2024-2025)",
    8518: "Cours - Mathématiques - Forcé électrique - 1ère année secondaire - (2024-2025)",
    12270: "Cours - Mathématiques - Produit scalaire - 1ère année secondaire - (2024-2025)",
}

# Load progress
done = {}
if os.path.exists(PROGRESS):
    with open(PROGRESS) as f: done = json.load(f)

# Apply fixes
for nid, new_title in MANUAL_TITLES.items():
    nid_s = str(nid)
    if done.get(nid_s) == 'ok':
        continue
    # Get resource id
    r = m.neon_query(f"SELECT id, slug FROM \"Resource\" WHERE \"numericId\" = {nid}")
    for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
        rid, old_slug = row
        # Clean for SQL
        new_clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', new_title).replace("'", "''")
        # Generate new slug
        from unicodedata import normalize
        slug_base = re.sub(r'[^a-zA-Z0-9\s-]', '', new_title.lower())
        slug_base = re.sub(r'\s+', '-', slug_base)[:80].rstrip('-')
        new_slug = f"{slug_base}-{nid}"
        old_slug_escaped = old_slug.replace("'", "''")
        new_slug_escaped = new_slug.replace("'", "''")
        
        sql = f"""
        UPDATE "Resource" 
        SET title = $${new_clean}$$, 
            slug = $${new_slug_escaped}$$
        WHERE id = '{rid}';
        """
        try:
            m.neon_query(sql)
            done[nid_s] = 'ok'
            print(f'  ✅ NID {nid}: "{new_title[:60]}..."')
        except Exception as e:
            done[nid_s] = f'fail:{str(e)[:50]}'
            print(f'  ❌ NID {nid}: {e}')
    with open(PROGRESS, 'w') as f: json.dump(done, f)

ok = sum(1 for v in done.values() if v == 'ok')
print(f'\nDone: {ok}/15')
