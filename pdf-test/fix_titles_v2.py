#!/usr/bin/env python3
"""
Fix generic titles using new format:
'Type subtype N°X - Matière: objet - Classe Section [année]'

Target: All resources with title LIKE 'Document%' AND status='PUBLISHED'
Strategy:
- Apply v3 builder
- Skip if no improvement (e.g. still ends with "Document -")
- Backup old title to ResourceTitleBackup
- Update in batches of 200

Usage:
  ./venv/bin/python fix_titles_v2.py           # dry-run (default)
  ./venv/bin/python fix_titles_v2.py --apply  # actually update
  ./venv/bin/python fix_titles_v2.py --limit 10  # only 10 files
"""
import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import re

# === Type label map (AI -> French) ===
TYPE_LABELS = {
    'devoir': 'Devoir', 'cours': 'Cours', 'examen': 'Examen',
    'série': "Série d'exercices", 'exercice': "Série d'exercices",
    'révision': 'Révision', 'résumé': 'Résumé', 'document': 'Document',
}

SUBTYPE_LABELS = {
    'contrôle': 'de contrôle', 'synthèse': 'de synthèse', 'maison': 'à la maison',
    'surveillé': 'surveillé', 'cours': 'de cours', 'bac blanc': 'BAC blanc',
    'examen': "d'examen",
}

SUBJECT_LABELS_FR = {
    'mathematiques': 'Mathématiques', 'physique': 'Physique', 'svt': 'SVT',
    'francais': 'Français', 'anglais': 'Anglais', 'arabe': 'Arabe',
    'philosophie': 'Philosophie', 'histoire': 'Histoire', 'geographie': 'Géographie',
    'economie': 'Économie', 'gestion': 'Gestion', 'technologie': 'Technologie',
    'informatique': 'Informatique', 'algo-prog': 'Algorithmique',
    'bases-donnees': 'Bases de données', 'tic': 'TIC', 'sport': 'Sport',
    'musique': 'Musique', '3eme-langue': '3ème Langue',
}

ACRONYMS = {'SADT', 'GRAFCET', 'BAC', 'HTML', 'CSS', 'API', 'PDF', 'TIC', 'TSP', 'OEE', 'CNC', 'PLC', 'PID'}

DESCRIPTOR_STOPWORDS = {
    'système', 'inconnu', 'technique', 'génie mécanique', 'génie électrique',
    'génie civil', 'mathématiques', 'physique', 'sciences', 'lettres',
    'économie', 'gestion', 'sport', 'informatique', 'svt', 'français',
    'anglais', 'arabe', 'philosophie', 'histoire', 'géographie',
    'technologie', 'allemand', 'espagnol', 'italien',
}

def clean_class_name(name):
    if not name:
        return None
    name = re.sub(r'\s*\(Bac\)\s*', '', name)
    return name.strip()

def to_mixed_case(s):
    if not s:
        return s
    words = s.split()
    result = []
    for w in words:
        clean = re.sub(r'[^\w]', '', w).upper()
        if clean in ACRONYMS:
            result.append(w.upper())
        elif w.isupper() and len(w) > 2:
            result.append(w.capitalize())
        else:
            result.append(w.lower())
    if result:
        result[0] = result[0].capitalize()
    return ' '.join(result)

def extract_number_from_slug(slug):
    if not slug:
        return None
    m1 = re.search(r'\bn[°\-_](\d+)', slug, re.IGNORECASE)
    if m1:
        return m1.group(1)
    return None

def extract_subtype_from_slug(slug):
    if not slug:
        return None
    slug_lower = slug.lower()
    if 'synthese' in slug_lower or 'synthèse' in slug_lower:
        return 'synthèse'
    if 'controle' in slug_lower or 'contrôle' in slug_lower:
        return 'contrôle'
    if 'maison' in slug_lower:
        return 'maison'
    if 'bac' in slug_lower:
        return 'bac blanc'
    return None

def build_title(ai_type, ai_subtype, num, db_subject_slug, class_name, section_name, year, ai_subject, system_name, slug):
    type_label = TYPE_LABELS.get((ai_type or '').lower(), ai_type or 'Document')
    
    subtype_label = SUBTYPE_LABELS.get((ai_subtype or '').lower())
    if not subtype_label and slug:
        slug_subtype = extract_subtype_from_slug(slug)
        if slug_subtype:
            subtype_label = SUBTYPE_LABELS.get(slug_subtype)
    
    type_part = type_label
    if subtype_label:
        type_part = f"{type_label} {subtype_label}"
    
    if not num and slug:
        num = extract_number_from_slug(slug)
    if num:
        type_part = f"{type_part} N°{num}"
    
    subject_fr = SUBJECT_LABELS_FR.get(db_subject_slug, db_subject_slug.capitalize() if db_subject_slug else None)
    section_lc = (section_name or '').lower()
    
    descriptor = None
    if system_name and len(system_name) > 5 and system_name.lower() not in DESCRIPTOR_STOPWORDS and system_name.lower() != section_lc:
        descriptor = to_mixed_case(system_name)
    elif ai_subject and ai_subject.lower() not in DESCRIPTOR_STOPWORDS and ai_subject.lower() != (subject_fr or '').lower() and ai_subject.lower() != section_lc:
        descriptor = to_mixed_case(ai_subject)
    
    if subject_fr and descriptor and descriptor.lower() != subject_fr.lower():
        subject_section = f"{subject_fr} : {descriptor}"
    elif descriptor:
        subject_section = descriptor
    elif subject_fr:
        subject_section = subject_fr
    else:
        subject_section = ""
    
    class_part = clean_class_name(class_name)
    location = class_part or ""
    if section_name:
        section_clean = section_name.strip()
        if class_part and section_clean:
            location = f"{class_part} {section_clean}"
        elif section_clean:
            location = section_clean
    
    year_part = f"[{year}]" if year else ""
    
    parts = [type_part]
    if subject_section:
        parts.append(subject_section)
    if location:
        parts.append(location)
    if year_part:
        parts.append(year_part)
    
    return " - ".join(parts)


def get_candidates(limit=None):
    """Get all generic-title resources with AI metadata."""
    lim = f'LIMIT {limit}' if limit else ''
    r = m.neon_query(f"""
        SELECT r.id, r."numericId", r.title, r.slug, s.slug as db_subject,
          c."nameFr" as class_name, sec."nameFr" as section_name,
          rm.type as ai_type, rm.subject as ai_subject, rm.subtype, rm.year, rm."systemName",
          rme."homeworkNumber"
        FROM "Resource" r
        LEFT JOIN "Subject" s ON s.id = r."subjectId"
        LEFT JOIN "Class" c ON c.id = r."classId"
        LEFT JOIN "Section" sec ON sec.id = r."sectionId"
        LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
        LEFT JOIN "ResourceMetadataExtra" rme ON rme."resourceId" = r.id
        WHERE r.title LIKE 'Document%' AND r.status = 'PUBLISHED'
          AND rm.id IS NOT NULL
        ORDER BY r."numericId"
        {lim}
    """)
    return r.get('response', [{}])[0].get('data', {}).get('rows', [])


def _esc(s):
    return (s or "").replace(chr(39), chr(39)+chr(39))

def backup_title(rid, numeric_id, old_title, new_title):
    """Save old + new title to ResourceTitleBackup (upsert)."""
    r = m.neon_query(f"""
        INSERT INTO "ResourceTitleBackup" ("resourceId", "numericId", "oldTitle", "newTitle", "regeneratedAt", "regeneratedBy")
        VALUES ('{rid}', {numeric_id}, '{_esc(old_title)}', '{_esc(new_title)}', NOW(), 'fix_titles_v2')
        ON CONFLICT ("resourceId") DO UPDATE SET "newTitle" = EXCLUDED."newTitle", "regeneratedAt" = NOW()
    """)
    return r


def update_title(rid, new_title):
    r = m.neon_query(f"""
        UPDATE "Resource" SET title = {f"'{(new_title or '').replace(chr(39), chr(39)+chr(39))}'"}, "updatedAt" = NOW()
        WHERE id = '{rid}'
    """)
    return r


def main():
    apply = '--apply' in sys.argv
    limit = None
    for arg in sys.argv[1:]:
        if arg.startswith('--limit='):
            limit = int(arg.split('=')[1])
        elif arg.isdigit():
            limit = int(arg)
    
    rows = get_candidates(limit=limit)
    print(f'Found {len(rows)} generic-title files to fix')
    print('=' * 80)
    
    if not apply:
        print('*** DRY RUN MODE - use --apply to actually update ***')
        print()
    
    to_update = []
    skipped = 0
    samples = 0
    for i, row in enumerate(rows, 1):
        (rid, nid, db_title, slug, db_subject, class_name, section_name, 
         ai_type, ai_subject, ai_subtype, year, system_name, hwnum) = row
        
        new_title = build_title(ai_type, ai_subtype, hwnum, db_subject, class_name, section_name, year, ai_subject, system_name, slug)
        
        # Skip if no improvement
        if new_title == db_title or not new_title or len(new_title) < 10:
            skipped += 1
            continue
        
        to_update.append((rid, nid, db_title, new_title))
        
        # Show first 10 samples
        if samples < 10:
            print(f'\nNID {nid}: "{db_title[:70]}"')
            print(f'       → "{new_title[:90]}"')
            samples += 1
    
    print()
    print('=' * 80)
    print(f'Total to update: {len(to_update)}')
    print(f'Skipped (no change): {skipped}')
    
    if not apply:
        print('\n*** DRY RUN COMPLETE - run with --apply to update ***')
        return
    
    print(f'\nApplying updates...')
    updated = 0
    errors = 0
    for i, (rid, nid, old_title, new_title) in enumerate(to_update, 1):
        try:
            backup_title(rid, nid, old_title, new_title)
            r = update_title(rid, new_title)
            if r.get('success'):
                updated += 1
                if i % 50 == 0 or i == len(to_update):
                    print(f'  [{i}/{len(to_update)}] Updated NID {nid}')
            else:
                errors += 1
                print(f'  [ERR] NID {nid}: {r}')
        except Exception as e:
            errors += 1
            print(f'  [ERR] NID {nid}: {e}')
    
    print()
    print('=' * 80)
    print(f'✅ Updated: {updated}')
    print(f'❌ Errors: {errors}')


if __name__ == '__main__':
    main()
