#!/usr/bin/env python3
"""Regenerate slugs for 50 resources with weird old-format slugs (digit-digit).
Use the title to build proper slug.
"""
import re, importlib.util

spec = importlib.util.spec_from_file_location('m', 'pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

# AR to Latin transliteration
AR_TRANS = {
    'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th',
    'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'th', 'ر': 'r', 'ز': 'z',
    'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a',
    'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
    'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'h', 'ء': '', 'ؤ': 'w',
    'إ': 'i', 'ئ': 'y', 'لا': 'la',
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
}

def slugify(text, max_len=80):
    """Build URL slug from title."""
    s = text.lower().strip()
    # Replace accented chars
    replacements = {
        'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
        'à': 'a', 'â': 'a', 'ä': 'a',
        'î': 'i', 'ï': 'i',
        'ô': 'o', 'ö': 'o',
        'ù': 'u', 'û': 'u', 'ü': 'u',
        'ç': 'c', 'ñ': 'n', 'œ': 'oe', 'æ': 'ae',
        '\u2019': '', '\u2018': '', '"': '', '"': '', ':': ' ', '-': ' ',
    }
    for k, v in replacements.items():
        s = s.replace(k, v)
    # Handle Arabic
    is_ar = any('\u0600' <= c <= '\u06FF' for c in s)
    if is_ar:
        result = ''
        for c in s:
            if c in AR_TRANS:
                result += AR_TRANS[c]
            elif c.isascii() and c.isalnum():
                result += c
            elif c.isspace() or c in '/.,()[]{}':
                result += ' '
        s = result
    # Remove non-alphanumeric (keep spaces, hyphens)
    s = re.sub(r'[^a-z0-9\s-]', ' ', s)
    s = re.sub(r'\s+', '-', s).strip('-')
    s = re.sub(r'-+', '-', s)
    return s[:max_len]

# Get the 50 weird-slug resources
r = m.neon_query('''SELECT id, "numericId", title, slug FROM "Resource" 
                    WHERE slug ~ '^[0-9]+-[0-9]+$' ''')
targets = [{'id': row[0], 'nid': row[1], 'title': str(row[2]), 'old_slug': str(row[3])} 
           for row in r.get('response', [{}])[0].get('data', {}).get('rows', [])]
print(f'Total: {len(targets)}')

# Build new slugs
ok = 0
collisions = 0
for t in targets:
    new_slug = slugify(t['title'])
    if not new_slug:
        new_slug = f"resource-{t['nid']}"
    
    # Check if this slug already exists for another resource
    r = m.neon_query(f'''SELECT id FROM "Resource" WHERE slug = '{new_slug.replace("'", "''")}' AND id != '{t['id']}' ''')
    exists = bool(r.get('response', [{}])[0].get('data', {}).get('rows', []))
    
    if exists:
        # Add nid suffix
        new_slug = f"{new_slug}-{t['nid']}"
        collisions += 1
    
    new_slug_clean = new_slug.replace("'", "''")
    m.neon_query(f"UPDATE \"Resource\" SET slug = '{new_slug_clean}' WHERE id = '{t['id']}'")
    ok += 1
    
    if ok <= 5:
        print(f'  NID {t["nid"]}: {t["old_slug"]} → {new_slug}')

print(f'\nDone: {ok} updated, {collisions} collisions handled')
