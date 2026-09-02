#!/usr/bin/env python3
"""Test V4: force Arabic numerals + transliterate names."""
import os, json, re, importlib.util
from openai import OpenAI
spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY', ''))

r = m.neon_query('''
SELECT r."numericId", r.title, c.slug as cls, s.slug as subj
FROM "Resource" r
LEFT JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Subject" s ON s.id = r."subjectId"
WHERE c.slug IN ('7eme', '8eme', '9eme')
  AND r.language = 'ar'
  AND r.title ~ '[A-Za-z]'
ORDER BY RANDOM()
LIMIT 10
''')
samples = [{'nid': r[0], 'title': str(r[1]), 'cls': r[2], 'subj': r[3]} 
           for r in r.get('response', [{}])[0].get('data', {}).get('rows', [])]

# Class mapping
CLS_AR = {'7eme': 'السابعة أساسي', '8eme': 'الثامنة أساسي', '9eme': 'التاسعة أساسي'}

def translate_to_ar(t):
    cls_ar = CLS_AR[t['cls']]
    
    prompt = f"""ترجم عنوان هذا المورد التعليمي التونسي إلى العربية. النتيجة يجب أن تكون 100% عربية بدون أي كلمة أجنبية.

**Lexique strict**:
- Devoir de Synthèse / Devoir Synthèse → فرض تأليفي
- Devoir de Contrôle / Devoir Contrôle → فرض مراقبة
- Devoir Corrigé de ... → فرض ... مصحح
- Série d'exercices → سلسلة تمارين
- Cours → درس
- Résumé → ملخص
- N°X / N° X → عدد X
- Mr → الأستاذ
- Mme → الأستاذة
- 7ème / 7eme → {CLS_AR['7eme']}
- 8ème / 8eme → {CLS_AR['8eme']}
- 9ème / 9eme → {CLS_AR['9eme']}
- Collège pilote → المعهد النموذجي
- Math / Mathématiques → الرياضيات
- Physique → الفيزياء
- SVT → علوم الحياة والأرض
- Technologie → التكنولوجيا
- Arabe → العربية
- Éducation Islamique → التربية الإسلامية
- Éducation Civique → التربية المدنية

**Format** (séparateur: ' - '):
[Type] - [Matière] - [Classe] - ([Année]) [الأستاذ/ة Nom]

**Règles strictes**:
1. "7ème" / "8ème" / "9ème" → {CLS_AR[t['cls']]} (JAMAIS garder en chiffres français)
2. "Mr X" / "Mme X" → الأستاذ/ة X (translittérer le nom en lettres arabes si besoin)
3. Année (XXXX-XXXX) → garder telle quelle
4. Si pas d'année, NE RIEN mettre
5. 100% arabe, ZÉRO caractère latin (sauf les chiffres)

**Titre original**:
{t['title']}

**Nouveau titre (100% arabe)**:"""

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
print('TEST V4: 10 nouveaux fichiers (V4 strict)')
print('=' * 100)

results = []
for t in samples:
    new = translate_to_ar(t)
    results.append({'nid': t['nid'], 'old': t['title'], 'new': new, 'cls': t['cls'], 'subj': t['subj']})
    
    # Quality checks
    has_fr = bool(re.search(r'[a-zA-Zà-ÿÀ-ÿ]', new))
    has_year = bool(re.search(r'\d{4}-\d{4}', t['title']))
    new_has_year = bool(re.search(r'\d{4}-\d{4}', new))
    has_teacher = bool(re.search(r'(Mr|Mme)\s+[A-Za-z]', t['title']))
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
