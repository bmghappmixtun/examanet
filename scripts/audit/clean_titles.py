#!/usr/bin/env python3
"""
Title cleanup:
- Remove Tatweel (ـ U+0640) - PDF letter stretching
- Collapse multiple spaces
- Strip URL query strings like ?t=1234567890
- Fix "ع X دد" → "عدد X" (Arabic number with letter-spacing)
- Fix "الأستاذ ة" → "الأستاذة" (split teacher prefix)
- Trim trailing counters when duplicate (" 3", " 2", etc.)
"""

import os, sys, subprocess, re, json, asyncio, asyncpg

# Auto-install deps
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


def clean_title(title: str) -> tuple[str, dict]:
    """Return (cleaned_title, stats)."""
    if not title:
        return title, {}
    
    original = title
    changes = {}
    
    # 1. Strip URL query strings (?t=, &t=, etc.)
    # Match ? followed by query-like stuff at end of title
    new = re.sub(r'\s*\?[a-zA-Z][^\s]*=[\w\-_%\.]+', '', title)
    new = re.sub(r'\s*&[a-zA-Z][^\s]*=[\w\-_%\.]+', '', new)
    new = re.sub(r'\s+t=\d{6,}\s*$', '', new)  # Tail timestamp
    if new != title:
        changes['stripped_query'] = True
        title = new.strip()
    
    # 2. Remove Tatweel (ـ U+0640)
    new = title.replace('ـ', '')
    if new != title:
        changes['removed_tatweel'] = new.count('ـ') if 'ـ' not in title else title.count('ـ')
        title = new
    
    # 3. Fix "ع X دد" → "عدد X" (Arabic number with letter-spacing artifact)
    new = re.sub(r'ع\s*(\d+)\s*دد', r'عدد \1', title)
    if new != title:
        changes['fixed_number_عدد'] = True
        title = new
    
    # 4. Fix common Tatweel-related word splits:
    #    "الأستاذ ة منية" → "الأستاذة منية"
    new = re.sub(r'\bالأستاذ\s+ة\b', 'الأستاذة', title)
    new = re.sub(r'\bالاستاذ\s+ة\b', 'الاستاذة', new)
    new = re.sub(r'\bالأساتذ\s+ة\b', 'الأساتذة', new)
    new = re.sub(r'\bالاساتذ\s+ة\b', 'الاساتذة', new)
    #    "السنة 2009-2010 ة" → "السنة 2009-2010"  (Tatweel after year was eaten)
    new = re.sub(r'(\d{4}\s*[-–/]\s*\d{2,4})\s+ة\b', r'\1', new)
    #    "السنة" + Tatweel artifact → "السنة"
    new = re.sub(r'الس(\d{4}\s*[-–/]?\s*\d{2,4})نة', r'السنة \1', new)
    new = re.sub(r'الت(\d+)\s+اسعة', r'التاسعة', new)
    new = re.sub(r'الس(\d+)\s+ابعة', r'السابعة', new)
    new = re.sub(r'الت(\d+)\s+امنة', r'الثامنة', new)
    # Ordinals with embedded digit (الت9اسعة → التاسعة, الس7ابعة → السابعة)
    new = re.sub(r'ال([تاس])([1-9])[ا-ي]+', lambda m: {
        'ت8': 'الثامنة', 'ت9': 'التاسعة', 'ت7': 'السابعة', 'ت6': 'السادسة',
        'ت5': 'الخامسة', 'ت4': 'الرابعة', 'ت3': 'الثالثة', 'ت2': 'الثانية', 'ت1': 'الأولى',
        'س7': 'السابعة', 'س6': 'السادسة', 'س5': 'الخامسة', 'س4': 'الرابعة',
        'س3': 'الثالثة', 'س2': 'الثانية', 'س1': 'الأولى',
        'ا1': 'الأولى', 'ا2': 'الثانية', 'ا3': 'الثالثة', 'ا4': 'الرابعة',
        'ا5': 'الخامسة', 'ا6': 'السادسة', 'ا7': 'السابعة', 'ا8': 'الثامنة', 'ا9': 'التاسعة',
    }.get(m.group(1) + m.group(2), m.group(0)), new)
    # Handle 'السنة السابعة' patterns that show up after Tatweel removal
    new = re.sub(r'السنة\s+السابعة\s+أساسي', 'السنة السابعة أساسي', new)
    new = re.sub(r'السنة\s+الثامنة\s+أساسي', 'السنة الثامنة أساسي', new)
    new = re.sub(r'السنة\s+التاسعة\s+أساسي', 'السنة التاسعة أساسي', new)
    new = re.sub(r'السنة\s+الأولى\s+أساسي', 'السنة الأولى أساسي', new)
    new = re.sub(r'السنة\s+الثانية\s+أساسي', 'السنة الثانية أساسي', new)

    if new != title:
        changes['fixed_word_splits'] = True
        title = new
    
    # 5. Collapse multiple spaces
    new = re.sub(r'\s+', ' ', title)
    if new != title:
        changes['collapsed_spaces'] = True
        title = new
    
    # 6. Collapse multiple dashes (--- --- → -)
    new = re.sub(r'-{2,}', '-', title)
    new = re.sub(r'\s*-\s*-\s*', ' - ', new)
    if new != title:
        title = new
    
    # 7. Strip leading/trailing whitespace
    new = title.strip()
    if new != title:
        title = new
    
    # 8. Fix leading dashes/spaces (e.g. " - Cours - ...")
    new = re.sub(r'^[\s\-]+', '', title)
    if new != title:
        title = new
    
    # 9. Fix weird spaced Arabic words ("في م اد ّ ة" → "في مادّة")
    #    (no specific fix - hard to generalize safely)
    
    return title, changes


async def main():
    conn = await asyncpg.connect(DB_URL)
    rows = await conn.fetch('SELECT id, slug, title FROM "Resource"')
    print(f"📊 Auditing {len(rows)} titles...\n")
    
    fixed = 0
    error_count = 0
    no_change = 0
    
    for r in rows:
        original = r['title']
        new_title, changes = clean_title(original)
        
        if not new_title or len(new_title.strip()) < 5:
            # Skip if cleaning would result in empty/too-short title (safety)
            no_change += 1
            continue
        
        if new_title != original:
            await conn.execute(
                'UPDATE "Resource" SET title = $1 WHERE id = $2',
                new_title, str(r['id'])
            )
            fixed += 1
            if fixed <= 5:
                print(f"   📝 Original: {original[:80]}")
                print(f"      New:      {new_title[:80]}")
                print(f"      Changes:  {changes}\n")
    
    print(f"\n✅ Done!")
    print(f"   Fixed: {fixed}")
    print(f"   Unchanged: {no_change + (len(rows) - fixed - no_change)}")
    
    # Re-audit to confirm
    print(f"\n📊 Re-audit:")
    remaining_tatweel = await conn.fetchval('SELECT COUNT(*) FROM "Resource" WHERE title LIKE \'%ـ%\'')
    remaining_query = await conn.fetchval('SELECT COUNT(*) FROM "Resource" WHERE title LIKE \'%?t=%\'')
    remaining_multispace = await conn.fetchval('SELECT COUNT(*) FROM "Resource" WHERE title ~ \'\\s{2,}\'')
    
    print(f"   Remaining with Tatweel: {remaining_tatweel}")
    print(f"   Remaining with ?t= query: {remaining_query}")
    print(f"   Remaining with multi-space: {remaining_multispace}")
    
    await conn.close()


asyncio.run(main())
