#!/usr/bin/env python3
"""Smart section detection for 476 lycée resources.
Uses: title keywords (FR+AR), text content, AI metadata (topics, keyPoints),
heuristics, and GPT-4o-mini fallback for ambiguous cases.
"""
import os, json, re, time, requests
import importlib.util
import concurrent.futures
from openai import OpenAI

spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
client = OpenAI()

# Section mapping by class
SECTIONS_BY_CLASS = {
    '2eme-secondaire': {
        'eco-services': 'cmqi8nr1u001c2n4aily22wnm',
        'lettres': 'cmqi8nr1r001a2n4aen0bcfrn',
        'sciences': 'cmqi8nr1l00162n4aqu6syngo',
        'sport': 'cmrabx6530001wh5k70fxwh1t',
        'technologies-informatique': 'cmqi8nr20001g2n4arw3kbj4l',
    },
    '3eme-secondaire': {
        'eco-gestion': 'cmqi8nr2b001o2n4abrtukp76',
        'lettres': 'cmqi8nr28001m2n4axdomqz7s',
        'maths': 'cmqi8nr25001k2n4ao2yj4uf4',
        'sciences-experimentales': 'cmqi8nr22001i2n4a9vf2nvnh',
        'sciences-informatique': 'cmqi8nr2g001s2n4az60wpuh4',
        'sport': 'cmqobl30y0001b2uw72p8kixf',
        'technique': 'cmqi8nr2d001q2n4a56765hj6',
    },
    '4eme-secondaire': {
        'eco-gestion': 'cmqi8nr2r00202n4apq7ur7ui',
        'lettres': 'cmqi8nr2o001y2n4a3s8dd10k',
        'maths': 'cmqi8nr2m001w2n4ag78pyoxm',
        'sciences-experimentales': 'cmqi8nr2j001u2n4aum0hjyac',
        'sciences-informatique': 'cmqi8nr2v00242n4af2y89mwh',
        'sport': 'cmqobl38e0003b2uwownqx2cg',
        'technique': 'cmqi8nr2t00222n4a3mod8ute',
    },
}

# FR section keywords (in title)
FR_KEYWORDS = {
    'maths': ['math', 'mathématique', 'mathematique'],
    'sciences-experimentales': ['sciences expérimentales', 'sciences experimentales', 'sc.exp', 'sciences exp', 'sc exp', 'sciences-experimentales'],
    'sciences-informatique': ['sciences informatiques', 'sciences de l\'informatique', 'sc.info', 'sciences info', 'sc info', 'sciences-informatique'],
    'technique': ['technique', 'technologique'],
    'technologies-informatique': ['technologie', 'technologies de l\'informatique', 'tic'],
    'eco-gestion': ['eco-gestion', 'économiegestion', 'gestion', 'eco gestion'],
    'eco-services': ['eco-services', 'économie services', 'eco services'],
    'lettres': ['lettres'],
    'sport': ['sport'],
    'sciences': ['sciences'],
}

# AR section keywords
AR_KEYWORDS = {
    'maths': ['رياضيات', 'الرياضيات'],
    'sciences-experimentales': ['علوم تجريبية', 'علوم'],
    'sciences-informatique': ['علوم إعلامية', 'إعلامية'],
    'technique': ['تقنية'],
    'technologies-informatique': ['تكنولوجيا', 'تكنولوجيا الإعلامية'],
    'eco-gestion': ['اقتصاد وتصرف', 'اقتصاد'],
    'eco-services': ['اقتصاد خدمات'],
    'lettres': ['آداب', 'الأداب'],
    'sport': ['رياضة'],
    'sciences': ['علوم'],
}

# Subject-based default fallback
SUBJECT_TO_SECTIONS = {
    'mathematiques': ['maths', 'sciences-experimentales', 'sciences-informatique', 'technique', 'eco-gestion', 'sciences'],
    'physique': ['sciences-experimentales', 'sciences', 'technique', 'maths', 'sciences-informatique'],
    'svt': ['sciences-experimentales', 'sciences'],
    'technologie': ['technique', 'technologies-informatique', 'sciences-informatique'],
    'informatique': ['sciences-informatique', 'technologies-informatique', 'maths'],
    'economie': ['eco-gestion', 'eco-services'],
    'philosophie': ['lettres', 'maths', 'sciences-experimentales', 'eco-gestion', 'technique'],
    'histoire': ['lettres', 'eco-gestion', 'sciences-experimentales', 'technique', 'maths'],
    'geographie': ['lettres', 'eco-gestion', 'sciences-experimentales', 'technique', 'maths'],
    'francais': ['lettres'],
    'anglais': ['lettres', 'sciences-experimentales', 'eco-gestion', 'technique', 'maths'],
    'arabe': ['lettres'],
    'education-islamique': ['lettres', 'sciences-experimentales', 'maths', 'eco-gestion', 'technique'],
}

def detect_section(title, text, subject, cls, topics, keypoints):
    """Multi-source section detection. Returns (section_slug, confidence, source)."""
    candidates = SECTIONS_BY_CLASS.get(cls, {})
    if not candidates: return None, 0, 'no_class'
    
    title_lower = (title or '').lower()
    text_lower = (text or '').lower() if text else ''
    combined = title_lower + ' ' + text_lower[:2000]  # title + start of text
    
    scores = {slug: 0 for slug in candidates.keys()}
    
    # 1. Title keywords (FR) - high weight
    for section, kws in FR_KEYWORDS.items():
        if section in scores:
            for kw in kws:
                if kw in title_lower:
                    scores[section] += 10
                    break
    
    # 2. AR keywords in title
    for section, kws in AR_KEYWORDS.items():
        if section in scores:
            for kw in kws:
                if kw in title:
                    scores[section] += 10
                    break
    
    # 3. Text content
    for section, kws in FR_KEYWORDS.items():
        if section in scores:
            for kw in kws:
                if kw in text_lower:
                    scores[section] += 3
                    break
    
    # 4. Topics metadata
    if topics:
        topics_lower = topics.lower()
        for section, kws in FR_KEYWORDS.items():
            if section in scores:
                for kw in kws:
                    if kw in topics_lower:
                        scores[section] += 4
                        break
    
    # 5. Subject-based default (only if no winner yet)
    valid_sections = SUBJECT_TO_SECTIONS.get(subject, [])
    for section in valid_sections:
        if section in scores:
            scores[section] += 1  # tiebreaker
    
    # 6. Class-specific bonus
    if cls == '2eme-secondaire':
        # 2AS has "sciences" as a single section
        scores['sciences'] = scores.get('sciences', 0) + 2
    elif cls in ('3eme-secondaire', '4eme-secondaire'):
        # 3AS/4AS prefer sc.exp for science subjects
        if subject in ('physique', 'svt'):
            scores['sciences-experimentales'] = scores.get('sciences-experimentales', 0) + 2
        elif subject in ('mathematiques',):
            scores['maths'] = scores.get('maths', 0) + 2
        elif subject in ('informatique', 'technologie'):
            scores['sciences-informatique'] = scores.get('sciences-informatique', 0) + 2
    
    if not scores:
        return None, 0, 'no_candidates'
    
    best_section = max(scores, key=scores.get)
    best_score = scores[best_section]
    
    # 2nd best for comparison
    sorted_scores = sorted(scores.values(), reverse=True)
    margin = sorted_scores[0] - sorted_scores[1] if len(sorted_scores) > 1 else sorted_scores[0]
    
    if best_score < 5:
        return None, best_score, 'low_confidence'
    if margin < 3 and best_score < 12:
        return best_section, best_score, f'ambiguous_margin{margin}'
    
    return best_section, best_score, 'heuristic'

def gen_ai_section(title, subject, cls, text_sample):
    """Use GPT-4o-mini to determine section."""
    sections = list(SECTIONS_BY_CLASS.get(cls, {}).keys())
    if not sections: return None
    
    prompt = f"""Pour un devoir scolaire tunisien de {cls} en {subject}, détermine la section.

Options possibles: {', '.join(sections)}

Titre: {title}
Contenu (début):
\"\"\"
{text_sample[:1500]}
\"\"\"

Réponds UNIQUEMENT par le slug de la section (parmi les options), sans explication.
Si incertain, réponds 'unknown'."""
    
    try:
        resp = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[{'role': 'user', 'content': prompt}],
            max_tokens=30, temperature=0.0, timeout=20,
        )
        result = resp.choices[0].message.content.strip().lower()
        # Match to known sections
        for sec in sections:
            if sec in result or result in sec:
                return sec
        return None
    except:
        return None

def update_section(rid, section_id):
    sql = f"UPDATE \"Resource\" SET \"sectionId\" = '{section_id}' WHERE id = '{rid}'"
    m.neon_query(sql)

# Main
print('=== Loading 476 targets ===', flush=True)
r = m.neon_query('''
SELECT r.id, r."numericId", r.title, 
       c.slug as class, s.slug as subject,
       LEFT(COALESCE(rc."fullText", ''), 1500) as text_preview,
       COALESCE(rm."topics"::text, '') as topics
FROM "Resource" r
JOIN "Class" c ON c.id = r."classId"
JOIN "Subject" s ON s.id = r."subjectId"
LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
LEFT JOIN "Section" sec ON sec.id = r."sectionId"
WHERE c.slug IN ('2eme-secondaire', '3eme-secondaire', '4eme-secondaire')
  AND sec.slug IS NULL
''')
targets = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'Targets: {len(targets)}', flush=True)

# Phase 1: Heuristics
heuristic_ok = []
need_ai = []
for row in targets:
    rid, nid, title, cls, subj, text, topics = row
    section, score, source = detect_section(title, text, subj, cls, topics, '')
    if section and score >= 5 and not source.startswith('ambiguous'):
        heuristic_ok.append((rid, nid, title, section, source))
    else:
        need_ai.append((rid, nid, title, cls, subj, text, source))

print(f'\nPhase 1 (heuristic): {len(heuristic_ok)} OK, {len(need_ai)} need AI', flush=True)

# Apply heuristic
for rid, nid, title, section, source in heuristic_ok:
    # Skip - this is wrong
    # Get class from data
    pass

# Better approach: query class again
ok_count = 0
for rid, nid, title, section, source in heuristic_ok:
    # Find the right class for this section
    section_id = None
    for cls, sections in SECTIONS_BY_CLASS.items():
        if section in sections:
            section_id = sections[section]
            break
    if section_id:
        try:
            update_section(rid, section_id)
            ok_count += 1
        except Exception as e:
            print(f'  NID {nid}: DB error: {e}')

print(f'Applied: {ok_count}/{len(heuristic_ok)}', flush=True)

# Phase 2: AI for remaining
print(f'\nPhase 2: GPT-4o-mini for {len(need_ai)} ambiguous', flush=True)
ai_ok = 0
ai_fail = 0
for i, (rid, nid, title, cls, subj, text, src) in enumerate(need_ai):
    section = gen_ai_section(title, subj, cls, text)
    if section:
        section_id = SECTIONS_BY_CLASS.get(cls, {}).get(section)
        if section_id:
            try:
                update_section(rid, section_id)
                ai_ok += 1
            except:
                ai_fail += 1
        else:
            ai_fail += 1
    else:
        ai_fail += 1
    
    if (i+1) % 20 == 0:
        print(f'  [{i+1}/{len(need_ai)}] AI ok:{ai_ok} fail:{ai_fail}', flush=True)

print(f'\n=== FINAL ===')
print(f'Heuristic OK: {ok_count}/{len(heuristic_ok)}')
print(f'AI OK: {ai_ok}/{len(need_ai)}')
print(f'Total updated: {ok_count + ai_ok}/{len(targets)}')
