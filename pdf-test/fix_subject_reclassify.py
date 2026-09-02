#!/usr/bin/env python3
"""
Reclassify Resource.subjectId to match AI.subject when:
- AI.subject is normalized to a valid subject
- AI.title mentions the same subject
- DB subject is different

Strategy:
1. Find candidates: AI.subject == AI.title's subject != DB.subject
2. Backup old subjectId to ResourceSubjectReclassify
3. UPDATE Resource.subjectId = AI.subject
4. Search vector trigger updates automatically
"""
import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import json
import re
from collections import Counter

AI_SUBJECT_TO_SLUG = {
    'mathématiques': 'mathematiques', 'mathematiques': 'mathematiques', 'math': 'mathematiques',
    'mathématique': 'mathematiques', 'الرياضيات': 'mathematiques', 'رياضيات': 'mathematiques',
    'physique': 'physique', 'physique-chimie': 'physique', 'physique chimie': 'physique',
    'sciences physiques': 'physique', 'sciences physique': 'physique',
    'chimie': 'physique', 'chimie et physique': 'physique', 'physique et chimie': 'physique',
    'chimie, physique': 'physique',
    'svt': 'svt', 'sciences de la vie et de la terre': 'svt', 'sciences naturelles': 'svt',
    'sciences': 'svt', 'sciences expérimentales': 'svt', 'sciences experimentales': 'svt',
    'biologie': 'svt',
    'français': 'francais', 'francais': 'francais', 'french': 'francais',
    'anglais': 'anglais', 'english': 'anglais',
    'allemand': '3eme-langue', 'langue allemande': '3eme-langue',
    'espagnol': '3eme-langue', 'italien': '3eme-langue', 'langue italienne': '3eme-langue',
    'arabe': 'arabe', 'اللغة العربية': 'arabe',
    'économie et gestion': 'economie', 'economie et gestion': 'economie',
    'economie-gestion': 'economie', 'économie-gestion': 'economie',
    'economie': 'economie', 'économie': 'economie', 'gestion': 'gestion',
    'économie & gestion': 'economie',
    'histoire': 'histoire', 'géographie': 'geographie', 'geographie': 'geographie',
    'تاريخ': 'histoire', 'جغرافيا': 'geographie',
    'philosophie': 'philosophie', 'فلسفة': 'philosophie',
    'pensée islamique': 'pensee-islamique', 'التفكير الإسلامي': 'pensee-islamique',
    'éducation islamique': 'education-islamique',
    'technologie': 'technologie', 'techniques': 'technologie', 'sciences techniques': 'technologie',
    'التربية التكنولوجية': 'technologie',
    'informatique': 'informatique', 'sciences de l\'informatique': 'informatique',
    'sciences informatiques': 'informatique', 'sciences de l\'information': 'informatique',
    'algorithmique et programmation': 'algo-prog', 'algorithme et programmation': 'algo-prog',
    'algo & prog': 'algo-prog', 'algorithme': 'algo-prog',
    'bases de données': 'bases-donnees',
    'système d\'exploitation et réseaux': 'systeme-exploitation-reseaux',
    'tic': 'tic',
    'éducation physique': 'sport', 'sport': 'sport',
    'électricité': 'physique', 'electricite': 'physique',
    'génie électrique': 'physique', 'genie electrique': 'physique',
    'génie mécanique': 'technologie', 'genie mecanique': 'technologie',
    'mécanique': 'physique', 'mecanique': 'physique',
    'mathématiques et sciences physiques': 'physique',
    'mathématiques et physique': 'physique',
}

SUBJECT_KEYWORDS = {
    'mathematiques': ['mathématique', 'math', 'رياضيات', 'الرياضيات'],
    'physique': ['physique', 'sciences phys', 'فيزياء', 'الفيزياء'],
    'svt': ['svt', 'sciences', 'biologie', 'علوم', 'البيولوجيا'],
    'technologie': ['techno', 'technologie', 'تكنولوجيا', 'تكنولوجية'],
    'informatique': ['info', 'informatique', 'algorithmique', 'برمجة', 'informat'],
    'algo-prog': ['algo', 'algorithmique'],
    'bases-donnees': ['base de données', 'bd', 'sql'],
    'tic': ['tic'],
    'francais': ['français', 'francais'],
    'anglais': ['anglais', 'english'],
    'arabe': ['arabe', 'عربية', 'عربي', 'اللغة العربية'],
    'economie': ['économie', 'economie', 'اقتصاد'],
    'gestion': ['gestion', 'تسيير', 'محاسبة'],
    'histoire': ['histoire', 'تاريخ'],
    'geographie': ['géo', 'geographie', 'géographie', 'جغرافيا'],
    'philosophie': ['philo', 'philosophie', 'فلسفة'],
    'pensee-islamique': ['pensée islamique', 'التفكير الإسلامي'],
    'sport': ['sport'],
    '3eme-langue': ['3ème langue', 'allemand', 'espagnol', 'italien', 'langue'],
}


def normalize_ai_subject(text):
    if not text:
        return None
    return AI_SUBJECT_TO_SLUG.get(text.lower().strip())


def get_subject_in_title(title, allowed_subjects=None):
    """Get the first subject mentioned in the title."""
    if not title:
        return None
    title_lower = title.lower()
    for subj_slug, keywords in SUBJECT_KEYWORDS.items():
        if allowed_subjects and subj_slug not in allowed_subjects:
            continue
        for kw in keywords:
            if kw in title_lower:
                return subj_slug
    return None


def main():
    apply = '--apply' in sys.argv
    limit = None
    for arg in sys.argv[1:]:
        if arg.startswith('--limit='):
            limit = int(arg.split('=')[1])
        elif arg.isdigit():
            limit = int(arg)
    
    # Get subject IDs
    r = m.neon_query('SELECT id, slug FROM "Subject"')
    subject_id_by_slug = {}
    for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
        subject_id_by_slug[row[1]] = row[0]
    
    # Find candidates: AI.subject == AI.title.suggested AND != DB.subject
    r = m.neon_query("""
        SELECT r.id, r."numericId", r.title, r.slug, s.slug as db_subject,
          s.id as db_subject_id, rm.subject as ai_subject, rme.title as ai_title
        FROM "Resource" r
        LEFT JOIN "Subject" s ON s.id = r."subjectId"
        LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
        LEFT JOIN "ResourceMetadataExtra" rme ON rme."resourceId" = r.id
        WHERE r.status = 'PUBLISHED' AND rm.id IS NOT NULL
          AND rm.subject IS NOT NULL AND rm.subject != ''
          AND rm.subject NOT IN ('système', 'inconnu', 'systeme')
          AND rme.title IS NOT NULL AND rme.title != ''
    """)
    rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])

    candidates = []
    skipped = 0
    for row in rows:
        rid, nid, db_title, slug, db_subject, db_subject_id, ai_subject, ai_title = row
        
        # Normalize AI subject
        ai_norm = normalize_ai_subject(ai_subject)
        if not ai_norm:
            continue
        
        # Get subject in AI title
        title_subject = get_subject_in_title(ai_title)
        if not title_subject:
            continue
        
        # Both must agree and be different from DB
        if ai_norm == title_subject and ai_norm != db_subject:
            candidates.append({
                'rid': rid, 'nid': nid, 'db_title': db_title[:60], 'ai_title': ai_title,
                'db_subject': db_subject, 'ai_subject': ai_subject,
                'ai_norm': ai_norm, 'db_subject_id': db_subject_id,
                'new_subject_id': subject_id_by_slug.get(ai_norm),
            })
        else:
            skipped += 1
    
    print(f'Total analyzed: {len(rows)}')
    print(f'Candidates (AI.subject == AI.title.suggested ≠ DB): {len(candidates)}')
    print(f'Skipped: {skipped}')
    if limit:
        candidates = candidates[:limit]
        print(f'Limited to: {limit}')
    
    # Distribution
    dist = Counter()
    for c in candidates:
        dist[f'{c["db_subject"]} → {c["ai_norm"]}'] += 1
    print()
    print('=== Distribution ===')
    for change, count in dist.most_common(15):
        print(f'  {change:<35} {count:>4}')
    
    # Samples
    print()
    print('=== First 10 samples ===')
    for c in candidates[:10]:
        print(f'  NID {c["nid"]}: {c["db_subject"]} → {c["ai_norm"]}')
        print(f'    AI title: {c["ai_title"][:80]}')
    
    if not apply:
        print(f'\n*** DRY RUN - use --apply to update ***')
        return
    
    # APPLY
    print(f'\n=== APPLYING {len(candidates)} changes ===')
    
    # Ensure backup table
    m.neon_query("""
        CREATE TABLE IF NOT EXISTS "ResourceSubjectReclassify" (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            "resourceId" TEXT NOT NULL,
            "numericId" INTEGER,
            "oldSubjectSlug" TEXT,
            "newSubjectSlug" TEXT,
            "aiSubject" TEXT,
            "aiTitle" TEXT,
            "changedAt" TIMESTAMP DEFAULT NOW(),
            "changedBy" TEXT
        )
    """)
    
    updated = 0
    errors = 0
    for i, c in enumerate(candidates, 1):
        try:
            if not c['new_subject_id']:
                errors += 1
                continue
            
            # Backup
            m.neon_query(f"""
                INSERT INTO "ResourceSubjectReclassify" 
                ("resourceId", "numericId", "oldSubjectSlug", "newSubjectSlug", "aiSubject", "aiTitle", "changedBy")
                VALUES ('{c["rid"]}', {c["nid"]}, '{c["db_subject"]}', '{c["ai_norm"]}', 
                        $${c["ai_subject"].replace("$", "")}$$, $${c["ai_title"][:200].replace("$", "")}$$, 'fix_subject_reclassify')
            """)
            
            # Update
            m.neon_query(f"""
                UPDATE "Resource" 
                SET "subjectId" = '{c["new_subject_id"]}', "updatedAt" = NOW()
                WHERE id = '{c["rid"]}'
            """)
            updated += 1
            
            if i % 50 == 0 or i == len(candidates):
                print(f'  [{i}/{len(candidates)}] done', flush=True)
        except Exception as e:
            errors += 1
            if errors <= 5:
                print(f'  [ERR] NID {c["nid"]}: {str(e)[:200]}')
    
    print(f'\n✅ Updated: {updated}')
    print(f'❌ Errors: {errors}')


if __name__ == '__main__':
    main()
