#!/usr/bin/env python3
"""Revert the v2 changes that stripped subjects."""
import importlib.util, json
spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

# Originals → re-apply
revert_map = {
    '12771': 'Devoir de Contrôle N°1 - Sciences physiques devoir de contrôle N°1 - 1ère AS (2025-2026) Mr ZOUARI SAMI',
    '14241': 'Devoir de Contrôle N°1 Lycée pilote - Sciences physiques Devoir de contrôle n°1 - 3ème Sciences exp (2024-2025) Mme Hfaiedh',
    '14473': 'Devoir de Contrôle N°2 - SVT devoir de contrôle n 2 - Bac Sport (2025-2026)',
    '12768': 'Devoir de Contrôle N°1 - Sciences physiques devoir de contrôle N°1 - 1ère AS (2025-2026) Mr ZOUARI SAMI',
    '13274': 'Devoir de Contrôle N°1 - Sciences physiques devoir de contrôle n° 1 - 2ème Sciences (2011-2012)',
    '12643': 'Devoir de Contrôle N°1 - Sciences physiques dev de contrôle N 1 - 1ère AS (2024-2025)',
    '12652': 'Devoir de Contrôle N°1 - Sciences physiques devoir de contrôle N°1 - 1ère AS (2025-2026) Mr ZOUARI SAMI',
    '710':   'Devoir de Synthese N°2 - Révision pour Devoir de synthèse N°2 - Math - 9ème (Collège pilote Les berges du lac) (2020-2021)',
    '12647': 'Devoir de Contrôle N°1 - Sciences physiques devoir de contrôle N°1 - 1ère AS (2025-2026) Mr ZOUARI SAMI',
    '12764': 'Devoir de Contrôle N°1 - Sciences physiques dev de contrôle N 1 - 1ère AS (2024-2025)',
    '13102': 'Devoir de Contrôle N°3 (Voir Correction) - Sciences physiques devoir de contrôle N°3 - 1ère AS (2024-2025)',
    '13166': 'Devoir de Contrôle N°3 (Voir Correction) - Sciences physiques devoir de contrôle N°3 - 1ère AS (2024-2025)',
    '13229': 'Devoir de Contrôle N°1 - Sciences physiques devoir de contrôle n° 1 - 2ème Sciences (2011-2012)',
    '13374': 'Devoir de Contrôle N°1 - Sciences physiques Devoir de Contrôle N°1 - 2ème Sciences (2024-2025)',
    '13392': 'Devoir de Contrôle N°1 - Sciences physiques Devoir de Contrôle N°1 - 2ème Sciences (2024-2025)',
    '14242': 'Devoir de Contrôle N°1 Lycée pilote - Sciences physiques Devoir de contrôle n°1 - 3ème Sciences exp (2024-2025) Mme Hfaiedh',
}

print(f'Reverting {len(revert_map)} titles...')
ok = 0
for nid, orig in revert_map.items():
    # Get current title to see what it was
    r = m.neon_query(f'SELECT title FROM "Resource" WHERE "numericId" = {nid}')
    rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
    if not rows:
        print(f'  NID {nid}: NOT FOUND')
        continue
    current = str(rows[0][0])
    
    # Build a smart reverted version:
    # - If we lost the subject, restore it
    # - If we just have "Devoir de Contrôle N°X - 1ère AS (year)" → restore subject
    new = orig
    new_clean = new.replace("'", "''")
    m.neon_query(f"UPDATE \"Resource\" SET title = $${new_clean}$$ WHERE \"numericId\" = {nid}")
    print(f'  NID {nid}:')
    print(f'    BAD : {current[:80]}')
    print(f'    GOOD: {new[:80]}')
    ok += 1

print(f'\nReverted {ok} titles')
