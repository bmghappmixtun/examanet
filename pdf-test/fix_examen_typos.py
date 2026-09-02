import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import re
import unicodedata

def title_to_slug(title, nid):
    s = unicodedata.normalize('NFD', title)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = s.lower()
    s = re.sub(r'[\s_]+', '-', s)
    s = re.sub(r'[^a-z0-9\-]', '', s)
    s = re.sub(r'-+', '-', s)
    s = s.strip('-')
    return f"{s}-{nid}"

SUBJ_FR = {
    'mathematiques': 'Mathématiques', 'physique': 'Physique', 'svt': 'SVT',
    'informatique': 'Informatique', 'francais': 'Français', 'anglais': 'Anglais',
    'arabe': 'Arabe', 'histoire': 'Histoire', 'geographie': 'Géographie',
    'histoire-geographie': 'Histoire-Géographie', 'philo': 'Philosophie',
    'philosophie': 'Philosophie', 'algo-prog': 'Algo-Programmation',
    'technologie': 'Technologie', 'gestion': 'Gestion', 'economie': 'Économie',
    'economie-gestion': 'Économie-Gestion', 'espagnol': 'Espagnol',
    'allemand': 'Allemand', '3eme-langue': '3ème Langue',
    'education-civique': 'Éducation Civique', 'pensee-islamique': 'Pensée Islamique',
    'theatre': 'Théâtre', 'musique': 'Musique', 'arts-plastiques': 'Arts Plastiques',
    'sport': 'Sport', 'education-islamique': 'Éducation Islamique',
    'bases-donnees': 'Base de données', 'reseaux': 'Réseaux',
    'sciences': 'Sciences', 'sciences-physiques': 'Sciences Physiques',
    'sciences-de-la-vie-et-de-la-terre': 'SVT', 'lecture': 'Lecture',
    'production-ecrite': 'Production Écrite', 'orthographe': 'Orthographe',
    'grammaire': 'Grammaire', 'conjugaison': 'Conjugaison',
    'vocabulaire': 'Vocabulaire',
}

def get_subject_label(slug):
    if not slug: return ''
    return SUBJ_FR.get(slug, slug.replace('-', ' ').title())

def get_class_label(cls, sec):
    if not cls: return ''
    m_college = re.match(r'^(7|8|9)eme', cls)
    if m_college:
        base = f'{m_college.group(1)}ème'
    else:
        m_sec = re.match(r'^(1|2|3|4)(ere|eme|ème)', cls)
        if m_sec:
            base = f'{m_sec.group(1)}AS'
        else:
            base = cls[:8]
    if sec:
        sec_label = sec.replace('-', ' ').title()
        return f"{base} {sec_label}"
    return base

# Fix 1: NID 1952 - "Anglais Examen" → "Anglais"
# Fix 2: NID 13237 - "Devoir de Examen" → "Examen de TP" (PDF confirms)
# Fix 3: NID 13288 - "Devoir de Examen" → "Examen de TP" (PDF confirms)
# Fix 4: NID 13321 - "Devoir Examen de TP" → "Examen de TP"

fixes = [
    # (NID, new_title_formatter_fn)
    (1952, lambda r: f"Devoir de Contrôle N°{r['hwn']} - {get_subject_label(r['subj'])} - {get_class_label(r['cls'], r['sec'])} - ({r['year']})"),
    (13237, lambda r: f"Examen de TP N°{r['hwn']} - {get_subject_label(r['subj'])} - {get_class_label(r['cls'], r['sec'])} - Trim{r['trim']} - ({r['year']})"),
    (13288, lambda r: f"Examen de TP N°{r['hwn']} - {get_subject_label(r['subj'])} - {get_class_label(r['cls'], r['sec'])} - ({r['year']})"),
    (13321, lambda r: f"Examen de TP N°{r['hwn']} - {get_subject_label(r['subj'])} - {get_class_label(r['cls'], r['sec'])} - ({r['year']})"),
]

for nid, fmt in fixes:
    r = m.neon_query(f'''
SELECT r.id, r.title, r."homeworkSubtype", r."homeworkNumber", r.year, r.trimester,
  sub.slug as subj, c.slug as cls, sec.slug as sec
FROM "Resource" r
LEFT JOIN "Subject" sub ON sub.id = r."subjectId"
LEFT JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Section" sec ON sec.id = r."sectionId"
WHERE r."numericId" = {nid}
''')
    for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
        rid, title, hst, hwn, year, trim, subj, cls, sec = row
        data = {'hst': hst, 'hwn': hwn, 'year': year, 'trim': trim, 'subj': subj, 'cls': cls, 'sec': sec}
        new_title = fmt(data)
        new_title = re.sub(r'\s+', ' ', new_title).strip()
        new_slug = title_to_slug(new_title, nid)
        print(f'\nNID {nid}:')
        print(f'  OLD: {title}')
        print(f'  NEW: {new_title}')
        print(f'  New slug: {new_slug}')
        
        # Backup
        m.neon_query(f'''
INSERT INTO "ResourceTitleBackup" ("resourceId", "numericId", "oldTitle", "newTitle", "regeneratedAt", "regeneratedBy")
VALUES ('{rid}', {nid}, '{title.replace("'", "''")}', '{new_title.replace("'", "''")}', NOW(), 'fix_examen_typos')
ON CONFLICT ("resourceId") DO UPDATE SET "oldTitle" = EXCLUDED."oldTitle", "newTitle" = EXCLUDED."newTitle", "regeneratedAt" = NOW(), "regeneratedBy" = EXCLUDED."regeneratedBy"
''')
        
        # Update title + slug
        m.neon_query(f"UPDATE \"Resource\" SET title = '{new_title.replace(chr(39), chr(39)+chr(39))}', slug = '{new_slug}' WHERE id = '{rid}'")
        print('  ✓ Updated')
