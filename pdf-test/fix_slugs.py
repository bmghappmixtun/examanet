#!/usr/bin/env python3
"""
Regenerate Resource.slug from title for SEO-friendly URLs.

Strategy:
- Convert title to lowercase, replace accents, normalize spaces
- Strip type/subtype prefixes that are repetitive
- Keep N°X, year, class
- Limit to 80 chars

Format: <type-short>-<objet>-<class>-<year>
Example: "Devoir de synthèse N°3 - Technologie : Station de peinture - 4ème année secondaire Technique - [2012-2013]"
  → "devoir-synthese-n-3-station-de-peinture-4eme-technique"
"""
import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
import re
import unicodedata

def strip_accents(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

def slugify(text, max_len=80):
    if not text:
        return None
    # Lowercase + strip accents
    text = strip_accents(text.lower())
    # Replace special characters
    text = text.replace('°', '-').replace('²', '2').replace('³', '3')
    text = text.replace("'", '-').replace('"', '-')
    # Remove brackets
    text = re.sub(r'[\[\]\(\)\{\}]', '', text)
    # Replace separators with -
    text = re.sub(r'[\s:;,/\\|]+', '-', text)
    # Remove non-alphanumeric (except -)
    text = re.sub(r'[^a-z0-9\-]', '', text)
    # Collapse multiple -
    text = re.sub(r'-+', '-', text)
    # Strip leading/trailing -
    text = text.strip('-')
    # Truncate
    if len(text) > max_len:
        text = text[:max_len].rstrip('-')
    return text


def build_slug_from_title(title, subject_slug=None, db_class=None, db_section=None, year=None, hwnum=None, ai_subject=None, system_name=None):
    """Build a clean SEO-friendly slug from title + AI metadata."""
    parts = []
    
    # 1. Type prefix
    title_lower = (title or '').lower()
    if title_lower.startswith('devoir de contrôle') or title_lower.startswith('devoir de controle'):
        parts.append('devoir-controle')
    elif title_lower.startswith('devoir de synthèse') or title_lower.startswith('devoir de synthese'):
        parts.append('devoir-synthese')
    elif title_lower.startswith('devoir à la maison') or title_lower.startswith('devoir a la maison'):
        parts.append('devoir-maison')
    elif title_lower.startswith('devoir'):
        parts.append('devoir')
    elif title_lower.startswith('cours bac blanc'):
        parts.append('cours-bac-blanc')
    elif title_lower.startswith('cours'):
        parts.append('cours')
    elif title_lower.startswith("série d'exercices") or title_lower.startswith("serie d'exercices"):
        parts.append('serie')
    elif title_lower.startswith('examen'):
        parts.append('examen')
    elif title_lower.startswith('révision') or title_lower.startswith('revision'):
        parts.append('revision')
    elif title_lower.startswith('résumé') or title_lower.startswith('resume'):
        parts.append('resume')
    else:
        parts.append('document')
    
    # 2. Homework number
    m = re.search(r"n[°o]?\s*(\d+)", title, re.IGNORECASE)
    if m:
        parts.append(f'n-{m.group(1)}')
    
    # 3. Topic descriptor - the most SEO-valuable part
    descriptor = None
    if ':' in title:
        after_colon = title.split(':', 1)[1]
        descriptor = after_colon.split(' - ')[0].strip()
    
    SUBJ_STOPWORDS = {'mathématiques', 'physique', 'svt', 'français', 'anglais', 'arabe',
                      'philosophie', 'histoire', 'géographie', 'économie', 'gestion',
                      'technologie', 'informatique', 'sport', 'musique', 'mathematiques',
                      'inconnu', 'système', 'algo-prog', 'francais', 'geographie',
                      'economie', 'allemand', 'espagnol', 'italien'}
    
    if descriptor and descriptor.lower() not in SUBJ_STOPWORDS and len(descriptor) > 3:
        desc_slug = slugify(descriptor, max_len=50)
        if desc_slug and desc_slug not in ' '.join(parts):
            parts.append(desc_slug)
    elif system_name and len(system_name) > 3 and system_name.lower() not in SUBJ_STOPWORDS:
        desc_slug = slugify(system_name, max_len=50)
        if desc_slug and desc_slug not in ' '.join(parts):
            parts.append(desc_slug)
    elif subject_slug:
        # Always include the subject as final fallback
        subj_slug = slugify(subject_slug, max_len=20)
        if subj_slug and subj_slug not in ' '.join(parts):
            parts.append(subj_slug)
    
    # 4. Class abbreviation
    CLASS_MAP = {
        '1ère année secondaire': '1as',
        '2ème année secondaire': '2as',
        '3ème année secondaire': '3as',
        '4ème année secondaire': '4as',
        '7ème année de base': '7e',
        '8ème année de base': '8e',
        '9ème année de base': '9e',
    }
    # Try direct match, then strip "(Bac)"
    cls = db_class
    if cls and cls not in CLASS_MAP:
        cls = cls.replace(' (Bac)', '').replace('(Bac)', '').strip()
    if cls in CLASS_MAP:
        parts.append(CLASS_MAP[cls])
    
    # 5. Section abbreviation
    SECTION_MAP = {
        'Sciences': 'sciences',
        'Mathématiques': 'maths',
        'Sciences Expérimentales': 'sc-exp',
        'Sciences expérimentales': 'sc-exp',
        'Technique': 'tech',
        'Économie et services': 'eco',
        'Économie-Gestion': 'eco',
        'Lettres': 'lettres',
        'Informatique': 'info',
    }
    if db_section in SECTION_MAP:
        sec_slug = SECTION_MAP[db_section]
        if sec_slug not in ' '.join(parts):
            parts.append(sec_slug)
    
    # 6. Year
    if year:
        parts.append(str(year))
    
    # Join and clean
    slug = '-'.join(parts)
    slug = slugify(slug, max_len=80)
    return slug

def get_candidates(limit=None):
    lim = f'LIMIT {limit}' if limit else ''
    r = mod.neon_query(f"""
        SELECT r.id, r."numericId", r.title, r.slug as old_slug, r.type,
          s.slug as db_subject, c."nameFr" as db_class, sec."nameFr" as db_section,
          rm.type as ai_type, rm.year, rm.subject, rm."systemName",
          rme."homeworkNumber"
        FROM "Resource" r
        LEFT JOIN "Subject" s ON s.id = r."subjectId"
        LEFT JOIN "Class" c ON c.id = r."classId"
        LEFT JOIN "Section" sec ON sec.id = r."sectionId"
        LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
        LEFT JOIN "ResourceMetadataExtra" rme ON rme."resourceId" = r.id
        WHERE r.status = 'PUBLISHED' AND r.title IS NOT NULL
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
    
    rows = get_candidates(limit=limit)
    print(f'Total resources: {len(rows)}')
    
    to_update = []
    unchanged = 0
    
    # Patterns that indicate "bad" slugs that need updating
    BAD_PATTERNS = [
        re.compile(r'\.pdf$'),  # ends with .pdf
        re.compile(r'\(\d+\)$'),  # ends with (123)
        re.compile(r'^-?\d'),  # starts with digit
        re.compile(r'_(?!$)'),  # has underscores
        re.compile(r'\.\w{2,4}$'),  # ends with .xx
    ]
    
    def is_bad_slug(slug):
        if not slug:
            return True
        for p in BAD_PATTERNS:
            if p.search(slug):
                return True
        return False
    
    for rid, nid, title, old_slug, db_type, db_subject, db_class, db_section, ai_type, year, ai_subject, system_name, hwnum in rows:
        new_slug = build_slug_from_title(title, db_subject, db_class, db_section, year, hwnum, ai_subject, system_name)
        if not new_slug:
            unchanged += 1
            continue
        # Update if old slug is bad OR new slug is much cleaner
        if not is_bad_slug(old_slug) and old_slug == new_slug:
            unchanged += 1
            continue
        if old_slug == new_slug:
            unchanged += 1
            continue
        to_update.append((rid, nid, old_slug, new_slug, title))
    
    print(f'Unchanged: {unchanged}')
    print(f'To update: {len(to_update)}')
    
    # Sample 10
    print('\nSample updates:')
    for rid, nid, old, new, title in to_update[:10]:
        print(f'\n  NID {nid}: {title[:70]}')
        print(f'    OLD: {old}')
        print(f'    NEW: {new}')
    
    if not apply:
        print('\n*** DRY RUN - use --apply to update ***')
        return
    
    print(f'\nApplying {len(to_update)} updates...')
    BATCH = 200
    updated = 0
    errors = 0
    for i in range(0, len(to_update), BATCH):
        batch = to_update[i:i+BATCH]
        case_sql = 'CASE id '
        for rid, nid, old, new, title in batch:
            case_sql += f"WHEN '{rid}' THEN '{new}' "
        case_sql += 'END'
        ids_sql = "', '".join(r[0] for r in batch)
        try:
            r = mod.neon_query(f"""
                UPDATE "Resource" 
                SET slug = {case_sql}, "updatedAt" = NOW()
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
