#!/usr/bin/env python3
"""
Reclassify resources based on GPT-4o-mini text analysis.

Rules:
1. Skip chemistry cases: if DB=physique and AI(text)=svt, keep physique
2. For other reclassifications, validate that (class, section) is appropriate for the new subject
3. Reclassify only if validation passes

Class/Section validation rules (Tunisian curriculum):
- algo-prog, bases-donnees, tic, informatique → only valid in 3AS/4AS (Lycée) and Sciences Info section
- techno → only in Technique section (3AS/4AS)
- 3eme-langue → in any section (it's a foreign language)
- economie, gestion → 3AS/4AS Économie-Gestion or Eco Services
- philosophie → 4AS Lettres only
- anglais, francais, arabe → any class, any section
"""
import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import csv
import json

# Load results
results = []
with open('/workspace/edutunisie/pdf-test/ai_subject_ambiguous_results.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        if row.get('nid'):
            results.append(row)

print(f'Total text-AI results: {len(results)}')

# Skip chemistry cases (DB=physique, AI=text=svt)
to_reclassify = []
skipped_chemistry = []
no_change_needed = []
invalid_class_section = []

for r in results:
    nid = r['nid']
    db = r['db_subject']
    ai_new = r['ai_new_subject']
    conf = int(r['confidence'])
    
    # Rule 1a: skip chemistry (DB=physique, AI=text=svt) - in Tunisia chemistry is in Physique
    if db == 'physique' and ai_new == 'svt':
        skipped_chemistry.append((nid, db, ai_new, conf, 'Chemistry in SVT → keep physique (Tunisia)'))
        continue
    
    # Rule 1b: 'chimie' as AI_new doesn't exist as DB subject - map to physique
    if ai_new == 'chimie':
        ai_new = 'physique'
        # Continue with reclassification to physique
        r = {'nid': nid, 'db': db, 'ai_new': ai_new, 'conf': conf, 'reasoning': '[chimie→physique] ' + r.get('reasoning', '')} if False else None
    
    # If DB = AI_new, no change needed
    if db == ai_new:
        no_change_needed.append((nid, db, ai_new, conf))
        continue
    
    # Map chimie → physique (no chimie subject in DB)
    if ai_new == 'chimie':
        ai_new = 'physique'
    
    # Otherwise, candidate for reclassification
    to_reclassify.append({
        'nid': nid, 'db': db, 'ai_new': ai_new, 'conf': conf,
        'reasoning': r.get('reasoning', ''),
    })

print(f'\nNo change needed (DB = AI): {len(no_change_needed)}')
print(f'Skipped (chemistry): {len(skipped_chemistry)}')
print(f'Candidates for reclassification: {len(to_reclassify)}')

# Now fetch class+section for all to_reclassify NIDs
nids = [r['nid'] for r in to_reclassify]
if nids:
    nid_list = ','.join(nids)
    db_r = m.neon_query(f"""
        SELECT r."numericId", r.id as rid, s.id as subj_id, s.slug as db_subj,
          c."nameFr" as class_name, sec."nameFr" as section_name, sec.slug as section_slug,
          c.slug as class_slug
        FROM "Resource" r
        LEFT JOIN "Subject" s ON s.id = r."subjectId"
        LEFT JOIN "Class" c ON c.id = r."classId"
        LEFT JOIN "Section" sec ON sec.id = r."sectionId"
        WHERE r."numericId" IN ({nid_list})
    """)
    rows = db_r.get('response', [{}])[0].get('data', {}).get('rows', [])
    info_by_nid = {}
    for row in rows:
        info_by_nid[str(row[0])] = {
            'rid': row[1], 'subj_id': row[2], 'db_subj': row[3],
            'class_name': row[4], 'section_name': row[5], 'section_slug': row[6],
            'class_slug': row[7],
        }

    # Class/section validation rules
    # Map: (new_subject, allowed_class_slugs) or (new_subject, section_required)
    SUBJECT_RULES = {
        'algo-prog': {
            'allowed_classes': ['3eme-secondaire', '4eme-secondaire'],
            'allowed_sections': ['informatique', 'sciences-informatiques', 'sciences-informatique', 'technologies-informatique', 'sciences-informatique', 'technologies-informatique'],
        },
        'bases-donnees': {
            'allowed_classes': ['4eme-secondaire'],
            'allowed_sections': ['informatique', 'sciences-informatiques', 'sciences-informatique', 'technologies-informatique', 'sciences-informatique', 'technologies-informatique'],
        },
        'informatique': {
            'allowed_classes': ['1ere-secondaire', '2eme-secondaire', '3eme-secondaire', '4eme-secondaire', '7eme', '8eme', '9eme'],
            'allowed_sections': [],  # any
        },
        'tic': {
            'allowed_classes': ['3eme-secondaire', '4eme-secondaire'],
            'allowed_sections': ['informatique', 'sciences-informatiques', 'sciences-informatique', 'technologies-informatique', 'sciences-informatique', 'technologies-informatique'],
        },
        'technologie': {
            'allowed_classes': ['1ere-secondaire', '2eme-secondaire', '3eme-secondaire', '4eme-secondaire'],
            'allowed_sections': ['technique'],
        },
        'economie': {
            'allowed_classes': ['3eme-secondaire', '4eme-secondaire'],
            'allowed_sections': ['eco-gestion', 'eco-services'],
        },
        'gestion': {
            'allowed_classes': ['3eme-secondaire', '4eme-secondaire'],
            'allowed_sections': ['eco-gestion', 'eco-services'],
        },
        'philosophie': {
            'allowed_classes': ['4eme-secondaire'],
            'allowed_sections': ['lettres'],
        },
        # All others (math, physique, svt, francais, anglais, arabe, etc.) - no class/section restriction
    }
    
    # Apply validation
    validated = []
    for r in to_reclassify:
        nid = r['nid']
        info = info_by_nid.get(nid)
        if not info:
            invalid_class_section.append((nid, r['db'], r['ai_new'], 'No info'))
            continue
        
        new_subj = r['ai_new']
        rules = SUBJECT_RULES.get(new_subj, {})
        allowed_classes = rules.get('allowed_classes', [])
        allowed_sections = rules.get('allowed_sections', [])
        
        # If no rules, accept
        if not allowed_classes and not allowed_sections:
            validated.append({**r, 'info': info, 'reason': 'No class/section restriction'})
            continue
        
        # Check class
        class_ok = not allowed_classes or info['class_slug'] in allowed_classes
        # Check section (empty list = any)
        # Section: empty section is OK (not yet assigned), or section matches allowed
        section_ok = not allowed_sections or not info.get('section_slug') or info['section_slug'] in allowed_sections
        
        if class_ok and section_ok:
            validated.append({**r, 'info': info, 'reason': 'Class+section OK'})
        else:
            issues = []
            if not class_ok:
                issues.append(f"class {info['class_slug']!r} not in {allowed_classes}")
            if not section_ok:
                issues.append(f"section {info['section_slug']!r} not in {allowed_sections}")
            invalid_class_section.append((nid, r['db'], r['ai_new'], '; '.join(issues)))
    
    print(f'\n=== VALIDATION ===')
    print(f'✅ Validated for reclassification: {len(validated)}')
    print(f'❌ Invalid class/section: {len(invalid_class_section)}')
    
    # Distribution
    from collections import Counter
    dist = Counter()
    for r in validated:
        dist[f'{r["db"]} → {r["ai_new"]}'] += 1
    print(f'\nDistribution of validated:')
    for change, count in dist.most_common(15):
        print(f'  {change:<35} {count:>4}')
    
    # Show invalid
    if invalid_class_section:
        print(f'\n=== INVALID CLASS/SECTION (10 samples) ===')
        for x in invalid_class_section[:10]:
            print(f'  NID {x[0]}: {x[1]} → {x[2]} | {x[3]}')
    
    # Show 10 validated samples
    print(f'\n=== 10 SAMPLE VALIDATED ===')
    for r in validated[:10]:
        info = r['info']
        print(f'  NID {r["nid"]}: {r["db"]} → {r["ai_new"]} | class={info["class_slug"]} section={info["section_slug"]} | conf={r["conf"]}%')
    
    # Save results
    with open('/workspace/edutunisie/pdf-test/text_ai_validated.csv', 'w') as f:
        f.write('nid,rid,db_subj,ai_new,confidence,class_slug,section_slug,reasoning,reason\n')
        for r in validated:
            info = r['info']
            reason_e = r['reasoning'].replace('"', '""').replace('\n', ' ')
            f.write(f'{r["nid"]},{info["rid"]},{r["db"]},{r["ai_new"]},{r["conf"]},{info["class_slug"]},{info["section_slug"]},"{reason_e}",{r["reason"]}\n')
    print(f'\nValidated saved to text_ai_validated.csv ({len(validated)} rows)')

# Summary
print()
print('=' * 80)
print('  RÉSUMÉ')
print('=' * 80)
print(f'Total:                                {len(results)}')
print(f'No change needed (DB = AI):          {len(no_change_needed)}')
print(f'Skipped (chemistry in Physique):      {len(skipped_chemistry)}')
print(f'Validated for reclassification:       {len(validated) if "validated" in dir() else 0}')
print(f'Invalid class/section:                {len(invalid_class_section) if "invalid_class_section" in dir() else 0}')
