#!/usr/bin/env python3
"""P8d: Clean fix - keep subject, only remove duplicate phrase."""
import importlib.util, re, json
spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

nids_data = {
    12771: 'Devoir de Contrôle N°1 - Sciences physiques - 1ère année secondaire - (2025-2026) Mr ZOUARI SAMI',
    12768: 'Devoir de Contrôle N°1 - Sciences physiques - 1ère année secondaire - (2025-2026) Mr ZOUARI SAMI',
    12652: 'Devoir de Contrôle N°1 - Sciences physiques - 1ère année secondaire - (2025-2026) Mr ZOUARI SAMI',
    12647: 'Devoir de Contrôle N°1 - Sciences physiques - 1ère année secondaire - (2025-2026) Mr ZOUARI SAMI',
    12643: 'Devoir de Contrôle N°1 - Sciences physiques - 1ère année secondaire - (2024-2025)',
    12764: 'Devoir de Contrôle N°1 - Sciences physiques - 1ère année secondaire - (2024-2025)',
    13102: 'Devoir de Contrôle N°3 (Voir Correction) - Sciences physiques - 1ère année secondaire - (2024-2025)',
    13166: 'Devoir de Contrôle N°3 (Voir Correction) - Sciences physiques - 1ère année secondaire - (2024-2025)',
    13229: 'Devoir de Contrôle N°1 - Sciences physiques - 2ème année Sciences - (2011-2012)',
    13274: 'Devoir de Contrôle N°1 - Sciences physiques - 2ème année Sciences - (2011-2012)',
    13374: 'Devoir de Contrôle N°1 - Sciences physiques - 2ème année Sciences - (2024-2025)',
    13392: 'Devoir de Contrôle N°1 - Sciences physiques - 2ème année Sciences - (2024-2025)',
    14241: 'Devoir de Contrôle N°1 - Lycée pilote - Sciences physiques - 3ème Sciences exp - (2024-2025) Mme Hfaiedh',
    14242: 'Devoir de Contrôle N°1 - Lycée pilote - Sciences physiques - 3ème Sciences exp - (2024-2025) Mme Hfaiedh',
    14473: 'Devoir de Contrôle N°2 - SVT - Bac Sport - (2025-2026)',
    710:   'Devoir de Synthèse N°2 - Math - 9ème année de base - (Collège pilote Les berges du lac) - (2020-2021)',
}

ok = 0
for nid, new_title in nids_data.items():
    new_clean = new_title.replace("'", "''")
    m.neon_query(f"UPDATE \"Resource\" SET title = $${new_clean}$$ WHERE \"numericId\" = {nid}")
    print(f'  NID {nid}: {new_title[:80]}')
    ok += 1
print(f'\nFixed {ok} titles')
