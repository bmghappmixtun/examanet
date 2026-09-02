#!/usr/bin/env python3
"""Test: Générer sujet général + nouveau titre pour 10 fichiers collège."""
import os, json, re, importlib.util
from openai import OpenAI

spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY', ''))

# Lexique des matières pour prompt
SUBJECT_FR = {
    'mathematiques': 'Mathématiques', 'physique': 'Physique', 'svt': 'Sciences de la Vie et de la Terre',
    'arabe': 'Arabe', 'francais': 'Français', 'anglais': 'Anglais',
    'histoire': 'Histoire', 'geographie': 'Géographie', 'philosophie': 'Philosophie',
    'informatique': 'Informatique', 'technologie': 'Technologie', 'musique': 'Musique',
    'theatre': 'Théâtre', 'arts': 'Arts plastiques', 'education-islamique': 'Éducation Islamique',
    'education-civique': 'Éducation Civique', 'sport': 'Sport',
    'histoire-geographie': 'Histoire-Géographie',
}
SUBJECT_AR = {
    'mathematiques': 'الرياضيات', 'physique': 'الفيزياء', 'svt': 'علوم الحياة والأرض',
    'arabe': 'العربية', 'francais': 'الفرنسية', 'anglais': 'الإنجليزية',
    'histoire': 'التاريخ', 'geographie': 'الجغرافيا', 'philosophie': 'الفلسفة',
    'informatique': 'الإعلامية', 'technologie': 'التكنولوجيا', 'musique': 'الموسيقى',
    'theatre': 'المسرح', 'arts': 'الفنون', 'education-islamique': 'التربية الإسلامية',
    'education-civique': 'التربية المدنية', 'sport': 'الرياضة',
    'histoire-geographie': 'التاريخ والجغرافيا',
}
CLASS_FR = {'7eme': '7ème année de base', '8eme': '8ème année de base', '9eme': '9ème année de base'}
CLASS_AR = {'7eme': 'السابعة أساسي', '8eme': 'الثامنة أساسي', '9eme': 'التاسعة أساسي'}

def gen_sujet_general(text, subj, cls, language):
    """Generate 2-6 word general subject from text."""
    if language == 'ar':
        prompt = f"""أنت خبير في تلخيص المحتوى التعليمي التونسي للمرحلة الإعدادية.
من النص التالي، استخرج "الموضوع العام" للمستند في 2-6 كلمات عربية.

المادة: {SUBJECT_AR.get(subj, subj)}
المستوى: {CLASS_AR.get(cls, cls)}

النص (أول 2000 حرف):
{text[:2000]}

**الموضوع العام** (2-6 كلمات فقط):"""
    else:
        prompt = f"""Tu es un expert en synthèse pédagogique tunisienne pour le collège.
À partir du texte suivant, extrais le "sujet général" du document en 2-6 mots français.

Matière: {SUBJECT_FR.get(subj, subj)}
Niveau: {CLASS_FR.get(cls, cls)}

Texte (2000 premiers caractères):
{text[:2000]}

**Sujet général** (2-6 mots uniquement):"""
    
    try:
        resp = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[{'role': 'user', 'content': prompt}],
            max_tokens=50,
            temperature=0.2,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        return f'ERROR: {e}'

# Get 10 diverse samples
r = m.neon_query('''
SELECT r.id, r."numericId", r.title, r.language, c.slug as cls, s.slug as subj, 
       LEFT(rc."fullText", 1500) as preview,
       LENGTH(rc."fullText") as ft_len,
       r."headerData"
FROM "Resource" r
LEFT JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Subject" s ON s.id = r."subjectId"
LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
WHERE c.slug IN ('7eme', '8eme', '9eme')
  AND LENGTH(rc."fullText") > 500
ORDER BY RANDOM()
LIMIT 10
''')
samples = []
for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    samples.append({
        'id': row[0], 'nid': row[1], 'title': row[2], 'language': row[3],
        'cls': row[4], 'subj': row[5], 'text': row[6] or '', 'ft_len': row[7],
        'headerData': row[8] or {}
    })

print('=' * 100)
print('TEST: 10 fichiers - Génération sujet général + nouveau titre')
print('=' * 100)

for s in samples:
    sujet = gen_sujet_general(s['text'], s['subj'], s['cls'], s['language'])
    
    # New title: append " : sujet" if not already
    old_title = s['title']
    if ':' in old_title:
        # already has something after :
        new_title = f'{old_title} : {sujet}'
    else:
        new_title = f'{old_title} : {sujet}'
    
    # Detect if it's a "poor" or "no" text case
    quality = 'GOOD' if s['ft_len'] > 2000 else ('POOR' if s['ft_len'] > 500 else 'NONE')
    
    print(f'\nNID {s["nid"]} ({s["language"]}, {s["cls"]}/{s["subj"]}, ft={int(s["ft_len"] or 0)}c, {quality}):')
    print(f'  Title AVANT: {old_title[:100]}')
    print(f'  Sujet général: {sujet}')
    print(f'  Title APRÈS: {new_title[:120]}')

# Save sample
with open('pdf-test/test_sujet_general.json', 'w', encoding='utf-8') as f:
    json.dump([{
        'nid': s['nid'], 'old': s['title'], 'new': f"{s['title']} : {gen_sujet_general(s['text'], s['subj'], s['cls'], s['language'])}",
        'language': s['language'], 'subj': s['subj']
    } for s in samples], f, ensure_ascii=False, indent=2)
print('\nSaved to pdf-test/test_sujet_general.json')
