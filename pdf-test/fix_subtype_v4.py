#!/usr/bin/env python3
"""
Fix HOMEWORK titles v4 - ONLY change TYPO cases, not already-correct ones.

Rules:
- "Devoir de synthèse" (lowercase s) + subtype=SYNTHESE/SYNTHESIS → no change (correct)
- "Devoir de synthèse" (lowercase s) + subtype=CONTROLE/CONTROL → CHANGE to "Devoir de Contrôle" (mismatch fix)
- "Devoir de Syntése" (é typo) + any → "Devoir de {correct_subtype}"
- "Devoir de Snthèse" (typo) + any → "Devoir de {correct_subtype}"
- "Devoir de Contôle" (ô typo) + subtype=HOUSEWORK → "Devoir de Maison" (mismatch fix)
- "Devoir de synthéses" (typo) + any → "Devoir de {correct_subtype}"
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

def transform_title(title, subtype_label, subtype_norm):
    if not title or ARABIC_RE.search(title):
        return None
    
    title_lower = title.lower()
    
    # Skip short codes entirely
    if len(title) < 25 and not re.search(r'Devoir', title, re.IGNORECASE):
        return None
    
    # Pattern 1: "Devoir de synthèse" (lowercase s) + subtype=CONTROLE/CONTROL (MISMATCH)
    if re.match(r'^Devoir\s+de\s+sy[nt]th[èée]se\s+', title, re.IGNORECASE) and subtype_norm == 'CONTROLE':
        return re.sub(r'^Devoir\s+de\s+sy[nt]th[èée]se\s+', f'Devoir de {subtype_label} ', title, count=1, flags=re.IGNORECASE)
    
    # Pattern 2: "Devoir de synthèse" + subtype=SYNTHESE/SYNTHESIS → standardize to "Devoir de Synthèse"
    if re.match(r'^Devoir\s+de\s+sy[nt]th[èée]se\s+', title, re.IGNORECASE) and subtype_norm == 'SYNTHESE':
        # Standardize capitalization
        return re.sub(r'^Devoir\s+de\s+sy[nt]th[èée]se\s+', f'Devoir de {subtype_label} ', title, count=1, flags=re.IGNORECASE)
    
    # Pattern 3: "Devoir de Syntése" (é typo, missing h) + subtype=SYNTHESE/HOMEWORK
    # This is when title is mistyped "Syntése" instead of "Synthèse"
    if re.match(r'^Devoir\s+de\s+sy[nt][èée]se\s+', title, re.IGNORECASE):
        # "sy_tèse" without h - likely typo of "Synthèse"
        if subtype_norm == 'HOMEWORK':
            return re.sub(r'^Devoir\s+de\s+sy[nt][èée]se\s+', f'Devoir de {subtype_label} ', title, count=1, flags=re.IGNORECASE)
    
    # Pattern 4: "Devoir de Snthèse" (n instead of n + missing h)
    if re.match(r'^Devoir\s+de\s+snth[èée]se\s+', title, re.IGNORECASE):
        return re.sub(r'^Devoir\s+de\s+snth[èée]se\s+', f'Devoir de {subtype_label} ', title, count=1, flags=re.IGNORECASE)
    
    # Pattern 5: "Devoir de Contôle" (ô typo missing) + subtype=HOUSEWORK (MISMATCH)
    if re.match(r'^Devoir\s+de\s+cont[oô]le\s+', title, re.IGNORECASE) and subtype_norm == 'HOMEWORK':
        return re.sub(r'^Devoir\s+de\s+cont[oô]le\s+', f'Devoir de {subtype_label} ', title, count=1, flags=re.IGNORECASE)
    
    # Pattern 6: "Devoir de synthèse" + subtype=CONTROLE
    if re.match(r'^Devoir\s+de\s+sy[nt]th[èée]se\s+', title, re.IGNORECASE) and subtype_norm == 'CONTROLE':
        return re.sub(r'^Devoir\s+de\s+sy[nt]th[èée]se\s+', f'Devoir de {subtype_label} ', title, count=1, flags=re.IGNORECASE)
    
    # Pattern 7: "Devoir de synthéses" (extra s) + subtype=CONTROLE
    if re.match(r'^Devoir\s+de\s+synth[èée]ses?\s+', title, re.IGNORECASE) and subtype_norm == 'CONTROLE':
        return re.sub(r'^Devoir\s+de\s+synth[èée]ses?\s+', f'Devoir de {subtype_label} ', title, count=1, flags=re.IGNORECASE)
    
    # Pattern 8: "Devoir de contr e" (typo space) + subtype=CONTROLE
    if re.match(r'^Devoir\s+de\s+contr\s+e\s+', title, re.IGNORECASE) and subtype_norm == 'CONTROLE':
        return re.sub(r'^Devoir\s+de\s+contr\s+e\s+', f'Devoir de {subtype_label} ', title, count=1, flags=re.IGNORECASE)
    
    # Pattern 9: "Devoir de synth se" (typo space) + subtype=CONTROLE
    if re.match(r'^Devoir\s+de\s+sy[nt]th\s+se\s+', title, re.IGNORECASE) and subtype_norm == 'CONTROLE':
        return re.sub(r'^Devoir\s+de\s+sy[nt]th\s+se\s+', f'Devoir de {subtype_label} ', title, count=1, flags=re.IGNORECASE)
    
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
        new_title = transform_title(title, label, norm)
        if not new_title or new_title == title:
            continue
        new_slug = to_slug(new_title)[:100] + f'-{nid}'
        updates.append({
            'nid': nid, 'rid': rid, 'old_title': title, 'new_title': new_title,
            'new_slug': new_slug, 'subtype': norm
        })
    return updates

def do_update(u):
    try:
        m.neon_query(f"""
            INSERT INTO "ResourceTitleBackup" 
            ("resourceId", "numericId", "oldTitle", "newTitle", "regeneratedBy", "regeneratedAt")
            VALUES ('{u["rid"]}', {u["nid"]}, $${u["old_title"]}$$, $${u["new_title"]}$$, 'fix_subtype_v4', NOW())
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
    print(f'Total: {len(updates)}')
    
    if not apply:
        from collections import Counter
        pref = Counter(u['old_title'][:30] for u in updates)
        print('\nDistribution by old prefix:')
        for k, v in pref.most_common(10):
            print(f'  "{k}": {v}')
        print('\nFirst 20 samples:')
        for u in updates[:20]:
            print(f'  NID {u["nid"]} [{u["subtype"]}]: {u["old_title"][:80]} → {u["new_title"][:80]}')
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
    
    print(f'\n✅ Fixed: {fixed}')
    print(f'❌ Errors: {errors}')

if __name__ == '__main__':
    main()
