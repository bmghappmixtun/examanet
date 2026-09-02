#!/usr/bin/env python3
"""
Fast batch fix of HOMEWORK titles to include the subtype.

Uses single SQL statement per update: INSERT ... ON CONFLICT + UPDATE in one HTTP call
Actually we need 2 calls per resource (no way around it for separate tables)
But: skip slug collision check (use NID in slug) = save 1 call
And: build all data upfront = save lookups
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
    s = s.replace('’', '').replace("'", '').replace('"', '')
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
    'CONTROLE': 'Contrôle', 'SYNTHESE': 'Synthèse', 'HOMEWORK': 'Homework',
    'REVISION': 'Révision', 'EXAMEN': 'Examen', 'SUMMARY': 'Résumé',
}

def transform_title(title, subtype_label):
    if not title:
        return None
    title_lower = title.lower()
    if 'contrôle' in title_lower or 'controle' in title_lower or 'synthèse' in title_lower or 'synthese' in title_lower or 'révision' in title_lower or 'revision' in title_lower:
        return None
    if title.startswith('Sujet Bac'):
        return None
    
    m1 = re.match(r'^Devoir\s+(de\s+)?(N°\d+|N\.\d+)(\s*-\s*)(.*)$', title, re.IGNORECASE)
    if m1:
        return f'Devoir de {subtype_label} {m1.group(2)} - {m1.group(3).strip("- ").strip() or m1.group(4)}'
    m2 = re.match(r'^Devoir\s+-\s+(.*)$', title, re.IGNORECASE)
    if m2:
        return f'Devoir de {subtype_label} - {m2.group(1)}'
    m3 = re.match(r'^Examen\s+-\s+(.*)$', title, re.IGNORECASE)
    if m3:
        return f'Devoir de {subtype_label} - {m3.group(1)}'
    m4 = re.match(r'^Examen\s+(N°\d+|N\.\d+)(\s*-\s*)(.*)$', title, re.IGNORECASE)
    if m4:
        return f'Devoir de {subtype_label} {m4.group(1)} - {m4.group(3)}'
    if re.match(r'^Devoir\s+', title, re.IGNORECASE):
        m5 = re.match(r'^(Devoir)\s+(?!de\s)(.+)$', title, re.IGNORECASE)
        if m5:
            return f'Devoir de {subtype_label} {m5.group(2)}'
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
        new_title = transform_title(title, label)
        if not new_title or new_title == title:
            continue
        new_slug = to_slug(new_title)[:100] + f'-{nid}'  # add NID to avoid collision check
        updates.append({
            'nid': nid, 'rid': rid, 'old_title': title, 'new_title': new_title,
            'new_slug': new_slug, 'subtype': norm
        })
    return updates

def do_update(u):
    """Single resource update: 2 queries (backup + update)"""
    try:
        # Combined: backup + update in one go using CTE? No - different tables
        # Do backup
        m.neon_query(f"""
            INSERT INTO "ResourceTitleBackup" 
            ("resourceId", "numericId", "oldTitle", "newTitle", "regeneratedBy", "regeneratedAt")
            VALUES ('{u["rid"]}', {u["nid"]}, $${u["old_title"]}$$, $${u["new_title"]}$$, 'fix_subtype_batch', NOW())
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
        for u in updates[:5]:
            print(f'  NID {u["nid"]}: {u["old_title"][:80]} → {u["new_title"]}')
        return
    
    # Use ThreadPoolExecutor for parallel HTTP requests
    fixed = 0
    errors = 0
    error_samples = []
    
    print(f'Processing {len(updates)} with 8 parallel workers...')
    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = {ex.submit(do_update, u): u for u in updates}
        for i, fut in enumerate(as_completed(futures), 1):
            nid, ok, err = fut.result()
            if ok:
                fixed += 1
            else:
                errors += 1
                if len(error_samples) < 3:
                    error_samples.append(f'NID {nid}: {err}')
            if i % 200 == 0:
                print(f'  [{i}/{len(updates)}] fixed={fixed} errors={errors}', flush=True)
    
    print(f'\n✅ Fixed: {fixed}')
    print(f'❌ Errors: {errors}')
    for e in error_samples:
        print(f'  {e}')

if __name__ == '__main__':
    main()
