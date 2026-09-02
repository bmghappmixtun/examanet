#!/usr/bin/env python3
"""
Fix HOMEWORK titles v5 - ONLY fix actual mismatches, not cosmetic changes.

A mismatch is: title contains word for subtype A, but DB has subtype B.
Example: title "Devoir de synthèse" + DB CONTROLE = MISMATCH (synthèse ≠ contrôle)
Example: title "Devoir de Synthèse" + DB SYNTHESE = MATCH (no change)
"""
import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

def to_slug(s):
    s = s.lower()
    for old, new in [('é','e'),('è','e'),('ê','e'),('à','a'),('â','a'),('î','i'),
                     ('ô','o'),('ù','u'),('ç','c'),('ñ','n')]:
        s = s.replace(old, new)
    s = s.replace('\u2019', '').replace("'", '').replace('"', '')
    s = re.sub(r'[^a-z0-9\s-]', ' ', s)
    s = re.sub(r'\s+', '-', s)
    s = re.sub(r'-+', '-', s)
    return s.strip('-')

SUBTYPE_NORMALIZE = {
    'CONTROLE': 'CONTROLE', 'CONTROL': 'CONTROLE',
    'SYNTHESE': 'SYNTHESE', 'SYNTHESIS': 'SYNTHESE',
    'HOUSEWORK': 'HOMEWORK', 'HOMEWORK': 'HOMEWORK',
    'REVISION': 'REVISION', 'EXAMEN': 'EXAMEN', 'SUMMARY': 'SUMMARY',
}

SUBTYPE_LABELS = {
    'CONTROLE': 'Contrôle', 'SYNTHESE': 'Synthèse', 'HOMEWORK': 'Maison',
    'REVISION': 'Révision', 'EXAMEN': 'Examen', 'SUMMARY': 'Résumé',
}

ARABIC_RE = re.compile(r'[\u0600-\u06FF]')

def detect_title_subtype(title):
    """Detect what subtype the title implies (returns normalized form or None)."""
    if not title:
        return None
    title_lower = title.lower()
    
    # Check for each subtype keyword
    if re.search(r'\bcontr[oô]l[ée]?\b', title_lower) or re.search(r'\bcontrol\b', title_lower) or 'ctr' in title_lower.split()[:3]:
        return 'CONTROLE'
    if re.search(r'\bsynt[èée]se', title_lower) or re.search(r'\bsynthesis\b', title_lower) or re.search(r'\bsynt\b', title_lower):
        return 'SYNTHESE'
    if 'maison' in title_lower:
        return 'HOMEWORK'
    if re.search(r'\br[ée]vision\b', title_lower):
        return 'REVISION'
    if 'examen' in title_lower.split()[:3]:  # only if at start
        return 'EXAMEN'
    if 'tp' in title_lower.split()[:3]:
        return None  # TP is not a standard subtype
    return None

def transform_title(title, subtype_label, subtype_norm, current_title_subtype):
    """Transform title. Only act if current_title_subtype is DIFFERENT from subtype_norm (mismatch)."""
    if not title or ARABIC_RE.search(title):
        return None
    
    title_lower = title.lower()
    
    # Skip short codes
    if len(title) < 20 and not re.search(r'Devoir', title, re.IGNORECASE):
        return None
    
    # If title already has correct subtype, no change needed (case-insensitive)
    if current_title_subtype == subtype_norm:
        return None
    
    # Mismatch detected - apply transformation
    
    # Pattern: "Devoir de <wrong_subtype> N°X - Y" or "Devoir de <wrong_subtype> - Y"
    # Replace "<wrong_subtype>" with the correct one
    
    # Common typo patterns to replace:
    typo_replacements = [
        (r'^Devoir\s+de\s+sy[nt]th[èée]se\s+', f'Devoir de {subtype_label} '),  # synthèse typo
        (r'^Devoir\s+de\s+cont[oô]l[ée]?\s+', f'Devoir de {subtype_label} '),  # contrôle typo
        (r'^Devoir\s+de\s+contr\s+e\s+', f'Devoir de {subtype_label} '),  # contr e typo
        (r'^Devoir\s+de\s+maison\s+', f'Devoir de {subtype_label} '),  # maison → subtype
        (r'^Devoir\s+de\s+r[èe]vision\s+', f'Devoir de {subtype_label} '),  # révision → subtype
    ]
    
    for pat, repl in typo_replacements:
        if re.match(pat, title, re.IGNORECASE):
            return re.sub(pat, repl, title, count=1, flags=re.IGNORECASE)
    
    return None

def fetch_all():
    r = m.neon_query("""
        SELECT r."numericId", r.id, r.title, r."homeworkSubtype"
        FROM "Resource" r
        WHERE r.status = 'PUBLISHED' AND r.type = 'HOMEWORK'
          AND r."homeworkSubtype" IS NOT NULL
    """)
    rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
    updates = []
    for nid, rid, title, hst in rows:
        if not title or not hst:
            continue
        norm = SUBTYPE_NORMALIZE.get(hst, hst)
        if norm not in SUBTYPE_LABELS:
            continue
        label = SUBTYPE_LABELS[norm]
        
        # Detect what subtype the title currently has
        current_subtype = detect_title_subtype(title)
        
        # Only process if there's a mismatch
        if current_subtype == norm:
            continue  # already correct
        
        new_title = transform_title(title, label, norm, current_subtype)
        if not new_title or new_title == title:
            continue
        # Only apply CONTROLE mismatches (real DB says Contrôle but title says Synthèse)
        # Skip cosmetic SYNTHESE fixes (just capitalize)
        if norm != 'CONTROLE':
            continue
            continue
        new_slug = to_slug(new_title)[:100] + f'-{nid}'
        updates.append({
            'nid': nid, 'rid': rid, 'old_title': title, 'new_title': new_title,
            'new_slug': new_slug, 'subtype': norm, 'old_subtype': current_subtype
        })
    return updates

def do_update(u):
    try:
        m.neon_query(f"""
            INSERT INTO "ResourceTitleBackup" 
            ("resourceId", "numericId", "oldTitle", "newTitle", "regeneratedBy", "regeneratedAt")
            VALUES ('{u["rid"]}', {u["nid"]}, $${u["old_title"]}$$, $${u["new_title"]}$$, 'fix_subtype_v5', NOW())
            ON CONFLICT ("resourceId") DO UPDATE SET
                "oldTitle" = EXCLUDED."oldTitle",
                "newTitle" = EXCLUDED."newTitle",
                "regeneratedBy" = EXCLUDED."regeneratedBy",
                "regeneratedAt" = EXCLUDED."regeneratedAt"
        """)
        m.neon_query(f"""
            UPDATE "Resource" 
            SET title = $${u["new_title"]}$$,
                slug = '{u["new_slug"]}',
                "updatedAt" = NOW()
            WHERE id = '{u["rid"]}'
        """)
        return (u['nid'], True, None)
    except Exception as e:
        return (u['nid'], False, str(e)[:200])

def main():
    apply = '--apply' in sys.argv
    
    print('Fetching...')
    updates = fetch_all()
    print(f'Total mismatches: {len(updates)}')
    
    if not apply:
        from collections import Counter
        pref = Counter(f'{u["old_subtype"]}→{u["subtype"]}' for u in updates)
        print('\nDistribution of mismatches:')
        for k, v in pref.most_common():
            print(f'  {k}: {v}')
        print('\nFirst 30 samples:')
        for u in updates[:30]:
            print(f'  NID {u["nid"]}: {u["old_subtype"]}→{u["subtype"]}: {u["old_title"][:80]}')
            print(f'    → {u["new_title"]}')
        return
    
    fixed = 0
    errors = 0
    print(f'Processing {len(updates)} with 8 workers...')
    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = {ex.submit(do_update, u): u for u in updates}
        for i, fut in enumerate(as_completed(futures), 1):
            nid, ok, err = fut.result()
            if ok:
                fixed += 1
            else:
                errors += 1
                if errors <= 3:
                    print(f'  ERR NID {nid}: {err}')
            if i % 50 == 0:
                print(f'  [{i}/{len(updates)}]', flush=True)
    
    print(f'\n✅ Fixed: {fixed}')
    print(f'❌ Errors: {errors}')

if __name__ == '__main__':
    main()
