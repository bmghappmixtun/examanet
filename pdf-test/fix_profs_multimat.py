#!/usr/bin/env python3
"""
Fix profs with forbidden multi-subject combinations.

Strategy (per user):
1. For each forbidden prof, identify the MAIN subject (most common in resources)
2. Look at AI attributes to find the true subject of each non-main resource
3. CORRECT those resources to the main subject (we trust the AI that says 
   the prof's main subject is the canonical one)
4. Update teachingSubjects to [main_subject]
5. Backup old values

Read-only by default. Use --apply to execute.
"""
import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import json
from collections import Counter

ALLOWED_FAMILIES = [
    {'economie', 'gestion'},
    {'histoire', 'geographie'},
    {'informatique', 'algo-prog', 'bases-donnees', 'tic', 'systeme-exploitation-reseaux'},
]
EXPLICIT_FORBIDDEN = {
    'economie+informatique',
    'bases-donnees+gestion',
}

AI_SUBJECT_TO_SLUG = {
    'mathématiques': 'mathematiques', 'mathematiques': 'mathematiques', 'math': 'mathematiques',
    'physique': 'physique', 'physique-chimie': 'physique', 'sciences physiques': 'physique',
    'sciences physique': 'physique', 'chimie': 'physique', 'chimie et physique': 'physique',
    'chimie, physique': 'physique',
    'svt': 'svt', 'sciences de la vie et de la terre': 'svt', 'sciences naturelles': 'svt',
    'sciences': 'svt', 'sciences expérimentales': 'svt', 'sciences experimentales': 'svt',
    'français': 'francais', 'francais': 'francais',
    'anglais': 'anglais',
    'allemand': '3eme-langue', 'langue allemande': '3eme-langue',
    'espagnol': '3eme-langue', 'italien': '3eme-langue',
    'arabe': 'arabe',
    'économie et gestion': 'economie', 'economie et gestion': 'economie',
    'economie-gestion': 'economie', 'économie-gestion': 'economie',
    'economie': 'economie', 'économie': 'economie', 'gestion': 'gestion',
    'économie & gestion': 'economie',
    'histoire': 'histoire', 'géographie': 'geographie', 'geographie': 'geographie',
    'philosophie': 'philosophie', 'فلسفة': 'philosophie',
    'technologie': 'technologie', 'techniques': 'technologie', 'sciences techniques': 'technologie',
    'technique': 'technologie',
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
    'physique et chimie': 'physique', 'physique-chimie': 'physique',
    'physique chimie': 'physique',
}


def normalize_ai_subject(text):
    if not text:
        return None
    text_lower = text.lower().strip()
    if text_lower in {'système', 'inconnu', 'systeme', ''}:
        return None
    return AI_SUBJECT_TO_SLUG.get(text_lower)


def is_allowed_combo(subjects):
    if len(subjects) <= 1:
        return True
    combo = '+'.join(sorted(subjects))
    if combo in EXPLICIT_FORBIDDEN:
        return False
    for family in ALLOWED_FAMILIES:
        if subjects.issubset(family):
            return True
    return False


def parse_json_field(val):
    if val is None:
        return []
    if isinstance(val, list):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)
        except:
            return []
    return []


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
    
    # Get forbidden profs (with their actual subject distribution)
    r = m.neon_query(f"""
        WITH prof_resources AS (
          SELECT 
            u.id as uid, u."numericId" as nid,
            u."firstName" || ' ' || u."lastName" as name,
            u."teachingSubjects" as declared,
            r.id as rid, r."numericId" as rnid, r.title,
            s.slug as db_subject, rm.subject as ai_subject
          FROM "User" u
          JOIN "Resource" r ON r."teacherId" = u.id AND r.status = 'PUBLISHED'
          LEFT JOIN "Subject" s ON s.id = r."subjectId"
          LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
          WHERE u.role = 'TEACHER'
            AND u."firstName" NOT LIKE '%TunisieColl%'
            AND u."firstName" NOT LIKE '%Source%'
        )
        SELECT uid, nid, name, declared, rid, rnid, title, db_subject, ai_subject
        FROM prof_resources
        ORDER BY uid, rnid
    """)
    rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
    
    # Group by prof
    profs = {}
    for row in rows:
        uid, nid, name, declared, rid, rnid, title, db_slug, ai_subject = row
        if uid not in profs:
            profs[uid] = {
                'uid': uid, 'nid': nid, 'name': name,
                'declared': parse_json_field(declared),
                'resources': [],
            }
        profs[uid]['resources'].append({
            'rid': rid, 'rnid': rnid, 'title': title,
            'db_slug': db_slug, 'ai_subject': ai_subject,
        })
    
    # Filter to forbidden profs
    forbidden_profs = []
    for uid, p in profs.items():
        if not is_allowed_combo(set(p['declared'])):
            forbidden_profs.append(p)
    
    print(f'Total forbidden profs: {len(forbidden_profs)}')
    if limit:
        forbidden_profs = forbidden_profs[:limit]
        print(f'Limited to: {limit}')
    
    # For each forbidden prof, compute the fix
    fixes = []
    for p in forbidden_profs:
        # Count subjects by AI (preferred) + DB
        actual = Counter()
        for r in p['resources']:
            ai_slug = normalize_ai_subject(r['ai_subject'])
            if ai_slug:
                actual[ai_slug] += 1
            elif r['db_slug']:
                actual[r['db_slug']] += 1
        
        if not actual:
            continue
        
        # Main subject = most common
        main_subject, main_count = actual.most_common(1)[0]
        total = sum(actual.values())
        main_pct = main_count / total * 100
        
        # Reclassify all non-main resources to main_subject
        resource_changes = []
        for r in p['resources']:
            ai_slug = normalize_ai_subject(r['ai_subject'])
            current = ai_slug or r['db_slug']
            if current != main_subject:
                resource_changes.append((r['rid'], current, main_subject))
        
        fixes.append({
            'uid': p['uid'],
            'nid': p['nid'],
            'name': p['name'],
            'declared': p['declared'],
            'actual_dist': dict(actual),
            'main_subject': main_subject,
            'main_pct': main_pct,
            'total_resources': total,
            'resource_changes': resource_changes,
        })
    
    # Stats
    total_changes = sum(len(f['resource_changes']) for f in fixes)
    total_resources = sum(f['total_resources'] for f in fixes)
    
    print(f'\n=== FIX PLAN ===')
    print(f'Profs to fix: {len(fixes)}')
    print(f'Total resources: {total_resources}')
    print(f'Resources to reclassify: {total_changes}')
    print()
    
    # Show distribution
    main_subj_counts = Counter(f['main_subject'] for f in fixes)
    print('=== Main subjects ===')
    for subj, count in main_subj_counts.most_common(10):
        print(f'  {subj}: {count} profs')
    print()
    
    # Show 5 samples
    print('=== SAMPLES (5 profs) ===')
    for f in fixes[:5]:
        print(f'\nNID {f["nid"]} - {f["name"]}')
        print(f'  Declared: {f["declared"]}')
        print(f'  Actual distribution: {f["actual_dist"]}')
        print(f'  Main subject: {f["main_subject"]} ({f["main_pct"]:.0f}%, {sum(1 for c in f["resource_changes"])} resources to reclassify)')
    
    if not apply:
        print(f'\n*** DRY RUN - use --apply to update ***')
        return
    
    # APPLY
    print(f'\n=== APPLYING ===')
    
    # Ensure backup table
    m.neon_query("""
        CREATE TABLE IF NOT EXISTS "UserProfSubjectsBackup" (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            "userId" TEXT NOT NULL,
            "oldTeachingSubjects" JSONB,
            "newTeachingSubjects" JSONB,
            "oldResources" JSONB,
            "changedAt" TIMESTAMP DEFAULT NOW(),
            "changedBy" TEXT,
            UNIQUE("userId")
        )
    """)
    
    # Ensure resource backup table
    m.neon_query("""
        CREATE TABLE IF NOT EXISTS "ResourceSubjectBackup" (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            "resourceId" TEXT NOT NULL,
            "oldSubjectSlug" TEXT,
            "newSubjectSlug" TEXT,
            "aiSubject" TEXT,
            "changedAt" TIMESTAMP DEFAULT NOW(),
            "changedBy" TEXT
        )
    """)
    
    profs_updated = 0
    resources_updated = 0
    errors = 0
    
    for i, f in enumerate(fixes, 1):
        try:
            # 1. Backup old teachingSubjects
            old_resources_data = [{'rid': r['rid'], 'old': old, 'new': new} 
                                  for r, (rid, old, new) in zip(p['resources'], f['resource_changes'])] if False else \
                                 [{'rid': c[0], 'old': c[1], 'new': c[2]} for c in f['resource_changes']]
            
            m.neon_query(f"""
                INSERT INTO "UserProfSubjectsBackup" ("userId", "oldTeachingSubjects", "newTeachingSubjects", "oldResources", "changedBy")
                VALUES ('{f["uid"]}', '{json.dumps(f["declared"])}', '{json.dumps([f["main_subject"]])}', '{json.dumps(old_resources_data)}', 'fix_profs_multimat')
                ON CONFLICT ("userId") DO UPDATE SET 
                    "oldTeachingSubjects" = EXCLUDED."oldTeachingSubjects",
                    "newTeachingSubjects" = EXCLUDED."newTeachingSubjects",
                    "oldResources" = EXCLUDED."oldResources",
                    "changedAt" = NOW()
            """)
            
            # 2. Update teachingSubjects
            m.neon_query(f"""
                UPDATE "User" 
                SET "teachingSubjects" = '{json.dumps([f["main_subject"]])}'::jsonb, "updatedAt" = NOW()
                WHERE id = '{f["uid"]}'
            """)
            profs_updated += 1
            
            # 3. Reclassify resources + backup
            for rid, old_slug, new_slug in f['resource_changes']:
                if new_slug not in subject_id_by_slug:
                    continue
                new_id = subject_id_by_slug[new_slug]
                
                # Backup
                m.neon_query(f"""
                    INSERT INTO "ResourceSubjectBackup" ("resourceId", "newSubjectSlug", "aiSubject", "changedBy")
                    VALUES ('{rid}', '{new_id}', '{f["main_subject"]}', 'fix_profs_multimat')
                """)
                
                # Update
                m.neon_query(f"""
                    UPDATE "Resource" 
                    SET "subjectId" = '{new_id}', "updatedAt" = NOW()
                    WHERE id = '{rid}'
                """)
                resources_updated += 1
            
            if i % 50 == 0 or i == len(fixes):
                print(f'  [{i}/{len(fixes)}] profs done', flush=True)
        except Exception as e:
            errors += 1
            if errors <= 5:
                print(f'  [ERR] NID {f["nid"]}: {str(e)[:200]}')
    
    print(f'\n✅ Profs updated: {profs_updated}')
    print(f'✅ Resources reclassified: {resources_updated}')
    print(f'❌ Errors: {errors}')


if __name__ == '__main__':
    main()
