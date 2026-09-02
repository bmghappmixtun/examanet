#!/usr/bin/env python3
"""
Fix misclassified Resource.subjectId - chunked + idempotent + safe.
"""
import os, json, time
from pathlib import Path
import urllib.request

NEON_API_KEY = os.environ['NEON_API_KEY']
NEON_PROJECT = 'little-silence-94324724'
BRANCH_ID = 'br-purple-recipe-as2x8yyo'
ROLE = 'edutunisie_app'
LOG_FILE = Path('/workspace/edutunisie/pdf-test/fix_subjects_v2.log')

# Mapping from AI subject → DB slug
SUBJECT_MAPPING = {
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
    'mathématiques et physique': 'physique',
    'svt': 'svt',
    'sciences de la vie et de la terre': 'svt',
    'sciences naturelles': 'svt',
    'sciences': 'svt',
    'sciences expérimentales': 'svt',
    'sciences experimentales': 'svt',
    'français': 'francais',
    'francais': 'francais',
    'french': 'francais',
    'anglais': 'anglais',
    'english': 'anglais',
    'allemand': '3eme-langue',
    'langue allemande': '3eme-langue',
    'espagnol': '3eme-langue',
    'espagne': '3eme-langue',
    'italien': '3eme-langue',
    'langue italienne': '3eme-langue',
    'langue': '3eme-langue',
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
    'تاريخ': 'histoire',
    'جغرافيا': 'geographie',
    'فلسفة': 'philosophie',
    'philosophie': 'philosophie',
    'pensée islamique': 'pensee-islamique',
    'éducation islamique': 'education-islamique',
    'technologie': 'technologie',
    'techniques': 'technologie',
    'sciences techniques': 'technologie',
    'technique': 'technologie',
    'informatique': 'informatique',
    'sciences de l\'informatique': 'informatique',
    'sciences de l’information': 'informatique',
    'sciences informatiques': 'informatique',
    'algorithmique et programmation': 'algo-prog',
    'algorithme et programmation': 'algo-prog',
    'algo & prog': 'algo-prog',
    'algorithme': 'algo-prog',
    'bases de données': 'bases-donnees',
    'système d\'exploitation et réseaux': 'systeme-exploitation-reseaux',
    'tic': 'tic',
    'éducation physique': 'sport',
    'sport': 'sport',
    'électricité': 'physique',
    'electricite': 'physique',
    'génie électrique': 'physique',
    'genie electrique': 'physique',
    'génie mécanique': 'technologie',
    'genie mecanique': 'technologie',
    'mécanique': 'physique',
    'mecanique': 'physique',
    'modélisation d’un système technique': 'technologie',
    'l’analyse descendante (methode sadt)': 'technologie',
    'l’analyse descendante (méthode sadt)': 'technologie',
    'structure d’un système technique': 'technologie',
    'lecture d’un dessin d’ensemble': 'technologie',
    'la vis d’archimède': 'technologie',
    'programmation en langage ‘’il’’ du grafcet codé automate': 'technologie',
    'analyse fonctionnelle d’un systeme technique': 'technologie',
    'economie & gestion': 'economie',
    'economie et service': 'economie',
    'education islamique': 'education-islamique',
    'education physique': 'sport',
    'analyse fonctionnelle dun systeme technique': 'technologie',
    'base de donnees': 'bases-donnees',
    'dessin de definition': 'technologie',
    'fonctionnement de systeme': 'technologie',
    'litterature': 'francais',
    'mathematiques et physique-chimie': 'mathematiques',
    'mecanisme': 'technologie',
    'oscillations mecaniques': 'physique',
    'oscillations mecaniques amorties et non amorties': 'physique',
    'pensee islamique': 'pensee-islamique',
    'physique  chimie': 'physique',
    'relativite du mouvement': 'physique',
    'sciences de linformation': 'informatique',
    'sciences de linformatique': 'informatique',
    "systeme d'exploitation et reseaux": 'systeme-exploitation-reseaux',
    'systeme de fabrication des boites en plastique': 'technologie',
    'systeme de numeration': 'informatique',
    'systeme de numeration et code numerique': 'informatique',
    'systeme de tri': 'technologie',
    'systeme de tri automatique': 'technologie',
    'systeme de triage automatique': 'technologie',
    "systemes d'information": 'bases-donnees',
    'technologie des systemes techniques': 'technologie',
    'economie-gestion': 'economie',
    'la technologie': 'technologie',
    "le dessin d'ensemble": 'technologie',
    "dessin d'ensemble": 'technologie',
    "dessin d'ensemble et nomenclature": 'technologie',
    'le syeteme technique': 'technologie',
    'le système technique': 'technologie',
    'les systèmes techniques': 'technologie',
    'systèmes techniques': 'technologie',
    'la perforatrice': 'technologie',
    'la diode': 'technologie',
    "la vis d'archimède": 'technologie',
    'la fonction mémoire': 'technologie',
    'la coupe simple': 'technologie',
    'la projection orthogonale et la cotation dimensionnelle': 'technologie',
    'système technique': 'technologie',
    "systeme d'encaissement": 'technologie',
    "système d'encaissement": 'technologie',
    "système d'entraînement": 'technologie',
    "mécanisme d'entraînement": 'technologie',
    'mécanisme de serrage': 'technologie',
    'mécanisme de dosage du café en poudre': 'technologie',
    'mécanisme : vé réglable en hauteur': 'technologie',
    'mécanisme de réglage de capteur': 'technologie',
    'système de fabrication des boites en plastique': 'technologie',
    'système de fabrication des assiettes en plastique': 'technologie',
    'système de production de films en plastique': 'technologie',
    'système de lavage des bidons': 'technologie',
    'système de triage automatique': 'technologie',
    'système de marquage et de rangement': 'technologie',
    "système d'ouverture": 'technologie',
    "système d'ouverture / fermeture motorisé du coffre de l'audi a8": 'technologie',
    'système automatique': 'technologie',
    'système automatique de fraisage et perçage': 'technologie',
    'système automatique de fraisage et perçage des pièces': 'technologie',
    "système d'usinage a plateau tournant": 'technologie',
    "système d'usinage": 'technologie',
    "système d'étude": 'technologie',
    "systeme d'étude": 'technologie',
    'poste de chargement des bouteilles de gaz': 'technologie',
    'poste de sertissage des boites de conserve': 'technologie',
    'poste de sertissage des boites de tomate': 'technologie',
    'poste automatique de perçage': 'technologie',
    'poste automatique de remplissage et de fermeture de paquets': 'technologie',
    'pompe de gonflage': 'technologie',
    'lavage de vehicules prépayé': 'technologie',
    "système climatisation d'une automobile": 'technologie',
    'chaîne de conditionnement de médicaments': 'technologie',
    'ligne automatisée de production des pains': 'technologie',
    'ligne automatisée de production du pains': 'technologie',
    'ligne automatisée de production de pains': 'technologie',
    'ligne automatisee de production de pains': 'technologie',
    'ligne automatisée de production': 'technologie',
    'liaison mécanique': 'technologie',
    'liaisons mécaniques': 'technologie',
    'les liaisons mécaniques': 'technologie',
    'les fonctions logiques universelles': 'technologie',
    'les fonctions electroniques': 'technologie',
    'les filetages': 'technologie',
    'cotation fonctionnelle': 'technologie',
    'fabrication de pots de fleurs': 'technologie',
    "découpage des barres d'acier": 'technologie',
    'dispositif de bridage': 'technologie',
    'bride de serrage': 'technologie',
    'flexion plane simple': 'technologie',
    "comportement d'un solide déformable": 'technologie',
    "comportement d'un solide deformable": 'technologie',
    'comportements des matériaux': 'technologie',
    'signalisation pour cuve': 'technologie',
    'logique combinatoire': 'technologie',
    'fonction commutation': 'technologie',
    'fonctions logiques': 'technologie',
    'fonctions logiques universelles': 'technologie',
    'fonctions logiques de base': 'technologie',
    'moto-réducteur': 'technologie',
    'moto-reducteur': 'technologie',
    'moteur- reducteur': 'technologie',
    'moteur- réducteur': 'technologie',
    'alliage': 'technologie',
    'alliages ferreux': 'technologie',
    'alliages non ferreux': 'technologie',
    'boîte de vitesses à embrayage-frein': 'technologie',
    'embrayage frein manuel': 'technologie',
    'fraiseuse automatique': 'technologie',
    'cric hydraulique': 'technologie',
    'roues de friction': 'technologie',
    'alimentation stabilisée': 'technologie',
    'imprimante laser': 'technologie',
    'transformateur': 'technologie',
    "lecture d'un dessin d'ensemble": 'technologie',
    'projection orthogonale et cotation dimensionnelle': 'technologie',
    "analyse fonctionnelle d'un système technique": 'technologie',
    'analyse fonctionnelle / système': 'technologie',
    "modélisation d'un système technique": 'technologie',
    "structure d'un système technique": 'technologie',
    'étude du moto-réducteur inverseur de station de lavage de voitures': 'technologie',
    "définition d'un produit": 'technologie',
    'définition graphique d’un produit': 'technologie',
    'dessin de définition': 'technologie',
    'malaxeur de sable automatisé': 'technologie',
    "système de conditionnement des bidons d'huile": 'technologie',
    'technologie électrique': 'technologie',
    'grafcet': 'technologie',
    'sad t': 'technologie',
    'sadt': 'technologie',
    "l'analyse descendante": 'technologie',
    "l'analyse descendante (methode sadt)": 'technologie',
    "l'analyse descendante (méthode sadt)": 'technologie',
    "l'analse descendante": 'technologie',
    "l'analse descendante (methode sadt)": 'technologie',
    "l'analse descendante (méthode sadt)": 'technologie',
    'analyse fonctionnelle': 'technologie',
    'programmation en langage': 'technologie',
    'fonctionnement de système': 'technologie',
    'mécanisme d’entraînement': 'technologie',
    'système d’ouverture': 'technologie',
    'système d’ouverture / fermeture motorisé du coffre de l’audi a8': 'technologie',
    'comportement d’un solide deformable': 'technologie',
    "système d'ouverture / fermeture motorisé du coffre de l'audi a8": 'technologie',
    'système d’ouverture / fermeture motorisé du coffre de l’audi a8': 'technologie',
    'système d’ouverture / fermeture motorisé du coffre de l’audi a8': 'technologie',
    'système d’ouverture / fermeture motorisé du coffre de l’audi a8': 'technologie',
    'mécanisme d\'entraînement': 'technologie',
    'mécanisme d\'entrainement': 'technologie',
    'analyse descendante': 'technologie',
    'analyse descendante (méthode sadt)': 'technologie',
    "l'anal se descendante": 'technologie',
    'l’anlyse descendante': 'technologie',
    'l’anlyse descendante (methode sadt)': 'technologie',
    'l’anlyse descendante (méthode sadt)': 'technologie',
    "l'anlyse descendante (methode sadt)": 'technologie',
    "l'anlyse descendante (méthode sadt)": 'technologie',
    'l’anlyse descendante (methode sadt)': 'technologie',
    'l’anlyse descendante (méthode sadt)': 'technologie',
    'système d\'ouverture': 'technologie',
    'système d\'ouverture / fermeture motorisé du coffre de l\'audi a8': 'technologie',
    'système d\'ouverture / fermeture motorisé du coffre de l’audi a8': 'technologie',
    'système d\'ouverture / fermeture motorisé du coffre de l’audi a8': 'technologie',
    'mécanisme d\'entraînement': 'technologie',
    'mécanisme d\'entrainement': 'technologie',
    'mécanisme d\'entraînement': 'technologie',
    
    # Bases de données variants
    'base de donnees': 'bases-donnees',
    
    # Histoire-Geo combined
    'التاريخ والجغرافيا': 'histoire',
    'تاريخ وجغرافيا': 'histoire',
    
    # Système exploitation + Réseaux
    'système & réseaux': 'systeme-exploitation-reseaux',
    'système et réseaux': 'systeme-exploitation-reseaux',
    "système d'exploitation": 'systeme-exploitation-reseaux',
    "système d'exploitation et réseaux": 'systeme-exploitation-reseaux',
    
    # Informatique
    "sciences de l'informatique": 'informatique',
    'sciences de l’information': 'informatique',
    "sciences de l'information": 'informatique',
    'sciences informatique': 'informatique',
    'sciences informatiques': 'informatique',
    
    # Biologie / Science
    'biologie': 'svt',
    'science physique': 'physique',
    'sciences physique': 'physique',
    
    # Final 16 missing
    'etude du moto-réducteur inverseur de station de lavage de voitures': 'technologie',
    'systeme d’etude': 'technologie',
    'système d’etude': 'technologie',
    'système d’étude': 'technologie',
    'système d’encaissement': 'technologie',
    'systeme d’encaissement': 'technologie',
    'definition d’un produit': 'technologie',
    'définition d’un produit': 'technologie',
    'systeme de grenaillage et de controle de brut': 'technologie',
    'système de grenaillage et de controle de brut': 'technologie',
    'systèmes & technologies de l’informatique': 'tic',
    'système d’ouverture / fermeture motorisé du coffre de l’audi a8': 'technologie',
    'comportement d’un solide deformable': 'technologie',
    'comportement d’un solide déformable': 'technologie',
    'systeme d’usinage a plateau tournant': 'technologie',
    'système d’usinage a plateau tournant': 'technologie',
    'l’analse descendante (methode sadt)': 'technologie',
    'l’analse descendante (méthode sadt)': 'technologie',
    "la vis d'archimède": 'technologie',
    'économie gestion': 'economie',
    'système technique: mécanisme de serrage': 'technologie',
    'mathématiques et physique-chimie': 'mathematiques',
    'موسيقى': 'musique',
    'الموسيقى': 'musique',
    'littérature': 'francais',
    'الأدب': 'arabe',
    'الأدب العربي': 'arabe',
    'économie et service': 'economie',
    'comptabilite': 'gestion',
    'comptabilité': 'gestion',
    'informatique / tic': 'tic',
    't.i.c.': 'tic',
    "technologie de l'information": 'tic',
    "technologies de l'information et de la communication": 'tic',
    "technologie de l'information et de la communication": 'tic',
    'deutsch': '3eme-langue',
    'langue espagnole': '3eme-langue',
    'systèmes d\'information': 'bases-donnees',
    'basis de donnees': 'bases-donnees',
    'bases de donnees': 'bases-donnees',
    'base de données': 'bases-donnees',
    'algo et programmation': 'algo-prog',
    'algorithmique': 'algo-prog',
    'algorithmique & programmation': 'algo-prog',
    'sciences informatique': 'informatique',
    "sciences de l'informatique": 'informatique',
    'sciences de l’informatique': 'informatique',
    'genie électrique': 'physique',
    'génie electrique': 'physique',
    'système de fabrication des boites en plastique': 'technologie',
    'fonctionnement de système': 'technologie',
    'système de numération et code numérique': 'informatique',
    'système de numération': 'informatique',
    'sciences technique': 'technologie',
    'sc. techniques': 'technologie',
    'discipline technique': 'technologie',
    'disciplines techniques': 'technologie',
    'système de tri automatique': 'technologie',
    'système de tri': 'technologie',
    'système de triage automatique': 'technologie',
    'signalisation pour cuve': 'technologie',
    'grafcet': 'technologie',
    'moteur- réducteur': 'technologie',
    'moteur- reducteur': 'technologie',
    'dessin de définition': 'technologie',
    'analyse fonctionnelle d’un système technique': 'technologie',
    'technologie des systèmes techniques': 'technologie',
    'fonctions logiques de base': 'technologie',
    'mécanisme': 'technologie',
    'mecanique': 'technologie',
    'mécanique': 'technologie',
    'تربية تكنولوجية': 'technologie',
    'تكنولوجيا': 'technologie',
    'التربية التقنية': 'technologie',
    'التكنولوجيا': 'technologie',
    'التربية التكنولوجية': 'technologie',
    'الفلسفة': 'philosophie',
    'التفكير الإبداعي': 'pensee-islamique',
    'التفكير السّمي': 'pensee-islamique',
    'التفكير السامي': 'pensee-islamique',
    'تربية إسلامية': 'pensee-islamique',
    'تفكير إسلامي': 'pensee-islamique',
    'فكر إسلامي': 'pensee-islamique',
    'التفكير الإسلامي': 'pensee-islamique',
    'العربية': 'arabe',
    'الجغرافيا': 'geographie',
    'التاريخ': 'histoire',
    'statistiques': 'mathematiques',
    'mathematiques et sciences physiques': 'mathematiques',
    'mathématiques et sciences physiques': 'mathematiques',
    'mathematiques et physique': 'mathematiques',
    'mathématiques et physique': 'mathematiques',
    'رياضيات': 'mathematiques',
    'الرياضيات': 'mathematiques',
    'علوم الفيزياء': 'physique',
    'علوم فيزيائية': 'physique',
    'علوم الفيزيائية': 'physique',
    'فيزياء': 'physique',
    'en physique': 'physique',
    'en physique-chimie': 'physique',
    'oscillations mécaniques amorties et non amorties': 'physique',
    'oscillations mécaniques': 'physique',
    'relativité du mouvement': 'physique',
    'electricité': 'physique',
    'sciences physiques et chimie': 'physique',
    'sc. physiques': 'physique',
    'sciences-physiques': 'physique',
    'sciences- physiques': 'physique',
    'sciences-phyiques': 'physique',
    'physique - chimie': 'physique',
    'physique – chimie': 'physique',
    'physique et chimie': 'physique',
}

# Skipped AI subjects (these are systemName in Technologie, not subject)
TECHNOLOGIE_SYSTEMS = [
    'graficet', 'grafcet',
    'fonctions logiques de base', 'fonctions logiques', 'fonctions logiques universelles',
    'dessin de définition', 'dessin d\'ensemble', 'dessin d\'ensemble et nomenclature',
    'cotation fonctionnelle', 'la cotation fonctionnelle',
    'définition graphique d\'un produit', 'définition d\'un produit',
    'liaisons mécaniques', 'liaison mécanique', 'les liaisons mécaniques',
    'système de numération', 'système de numération et code numérique',
    'lecture d\'un dessin d\'ensemble',
    'analyse fonctionnelle d\'un système technique', 'analyse fonctionnelle / système',
    'projection orthogonale et cotation dimensionnelle',
    'la projection orthogonale et la cotation dimensionnelle',
    'structure d\'un système technique',
    'système technique',
    'systèmes techniques',
    'la coupe simple', 'les filetages',
    'les fonctions electroniques', 'la fonction mémoire',
    'logique combinatoire',
    'flexion plane simple',
    'oscillations mécaniques', 'oscillations mécaniques amorties et non amorties',
    'relativité du mouvement',
    'la diode', 'transformateur',
    'comportements des matériaux', 'alliages non ferreux', 'alliages ferreux',
    'disciplines techniques', 'discipline technique',
    'système d’ouverture / fermeture motorisé du coffre de l’audi a8',
    'système automatique de fraisage et perçage', 'système automatique de fraisage et perçage des pièces',
    'poste automatique de perçage',
    'poste de sertissage des boites de conserve', 'poste de sertissage des boites de tomate',
    'mécanisme de serrage', 'mécanisme de dosage du café en poudre',
    'système de fabrication des assiettes en plastique',
    'système de fabrication des boites en plastique',
    'laveur de vehicules prépayé',
    'malaxeur de sable automatisé',
    'pont de marquage et de rangement',
    'système de production de films en plastique',
    'système d’encaissement',
    'système de conditionnement des bidons d\'huile',
    'système de lavage des bidons',
    'système de triage automatique',
    'système d\'usinage a plateau tournant',
    'système de grenaille et de controle de brut',
    'chaîne de conditionnement de médicaments',
    'ligne automatisée de production de pains',
    'ligne automatisée de production du pains',
    'mécanisme d’entraînement', 'mécanisme d\'entraînement',
    'mécanisme : vé réglable en hauteur',
    'moto-réducteur', 'moto reducteur',
    'boîte de vitesses à embrayage-frein',
    'embrayage frein manuel',
    'cric hydraulique',
    'dispositif de bridage', 'bride de serrage',
    'pompe de gonflage', 'fraiseuse automatique',
    'signalisation pour cuve',
    'la perforatrice',
    'imprimante laser',
    'l\'analse descendante (methode sadt)', 'l’analyse descendante (methode sadt)',
    'découpage des barres d\'acier',
    'réglage de capteur',
    'alimentation stabilisée',
    'laveur de vehicules prepaye',
    'definition d’un produit',
    'système d’etude', 'système d\'étude',
    'lave-linge', 'système d\'encaissement',
]


def log(msg):
    ts = time.strftime('%H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line, flush=True)
    with open(LOG_FILE, 'a') as f:
        f.write(line + '\n')


def neon_query(sql):
    body = {
        'db_name': 'neondb',
        'role_name': ROLE,
        'query': sql,
        'branch_id': BRANCH_ID,
    }
    req = urllib.request.Request(
        f'https://console.neon.tech/api/v2/projects/{NEON_PROJECT}/query',
        data=json.dumps(body).encode(),
        headers={
            'Authorization': f'Bearer {NEON_API_KEY}',
            'Content-Type': 'application/json',
        }
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def normalize_subject(s):
    if not s:
        return None
    s_lower = s.lower().strip()
    if s_lower in SUBJECT_MAPPING:
        return SUBJECT_MAPPING[s_lower]
    for key, val in SUBJECT_MAPPING.items():
        if key in s_lower or s_lower in key:
            return val
    if s_lower in TECHNOLOGIE_SYSTEMS:
        return 'technologie'  # System name → technologie
    return None


def main():
    log('=== STARTING fix_subjects_v2 ===')
    
    # Get subjects
    result = neon_query('SELECT id, slug FROM "Subject"')
    subject_id_by_slug = {}
    for row in result['response'][0]['data']['rows']:
        subject_id_by_slug[row[1]] = row[0]
    log(f'Loaded {len(subject_id_by_slug)} subjects')
    
    # Get all misclassified
    log('Finding misclassified resources...')
    result = neon_query("""
        SELECT 
            r.id, 
            r.title,
            cs.slug as current_slug,
            m.subject as ai_subject
        FROM "Resource" r
        JOIN "ResourceMetadata" m ON m."resourceId" = r.id
        JOIN "Subject" cs ON cs.id = r."subjectId"
        WHERE m.subject IS NOT NULL AND m.subject != ''
    """)
    
    if not result.get('response') or not result['response'][0].get('data', {}).get('rows'):
        log('No resources with AI metadata')
        return
    
    rows = result['response'][0]['data']['rows']
    log(f'Loaded {len(rows)} resources with AI metadata')
    
    to_fix = []
    skipped = 0
    unmapped = {}
    
    for row in rows:
        rid, title, current_slug, ai_subject = row
        new_slug = normalize_subject(ai_subject)
        if not new_slug:
            unmapped[ai_subject] = unmapped.get(ai_subject, 0) + 1
            continue
        if new_slug not in subject_id_by_slug:
            unmapped[f'{ai_subject} -> {new_slug}'] = unmapped.get(f'{ai_subject} -> {new_slug}', 0) + 1
            continue
        if new_slug == current_slug:
            skipped += 1
            continue
        to_fix.append((rid, current_slug, new_slug, subject_id_by_slug[new_slug], title[:50]))
    
    log(f'  Already correct: {skipped}')
    log(f'  To fix: {len(to_fix)}')
    
    if unmapped:
        log('  Unmapped (top 20):')
        for subj, cnt in sorted(unmapped.items(), key=lambda x: -x[1])[:20]:
            log(f'    {cnt:4} × {subj[:60]}')
    
    if not to_fix:
        log('Nothing to fix')
        return
    
    # Distribution
    log('\nDistribution of changes:')
    dist = {}
    for _, cur, new, _, _ in to_fix:
        k = f'{cur} -> {new}'
        dist[k] = dist.get(k, 0) + 1
    for k, v in sorted(dist.items(), key=lambda x: -x[1])[:15]:
        log(f'  {v:4} × {k}')
    
    # Apply in batches
    log(f'\nApplying {len(to_fix)} fixes...')
    fixed = 0
    failed = 0
    BATCH = 50
    for i in range(0, len(to_fix), BATCH):
        batch = to_fix[i:i+BATCH]
        for rid, cur, new, new_id, _ in batch:
            try:
                rid_safe = rid.replace("'", "''")
                neon_query(f"UPDATE \"Resource\" SET \"subjectId\" = '{new_id}', \"updatedAt\" = NOW() WHERE id = '{rid_safe}'")
                fixed += 1
            except Exception as e:
                log(f'  FAILED: {rid[:20]}: {str(e)[:80]}')
                failed += 1
        log(f'  Batch {i//BATCH + 1}: {fixed}/{len(to_fix)} done')
        time.sleep(0.5)
    
    log(f'\nCOMPLETE: {fixed} fixed, {failed} failed')


if __name__ == '__main__':
    main()
