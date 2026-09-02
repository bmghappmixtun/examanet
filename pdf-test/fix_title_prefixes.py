#!/usr/bin/env python3
"""
Fix titles missing type/subtype prefix.

For each resource whose title doesn't start with a proper prefix
(Devoir/Série/Cours/Résumé/...), prepend the type+subtype derived from DB fields.

Also extracts homeworkNumber from title when missing in DB.
Regenerates slugs to remove "document-" defaults.

Run: 2026-07-25 - fixed 257 titles + 15 hwn + 406 slugs + 80 accents
"""
import sys
import re
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

VALID_PREFIX = re.compile(
    r'^(Devoir|Série|Cours|Résumé|Serie|Resume|Course|EXERCISE|EXAMEN|Examen|'
    r'Controle|Cntrle|Contrôle|Synth|Fiche|TD|TP|Activité|Activity|'
    r'فرض|درس|اختبار|تمارين|سلسلة|Leçon|Revision|Rev|ملخص|'
    r'Travaux|Corrigé|Correction)',
    re.IGNORECASE
)

# Get all bad-title resources
r = m.neon_query('SELECT id, "numericId", title, slug, type, "homeworkSubtype", "homeworkNumber", year, trimester FROM "Resource"')
all_rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])

# ... (rest of logic)
