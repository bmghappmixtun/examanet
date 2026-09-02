#!/usr/bin/env python3
"""
Fix HOMEWORK titles to include the subtype (Contrôle/Synthèse/Révision).

The DB has homeworkSubtype but the title might be missing it.
For 3799 cases, add the subtype label to the title.
"""
import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import csv
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

TYPE_LABELS = {
    'HOMEWORK': 'Devoir', 'EXERCISE': "Série d'exercices", 'COURSE': 'Cours',
    'OTHER': 'Document', 'SUMMARY': 'Résumé', 'BAC_SUBJECT': 'Sujet Bac',
}

def insert_subtype(title, subtype_label):
    """Insert subtype label into the title after the Type word.
    
    Title patterns:
    - "Devoir N°2 - Mathématiques - 4AS - 2024-2025" → "Devoir de Contrôle N°2 - Mathématiques - 4AS - 2024-2025"
    - "Devoir - Physique - 2AS Sciences - Trim1" → "Devoir de Contrôle - Physique - 2AS Sciences - Trim1"
    - "Série d'exercices - ..." → no change (not a homework)
    - "Examen - ..." → no change (already has type indicator)
    - "Cours - ..." → no change
    """
    # Only insert if title starts with "Devoir" (not "Examen" or "Cours" or "Série")
    if not title.startswith('Devoir'):
        return title  # Not a generic "Devoir" - skip
    
    # Check if subtype already in title
    title_lower = title.lower()
    if 'contrôle' in title_lower or 'controle' in title_lower or 'synthèse' in title_lower or 'synthese' in title_lower:
        return title  # Already has subtype
    
    # Insert "de {subtype_label}" after "Devoir" (or "Devoir N°X")
    if re.match(r'^Devoir\s+N°\d+', title):
        # "Devoir N°X - ..." → "Devoir de {label} N°X - ..."
        return re.sub(r'^(Devoir)(\s+N°\d+)', rf'\1 de {subtype_label}\2', title, count=1)
    elif title.startswith('Devoir '):
        # "Devoir - ..." → "Devoir de {label} - ..."
        return re.sub(r'^(Devoir)(\s)', rf'\1 de {subtype_label}\2', title, count=1)
    elif title.startswith('Devoir'):
        # "Devoir" (just the word)
        return f'Devoir de {subtype_label}'
    
    return title

def main():
    apply = '--apply' in sys.argv
    
    # Get all HOMEWORK with their subtype
    r = m.neon_query("""
        SELECT r."numericId", r.id, r.title, r."homeworkSubtype", r."homeworkNumber",
          sub.slug as db_subj, c.slug as cls, sec.slug as sec, r.year, r.trimester
        FROM "Resource" r
        LEFT JOIN "Subject" sub ON sub.id = r."subjectId"
        LEFT JOIN "Class" c ON c.id = r."classId"
        LEFT JOIN "Section" sec ON sec.id = r."sectionId"
        WHERE r.status = 'PUBLISHED' AND r.type = 'HOMEWORK'
    """)
    
    # Process each
    updates = []
    for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
        nid, rid, title, hst, hwn, db_subj, cls, sec, year, trim = row
        if not title or not hst:
            continue
        
        # Normalize
        norm = SUBTYPE_NORMALIZE.get(hst, hst)
        if norm not in SUBTYPE_LABELS:
            continue
        label = SUBTYPE_LABELS[norm]
        
        # Check if title has subtype
        new_title = insert_subtype(title, label)
        if new_title != title:
            new_slug = to_slug(new_title)[:100]
            updates.append({
                'nid': nid, 'rid': rid, 'old_title': title, 'new_title': new_title,
                'new_slug': new_slug, 'subtype': norm
            })
    
    print(f'Total to update: {len(updates)}')
    
    if not apply:
        print(f'\n*** DRY RUN - first 10 ***')
        for u in updates[:10]:
            print(f'\n  NID {u["nid"]}:')
            print(f'    Old: {u["old_title"][:90]}')
            print(f'    New: {u["new_title"]}')
        print(f'\nUse --apply to actually update {len(updates)} resources')
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
                VALUES ('{u["rid"]}', {u["nid"]}, $${u["old_title"]}$$, $${u["new_title"]}$$, 'fix_subtype_in_title', NOW())
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
        
        if i % 200 == 0:
            print(f'  [{i}/{len(updates)}] done', flush=True)
    
    print(f'\n✅ Fixed: {fixed}')
    print(f'❌ Errors: {errors}')

if __name__ == '__main__':
    main()
