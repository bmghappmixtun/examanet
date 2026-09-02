import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import re

nids = [5062, 7488, 8941, 9980, 13881]
r = m.neon_query(f'''
SELECT r.id, r."numericId", r.title, r."homeworkSubtype", r."homeworkNumber",
  r.year, r.trimester,
  sub.slug as subj_slug, c.slug as cls_slug, sec.slug as sec_slug
FROM "Resource" r
LEFT JOIN "Subject" sub ON sub.id = r."subjectId"
LEFT JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Section" sec ON sec.id = r."sectionId"
WHERE r."numericId" IN ({','.join(map(str, nids))})
''')

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

def get_subtype_label(sub):
    if sub == 'CONTROLE': return 'Contrôle'
    elif sub == 'SYNTHESE': return 'Synthèse'
    elif sub == 'REVISION': return 'Révision'
    elif sub == 'MAISON': return 'Maison'
    return sub

for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
    rid, nid, title, hst, hwn, year, trim, sslug, cslug, secslug = row
    hwn_int = int(hwn) if hwn else None
    if not year:
        print(f'  NID {nid}: SKIP (no year)')
        continue
    
    subject_label = get_subject_label(sslug)
    class_label = get_class_label(cslug, secslug)
    subtype_label = get_subtype_label(hst)
    
    # For NID 13881 it's "Devoir de Synthèse Bac Blanc"
    is_bac_blanc = 'Bac Blanc' in title
    type_label = 'Devoir de Synthèse Bac Blanc' if is_bac_blanc else f'Devoir de {subtype_label}'
    
    if is_bac_blanc:
        parts = [type_label, subject_label, class_label]
    else:
        parts = [f"{type_label} N°{hwn_int}", subject_label, class_label]
    
    if trim:
        parts.append(f"Trim{trim}")
    parts.append(f"({year})")
    new_title = ' - '.join(parts)
    new_title = re.sub(r'\s+', ' ', new_title).strip()
    
    print(f'\nNID {nid}: {title}')
    print(f'  NEW: {new_title}')
    
    # Backup
    m.neon_query(f'''
    INSERT INTO "ResourceTitleBackup" ("resourceId", "numericId", "oldTitle", "newTitle", "regeneratedAt", "regeneratedBy")
    VALUES ('{rid}', {nid}, '{title.replace("'", "''")}', '{new_title.replace("'", "''")}', NOW(), 'regen_5_remaining')
    ON CONFLICT ("resourceId") DO UPDATE SET "oldTitle" = EXCLUDED."oldTitle", "newTitle" = EXCLUDED."newTitle", "regeneratedAt" = NOW(), "regeneratedBy" = EXCLUDED."regeneratedBy"
    ''')
    
    # Update
    m.neon_query(f'''
    UPDATE "Resource" SET title = '{new_title.replace("'", "''")}' WHERE id = '{rid}'
    ''')
    print('  ✓ Updated')
