#!/usr/bin/env python3
"""Test: use GPT-4o-mini to translate 10 college AR titles from FR to AR."""
import os, json, re, importlib.util
from openai import OpenAI
spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY', ''))

# Get 10 diverse samples
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

# Translation function via GPT
def translate_to_ar(t):
    prompt = f"""أنت خبير في ترجمة عناوين الموارد التعليمية التونسية للمرحلة الإعدادية (7-9 أساسي) إلى العربية.

هذا المستند محتواه بالعربية (`language=ar`) لكن عنوانه الحالي بالفرنسية.
أعد صياغة العنوان بالكامل بالعربية فقط، مع الحفاظ على:
- رقم الترتيب (N°X → عدد X)
- السنة الدراسية (2014-2015 تبقى كما هي)
- اسم الأستاذ (Mr → الأستاذ, Mme → الأستاذة)
- أي معلومات مهمة (مثل Collège pilote, Chapitre X)

**مهم**:
- إذا كان العنوان الأصلي يحتوي على كلمات عربية بالفعل، احتفظ بها
- إذا كان العنوان طويلاً جداً، اختصر إلى 5-7 أجزاء كحد أقصى
- لا تضف معلومات غير موجودة في العنوان الأصلي
- لا تستخدم HTML أو Markdown، فقط نص عادي

**Class**: {t['cls']} ({ 'السابعة' if t['cls']=='7eme' else 'الثامنة' if t['cls']=='8eme' else 'التاسعة' } أساسي)
**Subject slug**: {t['subj']}

**العنوان الحالي**:
{t['title']}

**العنوان الجديد بالعربية فقط**:"""

    try:
        resp = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[{'role': 'user', 'content': prompt}],
            max_tokens=200,
            temperature=0.2,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        return f'ERROR: {e}'

# Test
print('=' * 100)
print('TEST: 10 fichiers avant/après (via GPT-4o-mini)')
print('=' * 100)

results = []
for t in samples:
    new = translate_to_ar(t)
    results.append({'nid': t['nid'], 'old': t['title'], 'new': new, 'cls': t['cls'], 'subj': t['subj']})
    print(f'\nNID {t["nid"]} ({t["cls"]}/{t["subj"]}):')
    print(f'  AVANT: {t["title"]}')
    print(f'  APRÈS: {new}')

print('\n' + '=' * 100)
print(f'Coût estimé pour 2699: ~${(2699/10) * 0.001:.2f}')

# Save test results
with open('pdf-test/translate_10_test.json', 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
