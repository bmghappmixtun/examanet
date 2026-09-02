#!/usr/bin/env python3
"""Test V2: strict lexicon for Tunisian college titles."""
import os, json, re, importlib.util
from openai import OpenAI
spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY', ''))

# Same 10 samples (use saved NIDs)
sample_nids = [2873, 2141, 1577, 2747, 1102, 1552, 3586, 2075, 2870, 1660]
nid_list = ','.join(str(n) for n in sample_nids)
r = m.neon_query(f'''
SELECT r."numericId", r.title, c.slug as cls, s.slug as subj, r.language
FROM "Resource" r
LEFT JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Subject" s ON s.id = r."subjectId"
WHERE r."numericId" IN ({nid_list})
''')
samples = [{'nid': r[0], 'title': str(r[1]), 'cls': r[2], 'subj': r[3], 'lang': r[4]} 
           for r in r.get('response', [{}])[0].get('data', {}).get('rows', [])]

def translate_to_ar(t):
    prompt = f"""أنت خبير في ترجمة عناوين الموارد التعليمية التونسية للمرحلة الإعدادية.

**Lexique obligatoire** (استخدم هذه الترجمات بالضبط):
- Devoir de Synthèse → فرض تأليفي
- Devoir de Contrôle → فرض مراقبة
- Série d'exercices → سلسلة تمارين
- Cours → درس
- Résumé → ملخص
- N°X → عدد X
- Mr → الأستاذ
- Mme → الأستاذة

**Matières**:
- Mathématiques → الرياضيات
- Physique → الفيزياء
- SVT → علوم الحياة والأرض
- Arabe → العربية
- Français → الفرنسية
- Anglais → الإنجليزية
- Histoire → التاريخ
- Géographie → الجغرافيا
- Technologie → التكنولوجيا
- Informatique → الإعلامية
- Musique → الموسيقى
- Théâtre → المسرح
- Arts → الفنون
- Éducation Islamique → التربية الإسلامية
- Éducation Civique → التربية المدنية

**Classes**:
- 7ème → السابعة أساسي
- 8ème → الثامنة أساسي  
- 9ème → التاسعة أساسي

**Format** (respecter l'ordre):
[Type] - [Matière] - [Classe] - ([Année]) [Optionnel: الأستاذ/ة Nom]

**Règles**:
- 100% arabe (pas un seul mot français ou anglais)
- Garder les chiffres, les noms propres, les unités
- Si l'année manque, l'omettre
- Si le prof manque, l'omettre
- Si titre original a déjà arabe, garder les éléments arabes

**Titre actuel**:
{t['title']}

**Classe**: {t['cls']}
**Matière**: {t['subj']}

**Nouveau titre (100% arabe)**:"""

    try:
        resp = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[{'role': 'user', 'content': prompt}],
            max_tokens=200,
            temperature=0.1,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        return f'ERROR: {e}'

print('=' * 100)
print('TEST V2: 10 fichiers avant/après (lexique strict)')
print('=' * 100)

results = []
for t in samples:
    new = translate_to_ar(t)
    results.append({'nid': t['nid'], 'old': t['title'], 'new': new, 'cls': t['cls'], 'subj': t['subj']})
    print(f'\nNID {t["nid"]} ({t["cls"]}/{t["subj"]}):')
    print(f'  AVANT: {t["title"]}')
    print(f'  APRÈS: {new}')

print('\n' + '=' * 100)
