#!/usr/bin/env python3
"""Regenerate 10 AR files that have FR summaries in ResourceSummary."""
import os, json, re, importlib.util
from openai import OpenAI

spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY', ''))

# Get 10 AR files
r = m.neon_query('''
SELECT r.id, r."numericId", r.title, c.slug, s.slug, LEFT(rc."fullText", 4000) as text
FROM "Resource" r
JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Subject" s ON s.id = r."subjectId"
LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
JOIN "ResourceSummary" rs ON rs."resourceId" = r.id
WHERE c.slug IN ('7eme', '8eme', '9eme')
AND r.language = 'ar'
AND rs.summary !~ '[\\u0600-\\u06FF]'
''')
targets = [{'id': r[0], 'nid': r[1], 'title': str(r[2]), 'cls': str(r[3]),
            'subj': str(r[4]), 'text': str(r[5] or '')} 
           for r in r.get('response', [{}])[0].get('data', {}).get('rows', [])]
print(f'Targets: {len(targets)}')

SUBJECT_AR = {
    'mathematiques': 'الرياضيات', 'physique': 'الفيزياء', 'svt': 'علوم الحياة والأرض',
    'arabe': 'العربية', 'francais': 'الفرنسية', 'anglais': 'الإنجليزية',
    'histoire': 'التاريخ', 'geographie': 'الجغرافيا', 'philosophie': 'الفلسفة',
    'informatique': 'الإعلامية', 'technologie': 'التكنولوجيا', 'musique': 'الموسيقى',
    'theatre': 'المسرح', 'arts': 'الفنون', 'education-islamique': 'التربية الإسلامية',
    'education-civique': 'التربية المدنية', 'sport': 'الرياضة',
    'histoire-geographie': 'التاريخ والجغرافيا',
}
CLASS_AR = {'7eme': 'السنة السابعة أساسي', '8eme': 'السنة الثامنة أساسي', '9eme': 'السنة التاسعة أساسي'}

for t in targets:
    text = t['text'] or t['title']
    
    prompt = f"""أنت خبير في تلخيص المحتوى التعليمي التونسي للمرحلة الإعدادية.
من النص التالي (بالعربية)، أنشئ ملخصاً ذكياً منظمًا بـ HTML.

**المادة**: {SUBJECT_AR.get(t['subj'], t['subj'])}
**المستوى**: {CLASS_AR.get(t['cls'], t['cls'])}
**العنوان**: {t['title']}

**النص** (أول 3500 حرف):
{text[:3500]}

**الملخص** (HTML منظم بـ <strong> و <ul><li>):
```html
<strong>المادة :</strong> {SUBJECT_AR.get(t['subj'], t['subj'])}<br>
<strong>المستوى :</strong> {CLASS_AR.get(t['cls'], t['cls'])}<br>
<strong>النوع :</strong> [نوع المستند]<br>
<strong>السنة الدراسية :</strong> [السنة]<br>
<strong>ملخص :</strong> [2-4 جملة وصف]<br>
<strong>المفاهيم/المهارات المكتسبة :</strong> <ul><li>المفهوم 1</li><li>المفهوم 2</li></ul>
```"""
    
    try:
        resp = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[{'role': 'user', 'content': prompt}],
            max_tokens=500,
            temperature=0.3,
        )
        summary = resp.choices[0].message.content.strip()
        # Clean markdown code blocks if any
        summary = re.sub(r'^```html\s*', '', summary)
        summary = re.sub(r'\s*```$', '', summary)
        
        # Sanitize
        summary_clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', summary).replace("'", "''")
        
        # Update
        m.neon_query(f"""UPDATE "ResourceSummary" SET summary = '{summary_clean}', 
                        "extractedAt" = NOW(), "modelUsed" = 'gpt-4o-mini'
                        WHERE "resourceId" = '{t['id']}'""")
        print(f'  NID {t["nid"]}: regenerated ({len(summary_clean)}c)')
    except Exception as e:
        print(f'  NID {t["nid"]}: ERROR {e}')

print('Done')
