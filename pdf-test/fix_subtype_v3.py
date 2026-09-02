#!/usr/bin/env python3
"""
Fix HOMEWORK titles v3 - handle edge cases missed by v2.

Patterns to fix:
1. "Devoir de Maison N°X" with subtype=CONTROLE/SYNTHESE → "Devoir de {Contrôle|Synthèse} N°X"
2. "Devoir de Examen" → "Devoir de {Contrôle|Synthèse}" 
3. "Devoir de syntèse" (typo) → "Devoir de Synthèse"
4. "Devoir de maison" (lowercase m) → if subtype=CONTROLE/SYNTHESE, replace
5. "Devoir de Syntése" (typo é) → "Devoir de Synthèse"
6. "Devoir de Contôle" (typo ô) → "Devoir de Contrôle"

Skip:
- Arabic titles
- Short codes (DC, DS, dev cont, syn reg, etc.)
- "Cours", "Correction", "Copie de"
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
    """Transform title to use correct subtype label."""
    if not title:
        return None
    if ARABIC_RE.search(title):
        return None  # Arabic - leave as is
    
    title_lower = title.lower()
    
    # Skip short codes
    if re.match(r'^(DC|DS|CTR|CT|SYN|CON|DEV|CTR|FIN|BAC|EXAM|COPIE|COUR|CORR)\s*\d', title, re.IGNORECASE):
        return None
    if 'devoir de bac blanc' in title_lower:
        return None
    
    # Already has correct subtype?
    title_lower_norm = title_lower
    for kw in ['contrôle', 'controle', 'synthèse', 'synthese', 'révision', 'revision', 'maison']:
        if kw in title_lower_norm:
            # Special case: "maison" only if subtype is REVISION/HOMEWORK
            if kw == 'maison' and subtype_norm in ('HOMEWORK', 'REVISION'):
                return None  # Already "Devoir de Maison" with correct subtype
            elif kw == 'maison' and subtype_norm in ('CONTROLE', 'SYNTHESE'):
                # "Devoir de Maison" but DB says Contrôle - replace
                pass  # Continue to replacement
            else:
                return None  # Has the right subtype word
    
    # Pattern 1: "Devoir de Maison N°X - Y" or "Devoir de Maison - Y" with subtype=CONTROLE/SYNTHESE
    m1 = re.match(r'^(Devoir\s+de\s+Maison)\s+(N°\d+|N\.\d+)\s+-\s+(.*)$', title, re.IGNORECASE)
    if m1 and subtype_norm in ('CONTROLE', 'SYNTHESE'):
        return f'Devoir de {subtype_label} {m1.group(2)} - {m1.group(3)}'
    m2 = re.match(r'^(Devoir\s+de\s+Maison)\s+-\s+(.*)$', title, re.IGNORECASE)
    if m2 and subtype_norm in ('CONTROLE', 'SYNTHESE'):
        return f'Devoir de {subtype_label} - {m2.group(2)}'
    # "Devoir de Maison N°X Lycée pilote..." 
    m3 = re.match(r'^(Devoir\s+de\s+Maison)\s+(N°\d+|N\.\d+)\s+(Lycée|Collège|pilote)(.*)$', title, re.IGNORECASE)
    if m3 and subtype_norm in ('CONTROLE', 'SYNTHESE'):
        return f'Devoir de {subtype_label} {m3.group(2)} {m3.group(3)}{m3.group(4)}'
    # Plain "Devoir de Maison" with no number
    m4 = re.match(r'^(Devoir\s+de\s+Maison)\s+(?!N°|N\.)(?!-\s)(.+)$', title, re.IGNORECASE)
    if m4 and subtype_norm in ('CONTROLE', 'SYNTHESE'):
        return f'Devoir de {subtype_label} {m4.group(2)}'
    
    # Pattern 2: "Devoir de Examen" (wrong - should be Contrôle/Synthèse)
    m5 = re.match(r'^(Devoir\s+de\s+Examen)(\s+Examen\s+de\s+TP\s+)?(N°\d+)?\s*(-\s*)?\s*(.*)$', title, re.IGNORECASE)
    if m5:
        parts = [f'Devoir de {subtype_label}']
        if m5.group(3):
            parts.append(m5.group(3))
        rest = m5.group(5)
        if rest:
            parts.append(f'- {rest}')
        return ' '.join(parts)
    
    # Pattern 3: "Devoir de syntèse" / "Devoir de Syntése" / "Devoir de Contôle" (typos)
    typo_patterns = [
        (r'^Devoir\s+de\s+syt[èe]se\s+', f'Devoir de {subtype_label} '),
        (r'^Devoir\s+de\s+syth[èe]se\s+', f'Devoir de {subtype_label} '),
        (r'^Devoir\s+de\s+Synt[èe]se\s+', f'Devoir de {subtype_label} '),
        (r'^Devoir\s+de\s+Syn[ée]se\s+', f'Devoir de {subtype_label} '),
        (r'^Devoir\s+de\s+Cont[oô]le\s+', f'Devoir de {subtype_label} '),
        (r'^Devoir\s+de\s+control\s+', f'Devoir de {subtype_label} '),
        (r'^Devoir\s+de\s+contôle\s+', f'Devoir de {subtype_label} '),
        (r'^Devoir\s+de\s+synth[ée]ses\s+', f'Devoir de {subtype_label} '),
    ]
    for pat, repl in typo_patterns:
        if re.match(pat, title, re.IGNORECASE):
            new = re.sub(pat, repl, title, count=1, flags=re.IGNORECASE)
            return new
    
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
            VALUES ('{u["rid"]}', {u["nid"]}, $${u["old_title"]}$$, $${u["new_title"]}$$, 'fix_subtype_v3', NOW())
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
        for u in updates[:15]:
            print(f'  NID {u["nid"]} [{u["subtype"]}]:')
            print(f'    Old: {u["old_title"][:100]}')
            print(f'    New: {u["new_title"]}')
        return
    
    fixed = 0
    errors = 0
    error_samples = []
    
    print(f'Processing {len(updates)} with 8 workers...')
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
            if i % 50 == 0:
                print(f'  [{i}/{len(updates)}] fixed={fixed} errors={errors}', flush=True)
    
    print(f'\n✅ Fixed: {fixed}')
    print(f'❌ Errors: {errors}')
    for e in error_samples:
        print(f'  {e}')

if __name__ == '__main__':
    main()
