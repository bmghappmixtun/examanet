#!/usr/bin/env python3
"""
Fix broken teacher names imported from PDFs.

Many teachers have names contaminated with subject info, school location,
or "stamped" markers. This script extracts the real name parts.
"""

import os, sys, subprocess, re, asyncio, asyncpg

# Auto-install
for m, p in {'asyncpg': 'asyncpg'}.items():
    try: __import__(m)
    except ImportError: subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', '--break-system-packages', p])

for env_file in ['/workspace/edutunisie/.env.local', '/workspace/edutunisie/.env']:
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line: continue
                k, v = line.split('=', 1); os.environ.setdefault(k, v.strip('"').strip("'"))


# Junk patterns to strip (subjects, locations, status markers)
JUNK_PATTERNS = [
    r'\s*\b(D\.R|Délégation|Coll[eé]ge|Lycée|École)\b.*$',  # school/location after
    r'\s*-\s*stamped(\s*-compressed)?$',
    r'\s*-\s*compressed$',
    r'\s*\(stamped\)$',
    # Arabic subjects
    r'\s+(?:الجذاءات|مبرهنة|المستقيمات|الجذور|الأعداد|العبارات|الحرفية|الكسور|العمليات|الحسابات|المثلثات|المثلثات|الهندسة|التربيعية|العبارات|المواد|الفيزياء|العلوم|التاريخ|الجغرافيا|الإنشاء|دراسة النص|الإنشاء|التعبير|التحرير|الإنشاء|الفرنسية|العربية|الإنجليزية|تربية|التربية|القراءة|المقاطع|الصوتيات|النحو|الصرف|البلاغة|العروض|الأدب|المكتبة|الفلسفة|المنطق|الاجتماعيات)\b.*$',
    # Numbered series or folder labels
    r'\s+[N°n]+\s*\d+\s*$',
]

# Arabic keywords that indicate subject info (NOT names)
SUBJECT_AR_KEYWORDS = [
    'الجذاءات', 'مبرهنة', 'المستقيمات', 'الجذور', 'الأعداد', 'العبارات', 
    'الحرفية', 'الكسور', 'العمليات', 'المثلثات', 'الهندسة', 'التربيعية',
    'الفيزياء', 'العلوم', 'التاريخ', 'الجغرافيا', 'الإنشاء', 'دراسة',
    'النص', 'التحرير', 'الفرنسية', 'العربية', 'الإنجليزية', 'تربية',
    'التربية', 'القراءة', 'المقاطع', 'النحو', 'الصرف', 'البلاغة',
    'الأدب', 'الفلسفة', 'الفن', 'الموسيقى', 'المسرح', 'الإسلامية',
    'الرياضيات', 'الإعلامية', 'التكنولوجيا', 'البيولوجيا', 'الكيمياء',
    'فيزياء', 'علوم', 'تاريخ', 'جغرافيا', 'إنشاء', 'فرنسية', 'عربية',
    'إنجليزية', 'فرض', 'سلسلة', 'تمارين', 'أنشطة',
]


def clean_name_part(name: str, max_words: int = 3) -> str:
    """Clean a name by removing junk patterns and limiting word count."""
    if not name:
        return name
    
    n = name.strip()
    
    # Strip "-stamped", "-compressed", "(stamped)" markers
    n = re.sub(r'\s*-\s*stamped(\s*-compressed)?$', '', n, flags=re.IGNORECASE)
    n = re.sub(r'\s*-\s*compressed$', '', n, flags=re.IGNORECASE)
    n = re.sub(r'\s*\(stamped\)$', '', n, flags=re.IGNORECASE)
    
    # For Arabic names: cut at the first subject keyword
    if any(ord(c) > 0x600 for c in n):  # Has Arabic chars
        # Find the first occurrence of any subject keyword and cut before it
        earliest = len(n)
        for kw in SUBJECT_AR_KEYWORDS:
            idx = n.find(kw)
            if idx >= 0 and idx < earliest:
                earliest = idx
        if earliest < len(n):
            n = n[:earliest].strip()
    
    # For both: cut at " D.R" or location markers
    for pat in [r'\s+D\.R\b', r'\s+Coll[eé]ge\b', r'\s+Lycée\b', r'\s+École\b']:
        m = re.search(pat, n, re.IGNORECASE)
        if m:
            n = n[:m.start()].strip()
    
    # Limit to max_words
    parts = n.split()
    if len(parts) > max_words:
        n = ' '.join(parts[:max_words])
    
    return n.strip()


def split_name(full: str) -> tuple:
    """Split a possibly-corrupted full name into (firstName, lastName).
    Takes the first 2 'real' words."""
    if not full:
        return ('', '')
    
    # First clean
    cleaned = clean_name_part(full, max_words=4)
    
    # Split into 2 parts: first word = firstName, rest = lastName
    parts = cleaned.split()
    if len(parts) == 0:
        return ('', '')
    if len(parts) == 1:
        return (parts[0], '')
    
    return (parts[0], ' '.join(parts[1:]))


async def main():
    conn = await asyncpg.connect(os.environ['DATABASE_URL'].replace('?schema=public', ''))
    
    # Get all teachers
    rows = await conn.fetch('''
        SELECT id, "firstName", "lastName", "firstNameAr", "lastNameAr"
        FROM "User"
        WHERE role = 'TEACHER' AND email LIKE 'import.%'
    ''')
    
    fixed = 0
    skipped = 0
    
    for r in rows:
        uid = r[0]
        old_fn = r[1] or ''
        old_ln = r[2] or ''
        old_fn_ar = r[3] or ''
        old_ln_ar = r[4] or ''
        
        # Skip if both FR and AR names look clean
        if (len(old_ln) <= 20 and old_ln == old_ln_ar
            and len(old_fn) <= 15 and '-' not in old_ln
            and not any(kw in old_ln for kw in SUBJECT_AR_KEYWORDS)):
            skipped += 1
            continue
        
        # Clean each field
        new_fn = clean_name_part(old_fn, max_words=1)
        # For lastName, allow more words (could be multi-word family name)
        new_ln = clean_name_part(old_ln, max_words=3)
        new_fn_ar = clean_name_part(old_fn_ar, max_words=1)
        new_ln_ar = clean_name_part(old_ln_ar, max_words=3)
        
        # Only update if changed
        if (new_fn != old_fn or new_ln != old_ln 
            or new_fn_ar != old_fn_ar or new_ln_ar != old_ln_ar):
            print(f"🔧 {uid}")
            print(f"   FR: '{old_fn}' '{old_ln}' → '{new_fn}' '{new_ln}'")
            print(f"   AR: '{old_fn_ar}' '{old_ln_ar}' → '{new_fn_ar}' '{new_ln_ar}'")
            
            await conn.execute('''
                UPDATE "User"
                SET "firstName" = $1, "lastName" = $2,
                    "firstNameAr" = $3, "lastNameAr" = $4,
                    "updatedAt" = NOW()
                WHERE id = $5
            ''', new_fn, new_ln, new_fn_ar, new_ln_ar, uid)
            fixed += 1
    
    print(f"\n✅ Done: {fixed} fixed, {skipped} skipped")
    
    await conn.close()


asyncio.run(main())
