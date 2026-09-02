#!/usr/bin/env python3
"""
Update Physique collège titles to append ' : generalSubject' (like other subjects).
Also regenerates the slug based on the new title.
"""
import os, json, re, sys, time, unicodedata

# Bootstrap Neon helper
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def proper_slugify(text, max_length=80):
    """Replicate src/lib/slugify.ts:properSlugify() in Python."""
    if not text:
        return ''
    s = text

    # 1. Strip year patterns: (2024-2025), 2024-2025
    s = re.sub(r'\s*\(\d{4}[-–—]\d{4}\)', '', s)
    s = re.sub(r'\s+\d{4}[-–—]\d{4}\s+', ' ', s)

    # 2. Strip teacher name ONLY when there's a colon
    if ':' in s:
        idx = s.rfind(':')
        before = s[:idx]
        after = s[idx:]
        # Match " - ARABIC_NAME" at end of before (3-40 Arabic chars)
        m_match = re.search(r'\s+-\s+([\u0600-\u06FF][\u0600-\u06FF\s]{2,40})\s*$', before)
        if m_match:
            s = before[:m_match.start()].strip() + ' ' + after

    s = s.lower().strip()
    # NFD + strip ONLY Latin diacritics (U+0300-036F), keep AR combining marks
    s = unicodedata.normalize('NFD', s)
    s = re.sub(r'[\u0300-\u036f]', '', s)
    # Specific French accent map
    accent_map = {
        'àáâãäå': 'a', 'èéêë': 'e', 'ìíîï': 'i',
        'òóôõö': 'o', 'ùúûü': 'u', 'ç': 'c', 'ñ': 'n', 'ýÿ': 'y'
    }
    for chars, repl in accent_map.items():
        s = re.sub(f'[{chars}]', repl, s)

    # Keep ASCII a-z, digits, Arabic Unicode, hyphens
    s = re.sub(r'[^a-z0-9\u0600-\u06FF]+', '-', s)
    s = re.sub(r'-+', '-', s)
    s = s.strip('-')

    # Drop "عدد-N" pattern
    s = re.sub(r'عدد-\d+', '', s)
    s = re.sub(r'-+', '-', s).strip('-')

    # Truncate at word boundary
    if len(s) > max_length:
        truncated = s[:max_length]
        last_hyphen = truncated.rfind('-')
        if last_hyphen > 20:
            s = truncated[:last_hyphen]
        else:
            s = truncated

    return s


def clean_control(s):
    """Remove control chars and escape for SQL string."""
    s = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', s)
    return s.replace("'", "''").replace("\\", "\\\\")


def main():
    print('Loading Physique collège resources with generalSubject...', flush=True)
    r = m.neon_query('''
    SELECT r.id, r."numericId", r.title, r.slug, rm."generalSubject", r."schoolType", r.language
    FROM "Resource" r
    JOIN "Subject" s ON s.id = r."subjectId"
    JOIN "Class" c ON c.id = r."classId"
    JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    WHERE s.slug = 'physique' AND c.slug IN ('7eme','8eme','9eme')
      AND rm."generalSubject" IS NOT NULL AND rm."generalSubject" != ''
    ''')
    rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
    print(f'Total: {len(rows)}', flush=True)

    # Categorize
    to_update_title = []   # (rid, nid, old_title, new_title, old_slug, new_slug)
    already_has_sep = 0
    already_has_subj = 0
    ar_to_add = 0
    fr_to_add = 0

    for rid, nid, title, slug, subj, schoolType, lang in rows:
        title = str(title)
        subj = str(subj).strip()

        # Skip if title already has ' : '
        if ' : ' in title:
            already_has_sep += 1
            # Check if the existing ' : ' is the same subject
            if title.endswith(f' : {subj}'):
                already_has_subj += 1
            continue

        # Check if title already ends with the subject (without separator)
        if title.endswith(subj):
            already_has_subj += 1
            continue

        new_title = f'{title} : {subj}'
        new_slug = proper_slugify(new_title)

        if lang == 'ar' or schoolType == 'PUBLIC':
            ar_to_add += 1
        else:
            fr_to_add += 1

        to_update_title.append((rid, nid, title, new_title, str(slug), new_slug))

    print(f'\nBreakdown:')
    print(f'  Already has " : " separator: {already_has_sep}')
    print(f'    of which already has correct subject: {already_has_subj}')
    print(f'  To add (AR PUBLIC): {ar_to_add}')
    print(f'  To add (FR PILOTE): {fr_to_add}')
    print(f'  TOTAL TO UPDATE: {len(to_update_title)}')

    if not to_update_title:
        print('\nNothing to update!')
        return

    # Show samples
    print('\nSamples:')
    for rid, nid, old, new, old_slug, new_slug in to_update_title[:5]:
        print(f'  #{nid}')
        print(f'    OLD title: {old}')
        print(f'    NEW title: {new}')
        print(f'    OLD slug: {old_slug}')
        print(f'    NEW slug: {new_slug}')

    # Apply (in batches of 50)
    print(f'\nApplying {len(to_update_title)} updates (title + slug)...', flush=True)
    BATCH = 50
    ok = 0
    fail = 0
    start = time.time()

    for i in range(0, len(to_update_title), BATCH):
        batch = to_update_title[i:i+BATCH]
        for rid, nid, old_t, new_t, old_s, new_s in batch:
            new_t_clean = clean_control(new_t)
            new_s_clean = clean_control(new_s)
            try:
                m.neon_query(
                    f"UPDATE \"Resource\" SET title = '{new_t_clean}', slug = '{new_s_clean}' WHERE id = '{rid}'"
                )
                ok += 1
            except Exception as e:
                fail += 1
                if fail < 5:
                    print(f'  Fail #{nid}: {str(e)[:100]}')

        elapsed = time.time() - start
        rate = (i + BATCH) / elapsed if elapsed > 0 else 0
        print(f'  [{min(i+BATCH, len(to_update_title))}/{len(to_update_title)}] OK={ok} FAIL={fail} ({rate:.1f}/s)', flush=True)

    print(f'\nDONE: {ok} updated, {fail} failed in {time.time()-start:.0f}s')


if __name__ == '__main__':
    main()
