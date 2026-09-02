#!/usr/bin/env python3
"""
Comprehensive fix for headerData — extracted from titles (human-curated).
Wipes hallucinated OCR values and replaces with clean title extraction.
"""

import os, sys, subprocess, re, json, asyncio, asyncpg

# Auto-install
for m, p in {'asyncpg': 'asyncpg', 'psycopg2': 'psycopg2-binary'}.items():
    try: __import__(m)
    except ImportError: subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', '--break-system-packages', p])

# Load env
for env_file in ['/workspace/edutunisie/.env.local', '/workspace/edutunisie/.env']:
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                k, v = line.split('=', 1)
                os.environ.setdefault(k, v.strip('"').strip("'"))

DB_URL = os.environ['DATABASE_URL'].replace('?schema=public', '')

SUBJECT_MAP_FR = {
    'math': 'mathematiques', 'maths': 'mathematiques', 'mathématique': 'mathematiques',
    'mathématiques': 'mathematiques',
    'physique': 'physique', 'phys': 'physique', 'svt': 'svt', 'science': 'svt',
    'français': 'francais', 'francais': 'francais', 'fr': 'francais',
    'arabe': 'arabe', 'ar': 'arabe',
    'anglais': 'anglais', 'english': 'anglais', 'ang': 'anglais',
    'histoire': 'histoire', 'hist': 'histoire',
    'géographie': 'geographie', 'geographie': 'geographie',
    'technologie': 'technologie', 'techno': 'technologie',
    'informatique': 'informatique', 'info': 'informatique',
    'éducation islamique': 'education_islamique', 'musique': 'musique', 'théâtre': 'theatre',
    'philo': 'philosophie', 'philosophie': 'philosophie',
    'tunisien': 'arabe', 'espagnol': 'espagnol', 'esp': 'espagnol',
    'allemand': 'allemand', 'all': 'allemand',
    'étude de textes': 'arabe', 'etude de textes': 'arabe',  # étude de texte = AR
    'production écrite': 'francais', 'production ecrite': 'francais',
    'orthographe': 'francais', 'grammaire': 'francais', 'conjugaison': 'francais',
}
SUBJECT_MAP_AR = {
    'رياضيات': 'mathematiques', 'الرياضيات': 'mathematiques',
    'فيزياء': 'physique', 'الفيزياء': 'physique',
    'علوم': 'svt', 'العلوم': 'svt',
    'عربية': 'arabe', 'العربية': 'arabe', 'تربية عربية': 'arabe',
    'فرنسية': 'francais', 'الفرنسية': 'francais', 'تربية فرنسية': 'francais',
    'إنجليزية': 'anglais', 'انجليزية': 'anglais', 'الإنجليزية': 'anglais',
    'تاريخ': 'histoire', 'التاريخ': 'histoire',
    'جغرافيا': 'geographie', 'الجغرافيا': 'geographie',
    'تكنولوجيا': 'technologie', 'التكنولوجيا': 'technologie',
    'إعلامية': 'informatique', 'الإعلامية': 'informatique',
    'تربية إسلامية': 'education_islamique', 'الإسلامية': 'education_islamique',
    'موسيقى': 'musique', 'الموسيقى': 'musique',
    'مسرح': 'theatre', 'المسرح': 'theatre', 'تربية مسرحية': 'theatre',
    'تربية مدنية': 'education_civique', 'المدنية': 'education_civique',
    'فلسفة': 'philosophie', 'الفلسفة': 'philosophie',
    'رياضة': 'sport', 'تربية بدنية': 'sport',
    'دراسة النص': 'arabe', 'الإنشاء': 'arabe',  # Arabic-specific subjects
    'الإيقاظ العلمي': 'svt', 'الايقاظ العلمي': 'svt',
}

TYPE_PATTERNS_FR = [
    ('Devoir de Contrôle', 'controle'), ('Devoir de Synthèse', 'synthese'),
    ('Devoir de Maison', 'maison'), ('Devoir Concour', 'concours'),
    ('Devoir de Révision', 'revision'), ('Devoir', 'devoir'),
    ('Série d.exercices', 'serie'), ('Série', 'serie'), ('Cours', 'cours'),
    ('Fiche', 'fiche'), ('Exercice', 'exercice'), ('Test', 'test'),
    ('Examen', 'examen'), ('Concours', 'concours'),
]
TYPE_PATTERNS_AR = [
    ('فرض مراقبة', 'controle'), ('فرض تأليفي', 'synthese'), ('فرض', 'devoir'),
    ('سلسلة تمارين', 'serie'), ('سلسلة', 'serie'), ('درس', 'cours'),
    ('اختبار', 'test'), ('تقييم', 'test'), ('مراجعة', 'revision'),
    ('تحضير', 'cours'), ('تدريب', 'serie'),
]
YEAR_PATTERNS = [
    r'\((\d{4})\s*[-–/]\s*(\d{2,4})\)', r'\((\d{4})\s*[-–/]\s*(\d{2,4})\)?',
    r'(\d{4})\s*[-–/]\s*(\d{2,4})', r'(\d{4})\s*/\s*(\d{2,4})',
]
TEACHER_FR_PATTERNS = [
    r'\b(?:Mr|Mme|Mlle|Mrs|M\.|Prof)\s+([A-Za-z\u0600-\u06FF][A-Za-z\u0600-\u06FF\-\s\'\.]{2,50}?)(?:\?|$|\s\?t=|\s\(|\s\d)',
]
TEACHER_AR_PATTERNS = [
    r'(?:الأستاذ|الاستاذ|الأستاذة|الاستاذة|أستاذ|أستاذة)[:\s]+([\u0600-\u06FF][\u0600-\u06FF\-\s]{2,50}?)(?:\?|$|\s\?t=|\s\(|\s\d)',
]


def extract_level(title):
    m = re.search(r'(الأولى|الثانية|الثالثة|الرابعة|الخامسة|السادسة|السابعة|الثامنة|التاسعة)\s+أساسي', title)
    if m:
        return {'الأولى': '1', 'الثانية': '2', 'الثالثة': '3', 'الرابعة': '4', 'الخامسة': '5', 'السادسة': '6', 'السابعة': '7', 'الثامنة': '8', 'التاسعة': '9'}[m.group(1)] + 'eme'
    m = re.search(r'\b([7-9])\s*(?:ème|eme)\b', title)
    return f"{m.group(1)}eme" if m else None

def extract_subject(title):
    t = title.lower()
    for k, v in SUBJECT_MAP_FR.items():
        if re.search(r'(?:^|[\s\-/])' + re.escape(k) + r'(?:[\s\-/,\.\?]|$)', t): return v
    for k, v in SUBJECT_MAP_AR.items():
        if k in title: return v
    return None

def extract_year(title):
    for pat in YEAR_PATTERNS:
        m = re.search(pat, title)
        if m:
            y1, y2 = m.group(1), m.group(2)
            if len(y2) == 2: y2 = y1[:2] + y2
            return f"{y1}-{y2}"
    return None

def extract_type(title):
    t = title.split('?')[0]
    for pat, val in TYPE_PATTERNS_FR:
        if pat.lower() in t.lower(): return val
    for pat, val in TYPE_PATTERNS_AR:
        if pat in t: return val
    return None

def extract_teacher(title):
    t = title.split('?')[0].rstrip()
    for pat in TEACHER_AR_PATTERNS:
        m = re.search(pat, t)
        if m:
            name = m.group(1).strip().rstrip(',.;:')
            if len(name) >= 4 and name not in ['السنة', 'الأولى', 'الثانية', 'الثالثة']: return name
    for pat in TEACHER_FR_PATTERNS:
        m = re.search(pat, t)
        if m:
            name = m.group(1).strip().rstrip(',.;:')
            if len(name) >= 3: return name
    return None

def extract_school(title):
    t = title.split('?')[0]
    # Arabic: الإعدادية X (stop at common separators or الأستاذ)
    m = re.search(r'([إا]ل[إا]عدادي[ةه]\s+[^?(){}\d]+?)(?:\s*الأستاذ|\s*\?|$)', t)
    if m:
        school = m.group(1).strip()
        if len(school) >= 8: return school
    # Specific known school names
    if 'berges du lac' in t.lower():
        return 'Collège pilote Les berges du lac'
    # Generic École/Collège/Lycée pilote alone (rare in titles)
    m = re.search(r'^(Coll[eè]ge\s+pilote)(?:\s*$|\s*\?|\s*\()', t)
    if m: return m.group(1).strip()
    m = re.search(r'^(Lycée\s+pilote)(?:\s*$|\s*\?|\s*\()', t)
    if m: return m.group(1).strip()
    return None


async def main():
    conn = await asyncpg.connect(DB_URL)
    rows = await conn.fetch('SELECT id, title, "headerData" FROM "Resource"')
    print(f"📊 Total: {len(rows)}")
    
    teacher_count = 0
    school_count = 0
    
    for r in rows:
        rid, title = r['id'], r['title']
        
        new_data = {
            'school': extract_school(title),
            'teacher': extract_teacher(title),
            'year': extract_year(title),
            'level': extract_level(title),
            'subject': extract_subject(title),
            'type': extract_type(title),
        }
        
        if new_data['teacher']: teacher_count += 1
        if new_data['school']: school_count += 1
        
        await conn.execute(
            'UPDATE "Resource" SET "headerData" = $1::jsonb WHERE id = $2',
            json.dumps(new_data, ensure_ascii=False), str(rid)
        )
        
        # Also update schoolName column
        if new_data['school']:
            await conn.execute(
                'UPDATE "Resource" SET "schoolName" = $1 WHERE id = $2 AND ("schoolName" IS NULL OR "schoolName" = \'\')',
                new_data['school'], str(rid)
            )
    
    print(f"\n✅ Done!")
    print(f"   Teacher filled: {teacher_count}")
    print(f"   School filled: {school_count}")
    
    await conn.close()


asyncio.run(main())
