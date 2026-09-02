#!/usr/bin/env python3
"""
Extract prof + school names from OCR text using regex (NO GPT).
For Physique collège resources.

Patterns handled (AR + FR + OCR-degraded):
- الأستاذ X / الاستاذ X / أ. X / إ. X
- Collège pilote X / Lycée pilote X
- المدرسة الاعدادية X / الاعدادية X / اعدادية X
- Mr/Mme/M./Mlle/Prof/Med X (FR/EN)
- من إعداد X / إعداد الأستاذ X
"""
import os, json, re, sys, time, unicodedata

sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


# ==================== NORMALIZATION ====================

def norm_ar(s):
    """Normalize AR for OCR tolerance: remove hamzas/tatweel, normalize alef/yaa."""
    if not s:
        return ''
    s = str(s)
    # TATWEEL ـ
    s = s.replace('\u0640', '')
    # ALEF variants → ا
    s = re.sub(r'[إأآا]', 'ا', s)
    # Collapse double ا → single (OCR "اال" → "ال")
    s = re.sub(r'اا+', 'ا', s)
    # YAA variants → ي
    s = s.replace('ى', 'ي')
    # HAMZA on letters → drop
    s = s.replace('ؤ', 'و').replace('ئ', 'ي').replace('ء', '')
    return s


# ==================== PROF PATTERNS ====================

# Each pattern returns (regex, group_index) where group is the prof name capture
# Applied to NORMALIZED text (so we can write simpler regex)

PROF_PATTERNS = [
    # AR: الأستاذ : X (handle OCR variants: الاستاذ, الاستا, الأستاذ, الاستادة, الاستا)
    (r'(?:ال(?:استا[اذ]|ا?(?:ستاذ|استاذ)ة?))\s*[:：]?\s+([\u0600-\u06FF][\u0600-\u06FF\s]{3,50}?)(?=\s*(?:\n|$|\s{2,}))', 1),
    # AR: أ. X or إ. X (after norm: ا. X or ي. X)
    (r'(?:^|\s)(?:ا|ي)\.\s+([\u0600-\u06FF][\u0600-\u06FF\s]{3,50}?)(?=\s*(?:\n|$|\s{2,}))', 1),
    # AR: من إعداد الأستاذ X
    (r'من\s+اعداد\s+(?:ال(?:استا[اذ]|ا?(?:ستاذ|استاذ)ة?))?\s*([\u0600-\u06FF][\u0600-\u06FF\s]{3,50}?)(?=\s*(?:\n|$|\s{2,}))', 1),
    # AR: إعداد الأستاذ(ة) X
    (r'اعداد\s+(?:ال(?:استا[اذ]|ا?(?:ستاذ|استاذ)ة?))\s+([\u0600-\u06FF][\u0600-\u06FF\s]{3,50}?)(?=\s*(?:\n|$|\s{2,}))', 1),
    # FR/EN: M./Mme/Mlle/Prof/Mr/Ms/Med X
    (r'(?:^|\s)M(?:r|me|lle|\.)(?:\s+|\.\s+)([A-Z][A-Za-z\u00C0-\u024F][\w\s\u00C0-\u024F\-]{2,50}?)(?=\s*(?:\n|$|\s{2,}))', 1),
    (r'(?:^|\s)Prof(?:esseur)?(?:\s+|\.\s+)([A-Z][A-Za-z\u00C0-\u024F][\w\s\u00C0-\u024F\-]{2,50}?)(?=\s*(?:\n|$|\s{2,}))', 1),
    (r'(?:^|\s)Ms\.?\s+([A-Z][A-Za-z\u00C0-\u024F][\w\s\u00C0-\u024F\-]{2,50}?)(?=\s*(?:\n|$|\s{2,}))', 1),
    # TN: Med (Monsieur in Tunisian convention - actually "M." OCR-degraded to "Med")
    (r'(?:^|\s)Med\.?\s+([A-Z][A-Za-z\u00C0-\u024F][\w\s\u00C0-\u024F\-]{2,50}?)(?=\s*(?:\n|$|\s{2,}))', 1),
    # AR: اعداد بواسطة X
    (r'اعداد\s+بواسطة\s+([\u0600-\u06FF][\u0600-\u06FF\s]{3,50}?)(?=\s*(?:\n|$|\s{2,}))', 1),
]


def is_valid_prof(name):
    """Validate that a candidate prof name is sensible."""
    if not name:
        return False
    name = name.strip()
    # Must have at least 2 words (first + last) or be 7+ chars
    words = name.split()
    if len(words) < 2 and len(name) < 7:
        return False
    # Reject if contains common non-name words
    bad = {'التلاميذ', 'الصف', 'القسم', 'المستوى', 'السنة', 'تلاميذ', 'الفصل', 'المدرسة',
           'اعدادية', 'ثانوية', 'معهد', 'كلية', 'الفرنسية', 'العربية', 'الانقليزية', 'الانجليزية',
           'فيزياء', 'رياضيات', 'علوم', 'مادة', 'الفرض', 'الدرس', 'السنة الدراسية', 'الفوج'}
    for w in words:
        if w.strip() in bad:
            return False
    # Reject if too long (likely not a name)
    if len(name) > 60:
        return False
    return True


def clean_prof_name(name):
    """Clean up prof name: trim, capitalize properly, etc."""
    if not name:
        return ''
    name = name.strip()
    # Remove trailing punctuation
    name = re.sub(r'[\s\.\,،\:]+$', '', name)
    # Collapse multiple spaces
    name = re.sub(r'\s+', ' ', name).strip()
    return name


def extract_prof(text, header_size=1500):
    """Extract prof name from header of OCR text."""
    if not text:
        return ''
    header = text[:header_size]
    header_norm = norm_ar(header)
    
    for pattern, group in PROF_PATTERNS:
        m_match = re.search(pattern, header_norm, re.MULTILINE)
        if m_match:
            name = clean_prof_name(m_match.group(group))
            if is_valid_prof(name):
                return name
    return ''


# ==================== SCHOOL PATTERNS ====================

SCHOOL_PATTERNS = [
    # AR: المدرسة (ال)(اعدادية|إعدادية) X - match all OCR variants:
    # "المدرسة الاعدادية X", "الاعدادية X", "العدادية X" (corrupted), "اعدادية X"
    (r'(?:المدرس[ةه]?\s*)?(?:ال)?(?:ال)?(?:ال)?(?:ال)?(?:اعدادي[ةه]|الاعدادي[ةه]|الإعدادي[ةه]|عدادي[ةه])\s+([\u0600-\u06FF][\u0600-\u06FF\s]{3,60}?)(?=\s*(?:\n|-|$))', 1),
    # AR: ثانوية X (lycée)
    (r'(?:المعهد|ثانوي[ةه]|الثانوي[ةه])\s+([\u0600-\u06FF][\u0600-\u06FF\s]{3,60}?)(?=\s*(?:\n|-|$))', 1),
    # AR: مدرسة X (generic, but only if no specific level matched)
    (r'(?:المدرس[ةه]|مدرس[ةه])\s+([\u0600-\u06FF][\u0600-\u06FF\s]{3,60}?)(?=\s*(?:\n|-|$))', 1),
    # FR: Collège/Lycée pilote (the school name IS just "Pilote" - generic)
    (r'(?:Coll[eè]ge|Lyc[eé]e)\s+([Pp]ilote)(?=\s*(?:\n|-|$|\s*\(|\s*\d))', 1),
    # FR: École X (specific private school name)
    (r'[EÉ]cole\s+([A-Z][A-Za-z\u00C0-\u024F][\w\s\u00C0-\u024F\-]{2,60}?)(?=\s*(?:\n|-|\(|:|$))', 1),
]


def is_valid_school(name):
    if not name:
        return False
    name = name.strip()
    # Must have at least 2 chars
    if len(name) < 3:
        return False
    # Reject common non-school phrases
    bad = {'في', 'من', 'إلى', 'على', 'كل', 'بعض', 'هذا', 'هذه', 'تلك', 'هنا', 'هناك',
           'الفرض', 'الدرس', 'السنة', 'الصف', 'القسم', 'المستوى', 'الفوج'}
    words = name.split()
    for w in words[:3]:
        if w.strip() in bad:
            return False
    if len(name) > 80:
        return False
    return True


def clean_school_name(name):
    if not name:
        return ''
    name = name.strip()
    name = re.sub(r'[\s\.\,،\:]+$', '', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name


def extract_school(text, header_size=1500):
    if not text:
        return ''
    header = text[:header_size]
    header_norm = norm_ar(header)
    
    for pattern, group in SCHOOL_PATTERNS:
        m_match = re.search(pattern, header_norm, re.MULTILINE)
        if m_match:
            name = clean_school_name(m_match.group(group))
            if is_valid_school(name):
                return name
    return ''


# ==================== MAIN ====================

def clean_control(s):
    s = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', s) if s else ''
    return s.replace("'", "''").replace("\\", "\\\\")


def main():
    print('Loading Physique collège resources...', flush=True)
    r = m.neon_query('''
    SELECT r.id, r."numericId", r."teacherNameAr", r."schoolName", r.language, r."schoolType",
           rm."profNames", rm."schoolName" as rm_school
    FROM "Resource" r
    JOIN "Subject" s ON s.id = r."subjectId"
    JOIN "Class" c ON c.id = r."classId"
    LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    WHERE s.slug = 'physique' AND c.slug IN ('7eme','8eme','9eme')
    ORDER BY r."numericId"::int
    ''')
    rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
    print(f'Total: {len(rows)}', flush=True)

    # Get OCR text for all
    print('Loading OCR text...', flush=True)
    rids = [r[0] for r in rows]
    rids_csv = "'" + "','".join(rids) + "'"
    rc = m.neon_query(f"SELECT rc.\"resourceId\", rc.\"fullText\" FROM \"ResourceContent\" rc WHERE rc.\"resourceId\" IN ({rids_csv})")
    texts = {row[0]: (row[1] or '') for row in rc.get('response', [{}])[0].get('data', {}).get('rows', [])}
    print(f'Got text for {len(texts)}/{len(rids)} resources', flush=True)

    # Extract prof + school for each
    changes = []  # (rid, nid, new_prof, new_school, new_rm_prof, new_rm_school, old_prof, old_school, old_rm_prof, old_rm_school, lang, st)
    no_text = 0
    for rid, nid, old_prof, old_school, lang, st, old_rm_prof, old_rm_school in rows:
        text = texts.get(rid, '')
        if not text or len(text) < 50:
            no_text += 1
            continue

        new_prof = extract_prof(text) if (lang == 'ar' or not old_prof) else ''
        new_school = extract_school(text) if not old_school else ''

        # PRUDENT: only set if currently empty
        if not new_prof and not new_school:
            continue

        changes.append((
            rid, nid,
            old_prof or '', old_school or '',
            new_prof, new_school,
            old_rm_prof, old_rm_school,
            lang, st
        ))

    print(f'\nExtracted candidates: {len(changes)}')
    print(f'  No text: {no_text}')

    if not changes:
        print('No changes needed!')
        return

    # Show samples
    print('\nSample extractions (10):')
    for c in changes[:10]:
        rid, nid, old_prof, old_school, new_prof, new_school, old_rm_prof, old_rm_school, lang, st = c
        print(f'  #{nid} [{st}/{lang}]')
        if new_prof:
            print(f'    prof: {old_prof!r} → {new_prof!r}')
        if new_school:
            print(f'    school: {old_school!r} → {new_school!r}')

    # Apply updates (PRUDENT: only fill NULL/empty fields)
    print(f'\nApplying {len(changes)} updates (PRUDENT mode)...', flush=True)
    BATCH = 50
    ok = 0
    fail = 0
    start = time.time()

    for i in range(0, len(changes), BATCH):
        batch = changes[i:i+BATCH]
        for c in batch:
            rid, nid, old_prof, old_school, new_prof, new_school, old_rm_prof, old_rm_school, lang, st = c
            try:
                # Update Resource
                updates = []
                if new_prof and not old_prof:
                    updates.append(f"\"teacherNameAr\" = '{clean_control(new_prof)}'")
                if new_school and not old_school:
                    updates.append(f"\"schoolName\" = '{clean_control(new_school)}'")
                
                if updates:
                    sql = f"UPDATE \"Resource\" SET {', '.join(updates)} WHERE id = '{rid}'"
                    m.neon_query(sql)
                
                # Update ResourceMetadata (only fill if currently empty/null)
                rm_updates = []
                if new_prof and not old_rm_prof:
                    # profNames is a String[] - need to update via JSON or escape
                    # Use a simple approach: cast to text[] via single quote
                    prof_escaped = clean_control(new_prof)
                    rm_updates.append(f"\"profNames\" = ARRAY['{prof_escaped}']::text[]")
                if new_school and not old_rm_school:
                    school_escaped = clean_control(new_school)
                    rm_updates.append(f"\"schoolName\" = '{school_escaped}'")
                
                if rm_updates:
                    # Use UPSERT in case metadata doesn't exist
                    sql_check = f"SELECT id FROM \"ResourceMetadata\" WHERE \"resourceId\" = '{rid}'"
                    result = m.neon_query(sql_check)
                    existing = result.get('response', [{}])[0].get('data', {}).get('rows', [])
                    if existing:
                        sql = f"UPDATE \"ResourceMetadata\" SET {', '.join(rm_updates)} WHERE \"resourceId\" = '{rid}'"
                    else:
                        cols = ['"resourceId"']
                        vals = [f"'{rid}'"]
                        for u in rm_updates:
                            col, val = u.split(' = ', 1)
                            cols.append(col)
                            vals.append(val)
                        sql = f"INSERT INTO \"ResourceMetadata\" ({', '.join(cols)}) VALUES ({', '.join(vals)})"
                    m.neon_query(sql)
                
                ok += 1
            except Exception as e:
                fail += 1
                if fail < 5:
                    print(f'  Fail #{nid}: {str(e)[:120]}')

        elapsed = time.time() - start
        rate = (i + BATCH) / elapsed if elapsed > 0 else 0
        print(f'  [{min(i+BATCH, len(changes))}/{len(changes)}] OK={ok} FAIL={fail} ({rate:.1f}/s)', flush=True)

    print(f'\nDONE: {ok} updated, {fail} failed in {time.time()-start:.0f}s')


if __name__ == '__main__':
    main()
