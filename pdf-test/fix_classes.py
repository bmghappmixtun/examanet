#!/usr/bin/env python3
"""
Normalize Resource.classId to match AI's level detection.
- Map AI level text to DB Class slug
- Skip unmapped (ambiguous like "Collège" or "standard")
- Use bulk_math_v5 helper for classId lookup
"""
import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
import re

def normalize_level(ai_level):
    """Map AI level text to DB class slug, or None if ambiguous."""
    if not ai_level:
        return None
    text = ai_level.lower().strip()
    # Strip "Classe " prefix
    text = re.sub(r'^classe\s*:?\s*', '', text)
    # Strip "niveau " prefix
    text = re.sub(r'^niveau\s*', '', text)
    # Strip "Classe : " prefix
    text = re.sub(r'^classe\s*:\s*', '', text)
    
    # First check for lycée patterns
    LYCEE_MAP = {
        '1ère année secondaire': '1ere-secondaire', '1ère année': '1ere-secondaire',
        '1ere année secondaire': '1ere-secondaire', 'première année secondaire': '1ere-secondaire',
        'première année': '1ere-secondaire', '1ère s': '1ere-secondaire', '1s': '1ere-secondaire',
        '1s1': '1ere-secondaire', '1ère s1': '1ere-secondaire', '1ère s2': '1ere-secondaire',
        '1ère s3': '1ere-secondaire', '1ère s4': '1ere-secondaire', '1ère s1+s2': '1ere-secondaire',
        '1ère année s': '1ere-secondaire', '1ère année s1': '1ere-secondaire',
        '1re année': '1ere-secondaire', '1er s 14': '1ere-secondaire',
        '1ère sec': '1ere-secondaire', '1 ère année': '1ere-secondaire',
        '1ère secondaire': '1ere-secondaire', '1ère année secondaire': '1ere-secondaire',
        '1ère as': '1ere-secondaire', '1ère année sec.': '1ere-secondaire',
        
        '2ème année secondaire': '2eme-secondaire', '2ème année': '2eme-secondaire',
        '2eme année secondaire': '2eme-secondaire', 'deuxième année secondaire': '2eme-secondaire',
        'deuxième secondaire': '2eme-secondaire', '2ième année secondaire': '2eme-secondaire',
        '2eme sciences': '2eme-secondaire', '2ème sciences': '2eme-secondaire',
        '2 science': '2eme-secondaire', '2 sciences': '2eme-secondaire',
        '2ème sciences 1': '2eme-secondaire', '2ème sciences 1,2': '2eme-secondaire',
        '2ème sciences 2,5': '2eme-secondaire', '2ième sc': '2eme-secondaire',
        '2 ème année sciences': '2eme-secondaire', '2éme sciences': '2eme-secondaire',
        '2eme science': '2eme-secondaire', '2ième science': '2eme-secondaire',
        
        '3ème année secondaire': '3eme-secondaire', '3ème année': '3eme-secondaire',
        '3eme année secondaire': '3eme-secondaire', 'troisième année secondaire': '3eme-secondaire',
        'troisième secondaire': '3eme-secondaire', '3ème': '3eme-secondaire', '3eme': '3eme-secondaire',
        '3 math': '3eme-secondaire', '3maths': '3eme-secondaire', '3math': '3eme-secondaire',
        '3maths': '3eme-secondaire', '3 math g1': '3eme-secondaire', '3 math g2': '3eme-secondaire',
        '3ème math': '3eme-secondaire', '3ème maths': '3eme-secondaire', '3ième math': '3eme-secondaire',
        '3 m': '3eme-secondaire', '3ème m': '3eme-secondaire', '3eme math': '3eme-secondaire',
        '3ième m1': '3eme-secondaire', '3 sc': '3eme-secondaire', '3s.exp': '3eme-secondaire',
        '3ème sc': '3eme-secondaire', '3ème sc. exp': '3eme-secondaire', '3ème sc.exp': '3eme-secondaire',
        '3 sc. exp.': '3eme-secondaire', '3ème sc-': '3eme-secondaire',
        '3eme sciences expérimentales': '3eme-secondaire',
        '3ème année sciences 2': '3eme-secondaire', '3ème sciences': '3eme-secondaire',
        '3ème année secondaire': '3eme-secondaire', '3ème année s.tech': '3eme-secondaire',
        '3ème tech': '3eme-secondaire', '3 t': '3eme-secondaire', '3t1': '3eme-secondaire',
        '3 ème tech': '3eme-secondaire', '3ème technique': '3eme-secondaire',
        '3 technique': '3eme-secondaire', '3eme sciences': '3eme-secondaire',
        '3ème année technique': '3eme-secondaire', '3ème technique et info': '3eme-secondaire',
        '3ème année techn2': '3eme-secondaire', '3ème année éco': '3eme-secondaire',
        '3ème eco': '3eme-secondaire', '3ème eco. et gestion': '3eme-secondaire',
        '3ème eco & ges': '3eme-secondaire', '3 eco': '3eme-secondaire',
        '3eco': '3eme-secondaire', '3ème économie et service': '3eme-secondaire',
        '3ème économie et gestion': '3eme-secondaire', '3ème économie-gestion': '3eme-secondaire',
        '3ème économique': '3eme-secondaire', '3economie': '3eme-secondaire',
        '3ème lettres': '3eme-secondaire', '3lettres': '3eme-secondaire',
        '3ème année lettres': '3eme-secondaire', '3 lettres': '3eme-secondaire',
        '3eme lettres': '3eme-secondaire', '3eme science expérimentale': '3eme-secondaire',
        '3ème science': '3eme-secondaire', '3e sc. exp': '3eme-secondaire',
        '3e m': '3eme-secondaire', '3ième eg': '3eme-secondaire', '3 sc-': '3eme-secondaire',
        '3 ème sc.exp': '3eme-secondaire', '3 eme economie et service': '3eme-secondaire',
        '3eme année': '3eme-secondaire', '3ème année': '3eme-secondaire',
        '3e année': '3eme-secondaire', '3ième année': '3eme-secondaire',
        '3ème année secondaire': '3eme-secondaire', '3ème année eco et gestion': '3eme-secondaire',
        '3ème année s.tech': '3eme-secondaire', '3ème années': '3eme-secondaire',
        
        '4ème année secondaire': '4eme-secondaire', '4ème année': '4eme-secondaire',
        '4eme année secondaire': '4eme-secondaire', 'quatrième année secondaire': '4eme-secondaire',
        '4eme': '4eme-secondaire', '4ème': '4eme-secondaire', '4 éme': '4eme-secondaire',
        '4éme': '4eme-secondaire', '4 éme année': '4eme-secondaire',
        '4eme année': '4eme-secondaire', '4eme technique': '4eme-secondaire',
        '4ème technique': '4eme-secondaire', '4ème techniques': '4eme-secondaire',
        '4 t': '4eme-secondaire', '4t1': '4eme-secondaire', '4tech': '4eme-secondaire',
        '4 math': '4eme-secondaire', '4maths': '4eme-secondaire', '4math': '4eme-secondaire',
        '4math': '4eme-secondaire', '4 math': '4eme-secondaire', '4maths': '4eme-secondaire',
        '4ème math': '4eme-secondaire', '4ème maths': '4eme-secondaire', '4éme math': '4eme-secondaire',
        '4 m': '4eme-secondaire', '4m': '4eme-secondaire', '4ème m': '4eme-secondaire',
        '4eme m': '4eme-secondaire', '4 m1-2': '4eme-secondaire', '4 math1': '4eme-secondaire',
        '4ème sc': '4eme-secondaire', '4 sc': '4eme-secondaire', '4sc': '4eme-secondaire',
        '4 sc exp': '4eme-secondaire', '4ème sc.exp': '4eme-secondaire', '4ème sc exp': '4eme-secondaire',
        '4ème sc. exp': '4eme-secondaire', '4 ème sc.info': '4eme-secondaire',
        '4ème s. exp': '4eme-secondaire', '4eme sc exp': '4eme-secondaire',
        '4ème sciences expérimentales': '4eme-secondaire', '4ème sc.exp': '4eme-secondaire',
        '4ème sc-': '4eme-secondaire', '4ème sc-': '4eme-secondaire',
        '4ème sciences exp': '4eme-secondaire', '4ème sciences': '4eme-secondaire',
        '4ème sciences exp.': '4eme-secondaire', '4ème science': '4eme-secondaire',
        '4ème s': '4eme-secondaire', '4s': '4eme-secondaire', '4sciences': '4eme-secondaire',
        '4 sciences': '4eme-secondaire', '4 ème science': '4eme-secondaire',
        '4e sc. exp.': '4eme-secondaire', '4 eme s.i': '4eme-secondaire', '4 e-g': '4eme-secondaire',
        '4economie': '4eme-secondaire', '4ème eco': '4eme-secondaire', '4eme eco': '4eme-secondaire',
        '4 e-g': '4eme-secondaire', '4 eg': '4eme-secondaire', '4 eco': '4eme-secondaire',
        '4ème eco & gestion': '4eme-secondaire', '4ème eco. & gestion': '4eme-secondaire',
        '4ème economie': '4eme-secondaire', '4ème economie et gestion': '4eme-secondaire',
        '4ème economie-gestion': '4eme-secondaire', '4ème economie-gestion': '4eme-secondaire',
        '4ème éco 2': '4eme-secondaire', '4ème économie-gestion': '4eme-secondaire',
        '4ème économie et gestion': '4eme-secondaire', '4ème lettres': '4eme-secondaire',
        '4ème lettres 1+2': '4eme-secondaire', '4 lettres': '4eme-secondaire',
        '4ème lettre2': '4eme-secondaire', '4ème secondaire': '4eme-secondaire',
        '4eme secondaire': '4eme-secondaire', '4ème année intermédiaire': '4eme-secondaire',
        '4ème année': '4eme-secondaire', '4ème année mathématiques': '4eme-secondaire',
        '4ème année sciences expérimentales': '4eme-secondaire', '4ème année sc': '4eme-secondaire',
        '4ème année sciences': '4eme-secondaire', '4ème année sci': '4eme-secondaire',
        '4ème année techniques': '4eme-secondaire', '4ème année technique': '4eme-secondaire',
        '4ème année e & g': '4eme-secondaire', '4ème année (sciences expérimentales)': '4eme-secondaire',
        '4 ème année sciences expérimentales': '4eme-secondaire', '4 sc.informatique': '4eme-secondaire',
        '4eme sc.informatique': '4eme-secondaire', '4 si': '4eme-secondaire', '4 s.i': '4eme-secondaire',
        '4ème si': '4eme-secondaire', '4 s.i.': '4eme-secondaire', '4 s.inf': '4eme-secondaire',
        '4ème s.inf': '4eme-secondaire', '4ème sciences informatiques': '4eme-secondaire',
        '4ème sciences informatique': '4eme-secondaire', '4e année secondaire': '4eme-secondaire',
        '4eme année': '4eme-secondaire', '4eme annee': '4eme-secondaire',
        '4 ème': '4eme-secondaire', '4eme année secondaire': '4eme-secondaire',
        '4ème techniques': '4eme-secondaire', '4ème eco.1, 2 et 3': '4eme-secondaire',
        '4ème é g': '4eme-secondaire', '4ème é. g': '4eme-secondaire', '4ème e. g': '4eme-secondaire',
        '4ème st': '4eme-secondaire', '4 ème tec': '4eme-secondaire', '4°tech': '4eme-secondaire',
        '4 st': '4eme-secondaire', '4èm sc': '4eme-secondaire', '4ième tec': '4eme-secondaire',
        '4ièm sc': '4eme-secondaire', '4ième sc': '4eme-secondaire',
        '4ème sciences de l’info.': '4eme-secondaire', '4ème sciences de l’informatique': '4eme-secondaire',
        '4ème année sc. tech.': '4eme-secondaire', '4ème techniques 2': '4eme-secondaire',
        '4 tech ii': '4eme-secondaire', '4 eme année': '4eme-secondaire', '4eme année secondaire': '4eme-secondaire',
        '4em sc. techniques': '4eme-secondaire', '4ème sc.tech3': '4eme-secondaire',
        '4ème sc-': '4eme-secondaire', '4ème sc.inf': '4eme-secondaire', '4eme sc-': '4eme-secondaire',
        '4°math.': '4eme-secondaire', '4eme sc': '4eme-secondaire', '4 sc 2': '4eme-secondaire',
        '4 sc 1': '4eme-secondaire', '4 sc 01': '4eme-secondaire', '4 sc. exp 2': '4eme-secondaire',
        '4 ème sc.exp': '4eme-secondaire', '4ème sc.t': '4eme-secondaire',
        '4ème année (sciences informatiques)': '4eme-secondaire', '4ème sc 1': '4eme-secondaire',
        '4eme sc.tech': '4eme-secondaire', '4ème sc.exp2': '4eme-secondaire',
        '4ème sc exp 01': '4eme-secondaire', '4ème sc.exp.': '4eme-secondaire',
        '4ème sc.exp 2': '4eme-secondaire', '4éme sciences informatiques': '4eme-secondaire',
        '4ème sc 1+2': '4eme-secondaire', '4ème économie-gestion': '4eme-secondaire',
        '4ème eco ges': '4eme-secondaire', '4ème économique': '4eme-secondaire',
        '4ème mathématiques': '4eme-secondaire', '4ème scientifique': '4eme-secondaire',
        '4ème scientifiques': '4eme-secondaire', '4ème sport': '4eme-secondaire',
        '4 sport': '4eme-secondaire', '4ème science': '4eme-secondaire',
        '4economie': '4eme-secondaire', '4emeconomie': '4eme-secondaire',
        '4emeeco': '4eme-secondaire', '4em sc': '4eme-secondaire',
        '4ème sc.informatique': '4eme-secondaire', '4ème sc.info': '4eme-secondaire',
        '4ème sc.inf.': '4eme-secondaire', '4ième eg': '4eme-secondaire',
        '4ième sciences': '4eme-secondaire', '4ième sciences expérimentales': '4eme-secondaire',
        '4ième sciences expérimentales': '4eme-secondaire', '4ième se': '4eme-secondaire',
        '4ième économie et gestion': '4eme-secondaire', '4eme technique': '4eme-secondaire',
        '4e technique': '4eme-secondaire', '4tech2-3': '4eme-secondaire',
        '4ém sc. techniques': '4eme-secondaire', '4em s.t': '4eme-secondaire',
        '4em sc.inf': '4eme-secondaire', '4ème année': '4eme-secondaire',
        '4ème eco ges': '4eme-secondaire', '4e s.informatique': '4eme-secondaire',
        '4ème économie': '4eme-secondaire', '4eme année': '4eme-secondaire',
        '4ème année sciences expérimentales': '4eme-secondaire', '4ème année (sciences expérimentales)': '4eme-secondaire',
        '4ème année lettres': '4eme-secondaire', '4ème lettres 1+2': '4eme-secondaire',
        '4ème lettres2': '4eme-secondaire', '4 ème année': '4eme-secondaire',
        '4ème sc-': '4eme-secondaire', '4ème tech': '4eme-secondaire', '4ème sc.inf': '4eme-secondaire',
        '4ème sc. exp.': '4eme-secondaire', '4èm s.exp': '4eme-secondaire',
        '4em sc exp': '4eme-secondaire', '4ème s.informatique': '4eme-secondaire',
        '4e s.expérimentales': '4eme-secondaire', '4ème sc.exp.': '4eme-secondaire',
        '4ème sc.exp.': '4eme-secondaire', '4em sc': '4eme-secondaire', '4ème s.t.2': '4eme-secondaire',
        '4 sc.exp': '4eme-secondaire', '4s exp': '4eme-secondaire', '4e sc.exp.': '4eme-secondaire',
        '4eme s.informatique': '4eme-secondaire', '4ème sc-': '4eme-secondaire',
        '4ème sc 1+2': '4eme-secondaire', '4 ème sport': '4eme-secondaire',
        '4ème année (sciences informatiques)': '4eme-secondaire', '4ème science 2': '4eme-secondaire',
        '4ème sci': '4eme-secondaire', '4ème sciences informatiques': '4eme-secondaire',
        '4ème maths1': '4eme-secondaire', '4ème maths 1 & 2': '4eme-secondaire',
        '4ème maths 2': '4eme-secondaire', '4ème sc-': '4eme-secondaire',
        '4ème sc-': '4eme-secondaire', '4eme sc': '4eme-secondaire',
        '4ème sc 1+2+3': '4eme-secondaire', '4ème sc 1+2': '4eme-secondaire',
        '4ème math 1': '4eme-secondaire', '4ème é. g': '4eme-secondaire', '4ème é g': '4eme-secondaire',
        '4èm technique': '4eme-secondaire', '4ème éco 2': '4eme-secondaire',
        '4ème e-g': '4eme-secondaire', '4ème eg': '4eme-secondaire', '4ème eco.1, 2 et 3': '4eme-secondaire',
        '4ème sport': '4eme-secondaire', '4ème sc.': '4eme-secondaire',
        '4ème e.g': '4eme-secondaire', '4ème e g': '4eme-secondaire',
        '4ème sc 1': '4eme-secondaire', '4ème sc 1+2': '4eme-secondaire',
        '4ème sc1+2+3': '4eme-secondaire', '4ème sc 1+2': '4eme-secondaire',
        
        # Bac / Terminal
        'bac': '4eme-secondaire', 'terminale': '4eme-secondaire', 'baccalauréat': '4eme-secondaire',
        'terminales s': '4eme-secondaire', 'bac lettres': '4eme-secondaire', 'bac maths': '4eme-secondaire',
        'bac eco': '4eme-secondaire', 'bac info': '4eme-secondaire', 'bac sciences': '4eme-secondaire',
        'bac -eco': '4eme-secondaire', 'bac-eco': '4eme-secondaire', 'bac sc techniques': '4eme-secondaire',
        'bac -sc': '4eme-secondaire', 'bac technique 1': '4eme-secondaire', 'bac t': '4eme-secondaire',
        'bac eco 1': '4eme-secondaire', 'bac sciences expérimentales': '4eme-secondaire',
        'bac sciences 2': '4eme-secondaire', 'bac sciences de l’informatique': '4eme-secondaire',
        'bac (4ème année secondaire)': '4eme-secondaire', 'bac 2012': '4eme-secondaire',
        'bac 2026': '4eme-secondaire', 'tle d': '4eme-secondaire', 'bac sc': '4eme-secondaire',
        'tronc commun': '4eme-secondaire', 'classes terminales': '4eme-secondaire',
        
        # Collège
        '7ème année de base': '7eme', '7ème année': '7eme', '7eme année': '7eme',
        '7ème': '7eme', 'septième': '7eme', 'septième année': '7eme',
        '7ème de base': '7eme', 'niveau 7': '7eme', '7ème année de base': '7eme',
        '7eme année de base': '7eme', '7eme base 1': '7eme', '7eme base 2': '7eme',
        '8ème année de base': '8eme', '8ème année': '8eme', '8eme année': '8eme',
        '8ème': '8eme', '8eme': '8eme', 'huitième année': '8eme', 'huitième': '8eme',
        '8ème de base': '8eme', '8eme de base': '8eme', 'niveau 8': '8eme',
        '8 b 4': '8eme', '8ème base 2': '8eme', '8ème base 4': '8eme',
        '9ème année de base': '9eme', '9ème année': '9eme', '9eme année': '9eme',
        '9ème': '9eme', '9eme': '9eme', 'neuvième année': '9eme', 'neuvième': '9eme',
        '9ème de base': '9eme', '9eme de base': '9eme', '9ème base': '9eme',
        '9ème base 1': '9eme', 'niveau 9': '9eme',
    }
    
    if text in LYCEE_MAP:
        return LYCEE_MAP[text]
    
    # Try to extract a number prefix
    m_num = re.match(r'(\d+)\s*(?:ère|eme|éme|ème|e)?\s*(année|an)?\s*(secondaire|anné)?', text)
    if m_num:
        n = int(m_num.group(1))
        if 1 <= n <= 4:
            return f'{["1ere","2eme","3eme","4eme"][n-1]}-secondaire'
        if 7 <= n <= 9:
            return f'{n}eme'
    
    # Arabic numbers
    AR_NUMS = {'الأول': 1, 'ثاني': 2, 'ثانية': 2, 'ثالث': 3, 'ثالثة': 3, 'رابع': 4, 'رابعة': 4,
               'سابع': 7, 'سابعة': 7, 'ثامن': 8, 'ثامنة': 8, 'تاسع': 9, 'تاسعة': 9}
    ar = ai_level.strip()
    for word, n in AR_NUMS.items():
        if word in ar:
            if 1 <= n <= 4:
                return f'{["1ere","2eme","3eme","4eme"][n-1]}-secondaire'
            if 7 <= n <= 9:
                return f'{n}eme'
    
    return None


def get_mismatches(limit=None):
    lim = f'LIMIT {limit}' if limit else ''
    r = mod.neon_query(f"""
        SELECT r.id, r."numericId", c.slug as db_class, rm.level as ai_level
        FROM "Resource" r
        JOIN "Class" c ON c.id = r."classId"
        JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
        WHERE r.status = 'PUBLISHED' AND rm.level IS NOT NULL AND rm.level != ''
        {lim}
    """)
    return r.get('response', [{}])[0].get('data', {}).get('rows', [])


def main():
    apply = '--apply' in sys.argv
    limit = None
    for arg in sys.argv[1:]:
        if arg.startswith('--limit='):
            limit = int(arg.split('=')[1])
        elif arg.isdigit():
            limit = int(arg)
    
    rows = get_mismatches(limit=limit)
    print(f'Total with AI level: {len(rows)}')
    
    to_update = []
    ok = 0
    unmapped = {}
    for rid, nid, db_class, ai_level in rows:
        new_class = normalize_level(ai_level)
        if not new_class:
            unmapped[ai_level] = unmapped.get(ai_level, 0) + 1
            continue
        if new_class == db_class:
            ok += 1
            continue
        to_update.append((rid, nid, db_class, new_class, ai_level))
    
    print(f'Already correct: {ok}')
    print(f'To update: {len(to_update)}')
    print(f'Unmapped: {len(unmapped)}')
    
    if unmapped:
        print('\nUnmapped (top 20):')
        for t, c in sorted(unmapped.items(), key=lambda x: -x[1])[:20]:
            print(f'  {c:4} × {t!r}')
    
    if to_update:
        print('\nFirst 10 samples:')
        for rid, nid, db, new, ai in to_update[:10]:
            print(f'  NID {nid}: DB={db} AI={ai!r} → {new}')
    
    if not apply:
        print('\n*** DRY RUN - use --apply to update ***')
        return
    
    # Get classId mapping
    r = mod.neon_query('SELECT id, slug FROM "Class"')
    class_id_by_slug = {}
    for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
        class_id_by_slug[row[1]] = row[0]
    
    print(f'\nApplying {len(to_update)} updates...')
    BATCH = 200
    updated = 0
    errors = 0
    for i in range(0, len(to_update), BATCH):
        batch = to_update[i:i+BATCH]
        case_sql = 'CASE id '
        for rid, nid, db, new, ai in batch:
            case_sql += f"WHEN '{rid}' THEN '{class_id_by_slug[new]}' "
        case_sql += 'END'
        ids_sql = "', '".join(r[0] for r in batch)
        try:
            r = mod.neon_query(f"""
                UPDATE "Resource" 
                SET "classId" = {case_sql}, "updatedAt" = NOW()
                WHERE id IN ('{ids_sql}')
            """)
            if r.get('success'):
                updated += len(batch)
                print(f'  [{i+len(batch)}/{len(to_update)}] ✓', flush=True)
            else:
                errors += len(batch)
                print(f'  [ERR] batch {i}: {r.get("error", str(r))[:200]}')
        except Exception as e:
            errors += len(batch)
            print(f'  [ERR] batch {i}: {str(e)[:200]}')
    
    print(f'\n✅ Updated: {updated}')
    print(f'❌ Errors: {errors}')


if __name__ == '__main__':
    main()
