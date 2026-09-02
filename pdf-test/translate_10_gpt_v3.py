#!/usr/bin/env python3
"""Test V3: strict lexicon + mandatory year/teacher."""
import os, json, re, importlib.util
from openai import OpenAI
spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY', ''))

# Different 10 samples (to test edge cases)
r = m.neon_query('''
SELECT r."numericId", r.title, c.slug as cls, s.slug as subj, r.language
FROM "Resource" r
LEFT JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Subject" s ON s.id = r."subjectId"
WHERE c.slug IN ('7eme', '8eme', '9eme')
  AND r.language = 'ar'
  AND r.title ~ '[A-Za-z]'
ORDER BY RANDOM()
LIMIT 10
''')
samples = [{'nid': r[0], 'title': str(r[1]), 'cls': r[2], 'subj': r[3], 'lang': r[4]} 
           for r in r.get('response', [{}])[0].get('data', {}).get('rows', [])]

def translate_to_ar(t):
    prompt = f"""أنت خبير في ترجمة عناوين الموارد التعليمية التونسية للمرحلة الإعدادية.

**Lexique** (OBLIGATOIRE):
- Devoir de Synthèse → فرض تأليفي
- Devoir de Contrôle → فرض مراقبة
- Série d'exercices → سلسلة تمارين
- Cours → درس
- Résumé → ملخص
- N°X → عدد X
- Mr → الأستاذ
- Mme → الأستاذة
- Collège pilote → المعهد النموذجي

**Format strict** (respecter l'ordre EXACT):
[Type] - [Matière] - [Classe] - ([Année]) [الأستاذ/ة Nom]

**Règles strictes**:
1. TOUJOURS garder l'année (XXXX-XXXX) si présente dans l'original
2. TOUJOURS garder le nom du prof (Mr/Mme X) si présent
3. 100% arabe, JAMAIS de français ou anglais
4. Si original a déjà arabe, garder
5. Pas de "Mr" ni "Mme" en anglais dans le résultat

**Titre actuel**:
{t['title']}

**Nouveau titre (100% arabe, garder année et prof)**:"""

    try:
        resp = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[{'role': 'user', 'content': prompt}],
            max_tokens=200,
            temperature=0,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        return f'ERROR: {e}'

print('=' * 100)
print('TEST V3: 10 nouveaux fichiers (lexique strict + année/prof obligatoires)')
print('=' * 100)

results = []
for t in samples:
    new = translate_to_ar(t)
    results.append({'nid': t['nid'], 'old': t['title'], 'new': new, 'cls': t['cls'], 'subj': t['subj']})
    
    # Check quality
    has_fr = bool(re.search(r'[a-zA-Z]', new))
    has_year = bool(re.search(r'\d{4}-\d{4}', t['title']))
    new_has_year = bool(re.search(r'\d{4}-\d{4}', new))
    has_teacher = bool(re.search(r'(Mr|Mme)\s+[A-Z]', t['title']))
    new_has_teacher = 'الأستاذ' in new or 'الأستاذة' in new
    
    flags = []
    if has_fr: flags.append('❌FR')
    if has_year and not new_has_year: flags.append('❌YEAR')
    if has_teacher and not new_has_teacher: flags.append('❌TEACHER')
    
    status = ' '.join(flags) if flags else '✅'
    
    print(f'\nNID {t["nid"]} ({t["cls"]}/{t["subj"]}) {status}:')
    print(f'  AVANT: {t["title"]}')
    print(f'  APRÈS: {new}')

print('\n' + '=' * 100)
