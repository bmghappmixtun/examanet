#!/usr/bin/env python3
"""
Audit consistency between DB attributes and AI-generated attributes.
READ-ONLY: does not modify any data.
"""
import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import json
import csv
import time

# DB type to AI type mapping (normalize)
DB_TO_AI_TYPE = {
    'BAC_SUBJECT': 'EXAM',  # Past BAC subjects are exams
    'COURSE': 'COURSE',
    'EXERCISE': 'EXERCISE',
    'HOMEWORK': 'HOMEWORK',
    'OTHER': None,           # Too vague
    'SUMMARY': 'SUMMARY',
    'REVISION': 'REVISION',
    'CORRECTION': 'EXERCISE',  # Correction = exercise with answers
}

# AI type to DB type (reverse)
AI_TO_DB_TYPE = {
    'COURSE': 'COURSE',
    'EXAM': 'BAC_SUBJECT',   # Default EXAM -> BAC_SUBJECT (past exam papers)
    'EXERCISE': 'EXERCISE',
    'HOMEWORK': 'HOMEWORK',
    'REVISION': 'EXERCISE',  # No REVISION in DB enum, map to EXERCISE
    'SUMMARY': 'SUMMARY',
    'cours': 'COURSE',  # French variants
    'devoir': 'HOMEWORK',
    'série': 'EXERCISE',
}

# AI level to class slug mapping
AI_LEVEL_TO_CLASS = {
    'BAC (4ème année secondaire)': '4eme-secondaire',
    '3ème année secondaire': '3eme-secondaire',
    '2ème année secondaire': '2eme-secondaire',
    '1ère année secondaire': '1ere-secondaire',
    'Collège': None,  # Need to determine which college year
}

# AI subject to slug mapping (use existing fix_subjects logic)
AI_TO_SUBJECT_SLUG = {
    'mathématiques': 'mathematiques',
    'mathematiques': 'mathematiques',
    'math': 'mathematiques',
    'physique': 'physique',
    'physique-chimie': 'physique',
    'physique chimie': 'physique',
    'sciences physiques': 'physique',
    'sciences physique': 'physique',
    'chimie': 'physique',
    'chimie et physique': 'physique',
    'chimie, physique': 'physique',
    'mathématiques et sciences physiques': 'physique',
    'svt': 'svt',
    'sciences de la vie et de la terre': 'svt',
    'sciences naturelles': 'svt',
    'sciences': 'svt',
    'sciences expérimentales': 'svt',
    'sciences experimentales': 'svt',
    'français': 'francais',
    'francais': 'francais',
    'anglais': 'anglais',
    'arabe': 'arabe',
    'اللغة العربية': 'arabe',
    'économie et gestion': 'economie',
    'economie et gestion': 'economie',
    'economie-gestion': 'economie',
    'économie-gestion': 'economie',
    'economie': 'economie',
    'économie': 'economie',
    'gestion': 'gestion',
    'économie & gestion': 'economie',
    'histoire': 'histoire',
    'géographie': 'geographie',
    'geographie': 'geographie',
    'philosophie': 'philosophie',
    'فلسفة': 'philosophie',
    'pensée islamique': 'pensee-islamique',
    'éducation islamique': 'education-islamique',
    'technologie': 'technologie',
    'technique': 'technologie',
    'informatique': 'informatique',
    "sciences de l'informatique": 'informatique',
    "sciences de l’information": 'informatique',
    'sciences informatiques': 'informatique',
    'algorithmique et programmation': 'algo-prog',
    'algorithme et programmation': 'algo-prog',
    'algo & prog': 'algo-prog',
    'algorithme': 'algo-prog',
    'bases de données': 'bases-donnees',
    "système d'exploitation et réseaux": 'systeme-exploitation-reseaux',
    'tic': 'tic',
    'éducation physique': 'sport',
    'sport': 'sport',
    'électricité': 'physique',
    'electricite': 'physique',
    'génie électrique': 'physique',
    'genie electrique': 'physique',
    'génie mécanique': 'technologie',
    'genie mecanique': 'technologie',
}

def normalize_ai_subject(s):
    if not s:
        return None
    s_lower = s.lower().strip()
    if s_lower in AI_TO_SUBJECT_SLUG:
        return AI_TO_SUBJECT_SLUG[s_lower]
    for key, val in AI_TO_SUBJECT_SLUG.items():
        if key in s_lower or s_lower in key:
            return val
    return None

print('=== AUDIT START ===')
print('Loading all resources with AI metadata...')

# Get all resources with their DB and AI data
result = m.neon_query("""
SELECT 
  r.id, r."numericId", r.slug, r.title, r.type, r.summary,
  s.slug as db_subject,
  c.slug as db_class, c."nameFr" as db_class_name,
  rm.type as ai_type, rm.subject as ai_subject, rm.level as ai_level,
  rme.title as ai_title,
  rme.summary as ai_summary,
  rme.language as ai_language,
  u.bio
FROM "Resource" r
JOIN "User" u ON u.id = r."teacherId"
LEFT JOIN "Subject" s ON s.id = r."subjectId"
LEFT JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
LEFT JOIN "ResourceMetadataExtra" rme ON rme."resourceId" = r.id
WHERE r.status = 'PUBLISHED'
  AND (u.bio LIKE '%evoirat%' OR u.bio LIKE '%tunisiecollege%' OR u.bio LIKE '%TunisieColl%')
""")

rows = result.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'Loaded {len(rows)} resources')

# Analyze each
issues = []
stats = {
    'total': 0,
    'with_ai': 0,
    'without_ai': 0,
    'generic_title': 0,
    'type_mismatch': 0,
    'subject_mismatch': 0,
    'class_mismatch': 0,
    'title_mismatch': 0,
    'multi_mismatch': 0,
    'high_confidence': 0,
    'medium_confidence': 0,
    'low_confidence': 0,
}

for row in rows:
    rid, nid, slug, db_title, db_type, db_summary, db_subject, db_class, db_class_name, ai_type, ai_subject, ai_level, ai_title, ai_summary, ai_language, bio = row
    stats['total'] += 1
    
    has_ai = bool(ai_type or ai_subject or ai_level or ai_title)
    if has_ai:
        stats['with_ai'] += 1
    else:
        stats['without_ai'] += 1
    
    resource_issues = []
    
    # 1. Generic title check
    if db_title and (db_title.startswith('Document -') or 'Document -' in db_title):
        resource_issues.append(('GENERIC_TITLE', 'HIGH', f'Generic title: {db_title[:60]}'))
        stats['generic_title'] += 1
    
    # 2. Type mismatch (only if AI has a type)
    if ai_type and db_type:
        ai_type_normalized = AI_TO_DB_TYPE.get(ai_type.lower(), ai_type.upper())
        if ai_type_normalized != db_type:
            # Check if it's just a known variant
            if not (ai_type.upper() == 'REVISION' and db_type == 'EXERCISE'):
                resource_issues.append(('TYPE_MISMATCH', 'MEDIUM', f'DB={db_type} vs AI={ai_type}'))
                stats['type_mismatch'] += 1
    
    # 3. Subject mismatch
    if ai_subject and db_subject:
        ai_subj_slug = normalize_ai_subject(ai_subject)
        if ai_subj_slug and ai_subj_slug != db_subject:
            # If it's a meaningful difference
            resource_issues.append(('SUBJECT_MISMATCH', 'MEDIUM', f'DB={db_subject} vs AI={ai_subj_slug} (raw: {ai_subject})'))
            stats['subject_mismatch'] += 1
    
    # 4. Class mismatch
    if ai_level and db_class:
        ai_class = AI_LEVEL_TO_CLASS.get(ai_level)
        if ai_class and ai_class != db_class:
            resource_issues.append(('CLASS_MISMATCH', 'MEDIUM', f'DB={db_class} ({db_class_name}) vs AI={ai_class} (raw: {ai_level})'))
            stats['class_mismatch'] += 1
    
    # 5. Title vs AI title (if both exist)
    if ai_title and db_title and not db_title.startswith('Document -'):
        # Simple check: AI title shorter and similar
        ai_title_lower = ai_title.lower()[:50]
        db_title_lower = db_title.lower()[:50]
        if ai_title_lower != db_title_lower and ai_title[:30].lower() not in db_title.lower():
            # Different titles - this might be normal for long titles
            # Only flag if very different
            if len(ai_title) < 60 and len(db_title) > 60 and ai_title[:30].lower() not in db_title.lower()[:60]:
                resource_issues.append(('TITLE_MISMATCH', 'LOW', f'DB={db_title[:40]}... vs AI={ai_title[:40]}'))
                stats['title_mismatch'] += 1
    
    if resource_issues:
        is_multi = len(resource_issues) > 1
        if is_multi:
            stats['multi_mismatch'] += 1
        
        confidence = 'HIGH' if any(c == 'HIGH' for _, c, _ in resource_issues) else ('MEDIUM' if any(c == 'MEDIUM' for _, c, _ in resource_issues) else 'LOW')
        if confidence == 'HIGH':
            stats['high_confidence'] += 1
        elif confidence == 'MEDIUM':
            stats['medium_confidence'] += 1
        else:
            stats['low_confidence'] += 1
        
        issues.append({
            'nid': nid,
            'rid': rid,
            'slug': slug,
            'db_title': db_title,
            'db_type': db_type,
            'db_subject': db_subject,
            'db_class': db_class,
            'ai_type': ai_type,
            'ai_subject': ai_subject,
            'ai_level': ai_level,
            'ai_title': ai_title,
            'confidence': confidence,
            'issue_count': len(resource_issues),
            'issues': '; '.join([f'{t}({c}): {d}' for t, c, d in resource_issues]),
            'source': 'devoirat' if 'evoirat' in bio else 'tunisiecollege',
        })

# Save issues to CSV
output_path = '/tmp/audit_results.csv'
with open(output_path, 'w', newline='') as f:
    if issues:
        writer = csv.DictWriter(f, fieldnames=list(issues[0].keys()))
        writer.writeheader()
        writer.writerows(issues)
    else:
        f.write('No issues found\n')

# Save stats
stats_path = '/tmp/audit_stats.txt'
with open(stats_path, 'w') as f:
    f.write('=' * 70 + '\n')
    f.write('📊 AUDIT STATS\n')
    f.write('=' * 70 + '\n')
    for k, v in stats.items():
        f.write(f'  {k:<25} {v}\n')
    f.write('\n')

print()
print('=' * 70)
print('📊 AUDIT RESULTS')
print('=' * 70)
for k, v in stats.items():
    print(f'  {k:<25} {v}')

print()
print(f'CSV saved: {output_path}')
print(f'Stats saved: {stats_path}')

# Show top examples
print()
print('=' * 70)
print('🔍 TOP 5 EXAMPLES (HIGH confidence)')
print('=' * 70)
high_issues = [i for i in issues if i['confidence'] == 'HIGH'][:5]
for issue in high_issues:
    print(f'\n  NID={issue["nid"]} ({issue["source"]})')
    print(f'    DB title:    {issue["db_title"][:60] if issue["db_title"] else "?"}')
    print(f'    Issues:      {issue["issues"]}')

print()
print('=' * 70)
print('🔍 TOP 5 EXAMPLES (MEDIUM confidence)')
print('=' * 70)
med_issues = [i for i in issues if i['confidence'] == 'MEDIUM'][:5]
for issue in med_issues:
    print(f'\n  NID={issue["nid"]} ({issue["source"]})')
    print(f'    DB title:    {issue["db_title"][:60] if issue["db_title"] else "?"}')
    print(f'    DB: subj={issue["db_subject"]} class={issue["db_class"]} type={issue["db_type"]}')
    print(f'    AI: subj={issue["ai_subject"]} level={issue["ai_level"]} type={issue["ai_type"]}')
    print(f'    Issues:      {issue["issues"]}')
