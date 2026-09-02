#!/usr/bin/env python3
"""
Fix HOMEWORK titles to include the subtype (Contrôle/Synthèse/Révision).

Handles:
1. "Devoir N°X - ..." → "Devoir de {subtype} N°X - ..."
2. "Devoir - ..." → "Devoir de {subtype} - ..."
3. "Examen - ..." → "Devoir de {subtype} - ..." (in Tunisia, Examen = Devoir de Contrôle)
4. "Devoir de ..." or "Examen de ..." → already has subtype, skip

Skip:
- "Sujet Bac" (BAC_SUBJECT, not HOMEWORK)
- Already has subtype keyword
- type=BAC_SUBJECT
"""
import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import re

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

# Normalize DB subtype
SUBTYPE_NORMALIZE = {
    'CONTROLE': 'CONTROLE', 'CONTROL': 'CONTROLE', 'contrôle': 'CONTROLE', 'Contrôle': 'CONTROLE',
    'SYNTHESE': 'SYNTHESE', 'SYNTHESIS': 'SYNTHESE', 'synthèse': 'SYNTHESE', 'Synthèse': 'SYNTHESE',
    'HOUSEWORK': 'HOMEWORK', 'HOMEWORK': 'HOMEWORK',
    'REVISION': 'REVISION', 'EXAMEN': 'EXAMEN', 'SUMMARY': 'SUMMARY',
}

SUBTYPE_LABELS = {
    'CONTROLE': 'Contrôle',
    'SYNTHESE': 'Synthèse',
    'HOMEWORK': 'Homework',
    'REVISION': 'Révision',
    'EXAMEN': 'Examen',
    'SUMMARY': 'Résumé',
}

def transform_title(title, subtype_label, hwn=None):
    """Transform title to include subtype.
    
    Returns new title or None if no change needed.
    """
    if not title:
        return None
    
    title_lower = title.lower()
    
    # Skip if already has subtype keyword
    if 'contrôle' in title_lower or 'controle' in title_lower or 'synthèse' in title_lower or 'synthese' in title_lower or 'révision' in title_lower or 'revision' in title_lower:
        return None
    
    # Skip BAC_SUBJECT (these are real Bac exams, not devoirs)
    if title.startswith('Sujet Bac'):
        return None
    
    # Pattern 1: "Devoir N°X - ..."
    m1 = re.match(r'^Devoir\s+(de\s+)?(N°\d+|N\.\d+)(\s*-\s*)(.*)$', title, re.IGNORECASE)
    if m1:
        return f'Devoir de {subtype_label} {m1.group(2)} - {m1.group(4)}'
    
    # Pattern 2: "Devoir - ..."
    m2 = re.match(r'^Devoir\s+-\s+(.*)$', title, re.IGNORECASE)
    if m2:
        return f'Devoir de {subtype_label} - {m2.group(1)}'
    
    # Pattern 3: "Examen - ..."
    m3 = re.match(r'^Examen\s+-\s+(.*)$', title, re.IGNORECASE)
    if m3:
        return f'Devoir de {subtype_label} - {m3.group(1)}'
    
    # Pattern 4: "Examen N°X - ..."  
    m4 = re.match(r'^Examen\s+(N°\d+|N\.\d+)(\s*-\s*)(.*)$', title, re.IGNORECASE)
    if m4:
        return f'Devoir de {subtype_label} {m4.group(1)} - {m4.group(3)}'
    
    # Pattern 5: "Devoir ..." (just "Devoir" alone or with no dash yet)
    if re.match(r'^Devoir\s+', title, re.IGNORECASE):
        # Try to find any subject after Devoir
        m5 = re.match(r'^(Devoir)\s+(?!de\s)(.+)$', title, re.IGNORECASE)
        if m5:
            return f'Devoir de {subtype_label} {m5.group(2)}'
    
    return None

def main():
    apply = '--apply' in sys.argv
    
    # Get all HOMEWORK
    r = m.neon_query("""
        SELECT r."numericId", r.id, r.title, r."homeworkSubtype", r."homeworkNumber",
          sub.slug as db_subj, c.slug as cls, sec.slug as sec
        FROM "Resource" r
        LEFT JOIN "Subject" sub ON sub.id = r."subjectId"
        LEFT JOIN "Class" c ON c.id = r."classId"
        LEFT JOIN "Section" sec ON sec.id = r."sectionId"
        WHERE r.status = 'PUBLISHED' AND r.type = 'HOMEWORK'
    """)
    
    updates = []
    skipped = {'already_has': 0, 'bac_subject': 0, 'no_change': 0, 'no_subtype': 0, 'not_devoir': 0}
    
    for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
        nid, rid, title, hst, hwn, db_subj, cls, sec = row
        if not title or not hst:
            skipped['no_subtype'] += 1
            continue
        
        # Normalize
        norm = SUBTYPE_NORMALIZE.get(hst, hst)
        if norm not in SUBTYPE_LABELS:
            continue
        label = SUBTYPE_LABELS[norm]
        
        # Check if title has subtype already
        title_lower = title.lower()
        if 'contrôle' in title_lower or 'controle' in title_lower or 'synthèse' in title_lower or 'synthese' in title_lower or 'révision' in title_lower or 'revision' in title_lower:
            skipped['already_has'] += 1
            continue
        
        # Skip BAC_SUBJECT
        if title.startswith('Sujet Bac'):
            skipped['bac_subject'] += 1
            continue
        
        # Transform
        new_title = transform_title(title, label, hwn)
        if not new_title or new_title == title:
            skipped['not_devoir'] += 1
            continue
        
        new_slug = to_slug(new_title)[:100]
        updates.append({
            'nid': nid, 'rid': rid, 'old_title': title, 'new_title': new_title,
            'new_slug': new_slug, 'subtype': norm, 'old_type_prefix': title.split()[0]
        })
    
    print(f'Total HOMEWORK: {len(updates) + sum(skipped.values())}')
    print(f'  To update: {len(updates)}')
    print(f'  Skipped: {sum(skipped.values())}')
    for k, v in skipped.items():
        print(f'    {k}: {v}')
    
    # Distribution by old prefix
    from collections import Counter
    pref = Counter(u['old_type_prefix'] for u in updates)
    print(f'\nDistribution by old prefix:')
    for p, c in pref.most_common():
        print(f'  {p}: {c}')
    
    if not apply:
        print(f'\n*** DRY RUN - first 10 ***')
        for u in updates[:10]:
            print(f'\n  NID {u["nid"]} ({u["subtype"]}):')
            print(f'    Old: {u["old_title"][:90]}')
            print(f'    New: {u["new_title"]}')
        return
    
    # Apply
    print(f'\nApplying {len(updates)} updates...')
    fixed = 0
    errors = 0
    for i, u in enumerate(updates, 1):
        try:
            # Backup
            m.neon_query(f"""
                INSERT INTO "ResourceTitleBackup" 
                ("resourceId", "numericId", "oldTitle", "newTitle", "regeneratedBy", "regeneratedAt")
                VALUES ('{u["rid"]}', {u["nid"]}, $${u["old_title"]}$$, $${u["new_title"]}$$, 'fix_subtype_v2', NOW())
                ON CONFLICT ("resourceId") DO UPDATE SET
                    "oldTitle" = EXCLUDED."oldTitle",
                    "newTitle" = EXCLUDED."newTitle",
                    "regeneratedBy" = EXCLUDED."regeneratedBy",
                    "regeneratedAt" = EXCLUDED."regeneratedAt"
            """)
            
            # Update
            m.neon_query(f"""
                UPDATE "Resource" 
                SET title = $${u["new_title"]}$$,
                    slug = '{u["new_slug"]}',
                    "updatedAt" = NOW()
                WHERE id = '{u["rid"]}'
            """)
            fixed += 1
        except Exception as e:
            errors += 1
            if errors <= 3:
                print(f'  [ERR] NID {u["nid"]}: {str(e)[:200]}')
        
        if i % 300 == 0:
            print(f'  [{i}/{len(updates)}] done', flush=True)
    
    print(f'\n✅ Fixed: {fixed}')
    print(f'❌ Errors: {errors}')

if __name__ == '__main__':
    main()
