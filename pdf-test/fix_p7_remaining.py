#!/usr/bin/env python3
"""P7b: Fix 15 remaining bad titles manually.
"""
import importlib.util
spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

# Manual fixes
fixes = {
    '3835': 'Devoir de Synthèse N°1 - Technologie - 2ème année secondaire - (2022-2023)',
    '8117': 'Devoir de Contrôle N°1 - SVT - 3ème année - (2024-2025) Mr Amin',
    '8938': 'Devoir de Contrôle N°1 - Mathématiques - 3ème année Sciences - (2024-2025)',
    '3950': 'Devoir de Contrôle N°6 - Mathématiques - 1ère année secondaire - (2024-2025)',
    '8481': "Cours - Physique - Oscillation électrique forcée - 1ère année secondaire - (2024-2025)",
    '3651': "Résumé - Arabe - تفاعل الثقافات والحضارات - 9ème année de base",
    '3610': "Devoir de Synthèse - Arabe - دراسة النص - 8ème année de base",
    '3582': "Devoir de Synthèse - Arabe - دراسة النص - 8ème année de base",
    '3581': "Devoir de Synthèse - Arabe - دراسة النص - 8ème année de base",
    '3609': "Devoir de Synthèse - Arabe - دراسة النص - 8ème année de base",
    '3611': "Devoir de Synthèse - Arabe - دراسة النص - 8ème année de base",
    '1723': "Devoir de Synthèse N°2 - Physique - 7ème année de base - (2022-2023) Mme Maryem Bnayes",
    '8622': "Devoir de Synthèse N°2 - Technologie de l'informatique - Février - 1ère année secondaire - (2024-2025)",
    '8116': "Devoir de Synthèse N°2 - Technologie de l'informatique - Février - 1ère année secondaire - (2024-2025)",
    '4495': "Devoir de Synthèse N°2 - Économie - 4ème année secondaire - (2019-2020) Mr Zriba",
}

ok = 0
fail = 0
for nid, new_title in fixes.items():
    new_clean = new_title.replace("'", "''")
    sql = f"UPDATE \"Resource\" SET title = $${new_clean}$$ WHERE \"numericId\" = {nid}"
    try:
        m.neon_query(sql)
        print(f'  NID {nid}: OK')
        ok += 1
    except Exception as e:
        print(f'  NID {nid}: FAIL - {str(e)[:50]}')
        fail += 1

print(f'\nDone: {ok} OK, {fail} fail')
