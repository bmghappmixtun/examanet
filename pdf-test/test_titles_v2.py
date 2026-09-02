#!/usr/bin/env python3
"""
Test title format v3 (clean):
'Type subtype N°X - Matière: objet - Classe Section [année]'

Stopwords: skip descriptors that are just section/branch names
Acronyms: SADT, GRAFCET, BAC, TSP, OEE, CNC, etc. stay UPPERCASE
Systemname fallback: if ai_subject is a stopword, use systemName
"""
import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('regen_titles_v3', '/workspace/edutunisie/pdf-test/regen_titles_v3.py')
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

# Stopwords: descriptor values that are not real topics (section/branch names)
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
    # 1. Type + subtype + number
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
    
    # 2. Subject : descriptor
    subject_fr = SUBJECT_LABELS_FR.get(db_subject_slug, db_subject_slug.capitalize() if db_subject_slug else None)
    section_lc = (section_name or '').lower()
    
    descriptor = None
    # Prefer systemName if it's a real topic
    if system_name and len(system_name) > 5 and system_name.lower() not in DESCRIPTOR_STOPWORDS and system_name.lower() != section_lc:
        descriptor = to_mixed_case(system_name)
    # Fallback to ai_subject if it's a real topic
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
    
    # 3. Class + Section
    class_part = clean_class_name(class_name)
    location = class_part or ""
    if section_name:
        section_clean = section_name.strip()
        if class_part and section_clean:
            location = f"{class_part} {section_clean}"
        elif section_clean:
            location = section_clean
    
    # 4. Year in [ ]
    year_part = f"[{year}]" if year else ""
    
    # Assemble
    parts = [type_part]
    if subject_section:
        parts.append(subject_section)
    if location:
        parts.append(location)
    if year_part:
        parts.append(year_part)
    
    return " - ".join(parts)


# Get 10 generic-title files with devoir-de-controle-N or devoir-de-synthese-N pattern
result = m.neon_query("""
SELECT r.id, r."numericId", r.title, r.type, r.slug, s.slug as db_subject,
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
  AND (r.slug LIKE '%devoir-de-controle%n%' OR r.slug LIKE '%devoir-de-synthese%n%' OR r.slug LIKE '%devoir-corrige%')
ORDER BY r."numericId" DESC
LIMIT 10
""")

rows = result.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'Found {len(rows)} files for test')
print('=' * 80)

for i, row in enumerate(rows, 1):
    (rid, nid, db_title, db_type, slug, db_subject, class_name, section_name, 
     ai_type, ai_subject, ai_subtype, year, system_name, hwnum) = row
    
    new_title = build_title(ai_type, ai_subtype, hwnum, db_subject, class_name, section_name, year, ai_subject, system_name, slug)
    
    print(f'\n{"─" * 80}')
    print(f'#{i} | NID {nid} | {db_subject}')
    print(f'  URL: https://examanet.com/ressources/{nid}/{slug}')
    print(f'  AI: type={ai_type} subtype="{ai_subtype}" num={hwnum} year={year}')
    if system_name:
        print(f'  System: "{system_name}"')
    if ai_subject and ai_subject.lower() not in ['technologie', 'système']:
        print(f'  AI subject: "{ai_subject}"')
    print(f'\n  BEFORE: "{db_title}"')
    print(f'  AFTER:  "{new_title}"')

print()
print('=' * 80)
print('NEW FORMAT: "Type subtype N°X - Matière: objet - Classe Section [année]"')
print('REVIEW: validate the format before applying to all 435 files')
