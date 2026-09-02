#!/usr/bin/env python3
"""
Crawler TunisieCollege.net to re-download broken PDFs.
Maps Tunisian curriculum (subject, class, type) to TunisieCollege URL,
finds the matching PDF by title, downloads it.

Then re-uploads to Vercel Blob via resource-overwrite endpoint.
"""
import os, json, time, re, urllib.request, urllib.parse, urllib.error
from pathlib import Path
import fitz
import sys, importlib.util
import concurrent.futures

# Neon for SQL
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

# Tunisia college URL patterns
# Maps: subject_slug (DB) -> TunisieCollege URL root
SUBJECT_MAP = {
    'anglais': 'anglais',
    'mathematiques': 'maths',
    'physique': 'physique',
    'svt': 'sciences-svt',
    'sciences-svt': 'sciences-svt',
    'arabe': 'arabe',
    'francais': 'francais',
    'francais': 'francais',
    'education-islamique': 'education-islamique',
    'education-civique': 'education-civique',
    'informatique': 'informatique',
    'technologie': 'technologie',
    'histoire-geographie': 'histoire-geo',
    'histoire': 'histoire',
    'geographie': 'geographie',
    'eps': 'sport',
    'sport': 'sport',
    'musique': 'education-musicale',
}

# Subject -> (devoirs URL slug, series URL slug)
DEVOIR_SLUG = {
    'anglais': 'devoirs-anglais',
    'maths': 'devoirs-math',
    'physique': 'devoirs-physique',
    'sciences-svt': 'devoirs-sciences',
    'informatique': 'devoirs-informatique',
    'technologie': 'devoirs-technologie',
}
SERIES_SLUG = {
    'anglais': 'séries-anglais',
    'maths': 'séries-d-exercices-math',
    'physique': 'séries-physique',
    'informatique': 'séries-informatique',
    'technologie': 'séries-technologie',
}

# Class slugs (DB) -> TunisieCollege class name
# 7eme-9eme are "7ème année", "8ème année", "9ème année"
# Lycee classes are different

CACHE_DIR = Path('/tmp/tc/cache')
CACHE_DIR.mkdir(parents=True, exist_ok=True)
PROGRESS_FILE = '/workspace/edutunisie/pdf-test/tc_crawler_progress.json'

def get_tc_class_path(subject_root, class_slug):
    """Build TunisieCollege class URL for college classes."""
    class_map = {
        '7eme': ('7ème', '7-ème', '7ème'),
        '8eme': ('8ème', '8-ème', '8ème'),
        '9eme': ('9ème', '9-ème', '9ème'),
    }
    return class_map.get(class_slug, (None, None, None))

def get_listing_urls(resource):
    """Generate candidate listing URLs for a resource."""
    subject_root = SUBJECT_MAP.get(resource['subject'])
    if not subject_root:
        return []
    
    urls = []
    class_slug = resource.get('class_slug', '')
    resource_type = resource.get('type', '')  # DEVOIR, EXERCISE, etc.
    
    # Determine base path: devoirs vs series vs cours
    if resource_type in ('DEVOIR',):
        devoir_slug = DEVOIR_SLUG.get(subject_root, f'devoirs-{subject_root}')
        if class_slug.startswith(('7', '8', '9')):
            class_names = get_tc_class_path(subject_root, class_slug)
            for cn in class_names:
                if cn:
                    if subject_root == 'maths':
                        for t in ['1er-trimestre', '2ème-trimestre', '3ème-trimestre']:
                            urls.append(f'/{subject_root}/{devoir_slug}/{cn}-année-{t}/')
                    else:
                        urls.append(f'/{subject_root}/{devoir_slug}/{cn}/')
        urls.append(f'/{subject_root}/{devoir_slug}/')
    
    elif resource_type in ('EXERCISE',):
        series_slug = SERIES_SLUG.get(subject_root, f'séries-{subject_root}')
        if subject_root == 'maths':
            for cn in ['7ème', '8ème', '9ème']:
                urls.append(f'/maths/{series_slug}/séries-math-{cn}/')
            urls.append(f'/maths/{series_slug}/séries-math-de-2017-2018-2019/')
        else:
            urls.append(f'/{subject_root}/{series_slug}/')
    
    urls.append(f'/{subject_root}/')
    
    return list(set(urls))

def fetch_page(url):
    """Fetch and cache a TunisieCollege page."""
    # URL-encode unicode chars in the path
    url_safe = urllib.parse.quote(url, safe='/?-')
    cache_key = url_safe.replace('/', '_').replace('%', '_').strip('_') + '.html'
    cache_path = CACHE_DIR / cache_key
    if cache_path.exists():
        with open(cache_path, 'rb') as f:
            return f.read().decode('utf-8', errors='ignore')
    
    full_url = f'https://www.tunisiecollege.net{url_safe}'
    try:
        req = urllib.request.Request(full_url, headers={
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        })
        with urllib.request.urlopen(req, timeout=20) as r:
            body = r.read().decode('utf-8', errors='ignore')
            with open(cache_path, 'wb') as f:
                f.write(body.encode('utf-8'))
            return body
    except Exception as e:
        return None

def find_pdf_match(page_html, resource):
    """Find PDF link in page HTML that matches the resource title."""
    # Extract all PDF links
    pdf_pattern = re.compile(r'href="(/app/download/(\d+)/([^"]+?)\.pdf\?[^"]*)"')
    candidates = []
    for match in pdf_pattern.finditer(page_html):
        full_path, file_id, filename_encoded = match.groups()
        # URL-decode the filename
        filename = urllib.parse.unquote(filename_encoded)
        candidates.append({
            'url': full_path,
            'file_id': file_id,
            'filename': filename,
        })
    
    if not candidates:
        return None
    
    # Build search patterns from resource
    title = resource['title'].lower()
    year = resource.get('year', '').strip()
    
    # Extract key markers from title
    markers = []
    # Number: N°1, N1, N° 2, N 3, etc
    num_match = re.search(r'[Nn][°o]?\s*(\d+)', title)
    if num_match:
        markers.append(f'n°{num_match.group(1)}')
        markers.append(f'n{num_match.group(1)}')
    # Type
    if 'contrôle' in title or 'controle' in title:
        markers.append('contrôle')
        markers.append('controle')
    if 'synthèse' in title or 'synthese' in title:
        markers.append('synthèse')
        markers.append('synthese')
    if 'révision' in title or 'revision' in title:
        markers.append('révision')
        markers.append('revision')
    if 'série' in title or 'serie' in title or 'exercice' in title:
        markers.append('série')
        markers.append('serie')
    # Class
    if '7ème' in title or '7eme' in title:
        markers.append('7ème')
        markers.append('7eme')
    if '8ème' in title or '8eme' in title:
        markers.append('8ème')
        markers.append('8eme')
    if '9ème' in title or '9eme' in title:
        markers.append('9ème')
        markers.append('9eme')
    # Year
    if year:
        markers.append(year)
    
    # Score each candidate
    def score_candidate(cand):
        filename_lower = cand['filename'].lower()
        score = 0
        for marker in markers:
            marker_lower = marker.lower()
            if marker_lower in filename_lower:
                score += 1
        return score
    
    scored = [(score_candidate(c), c) for c in candidates]
    scored.sort(key=lambda x: -x[0])
    
    if scored and scored[0][0] >= 2:  # at least 2 markers match
        return scored[0][1]
    
    return None

def download_pdf_from_tc(tc_url):
    """Download PDF from TunisieCollege."""
    full_url = f'https://www.tunisiecollege.net{tc_url}'
    try:
        req = urllib.request.Request(full_url, headers={
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        })
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read(), None
    except Exception as e:
        return None, str(e)

def upload_to_blob(resource_id, pdf_bytes):
    """Upload PDF to Vercel Blob via resource-overwrite endpoint."""
    seed_token = os.environ.get('SEED_TOKEN') or open('/workspace/edutunisie/.env').read().split('SEED_TOKEN=')[1].split('\n')[0].strip('"')
    url = 'https://examanet.com/api/admin/resource-overwrite'
    
    # Build multipart body
    boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
    crlf = b'\r\n'
    parts = []
    # resourceId
    parts.append(b'--' + boundary.encode())
    parts.append(b'Content-Disposition: form-data; name="resourceId"')
    parts.append(b'')
    parts.append(resource_id.encode())
    # file
    parts.append(b'--' + boundary.encode())
    parts.append(b'Content-Disposition: form-data; name="file"; filename="recovered.pdf"')
    parts.append(b'Content-Type: application/pdf')
    parts.append(b'')
    parts.append(pdf_bytes)
    # end
    parts.append(b'--' + boundary.encode() + b'--')
    parts.append(b'')
    
    data = crlf.join(parts)
    
    req = urllib.request.Request(url, data=data, headers={
        'X-Seed-Token': seed_token,
        'Content-Type': f'multipart/form-data; boundary={boundary}',
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read()), None
    except urllib.error.HTTPError as e:
        return None, f'HTTP {e.code}: {e.read().decode()[:200]}'
    except Exception as e:
        return None, str(e)

def update_resource_content(rid, text, method='pymupdf-tc-recovered'):
    """Update ResourceContent with extracted text."""
    text_clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    wc = len(text_clean.split())
    
    sql = f'''
    INSERT INTO "ResourceContent" ("id", "resourceId", "fullText", "extractionMethod", "extractedAt", "wordCount")
    VALUES (gen_random_uuid()::text, $${rid}$$, $${text_clean}$$, $${method}$$, NOW(), {wc})
    ON CONFLICT ("resourceId") DO UPDATE SET
      "fullText" = EXCLUDED."fullText",
      "extractionMethod" = EXCLUDED."extractionMethod",
      "extractedAt" = NOW(),
      "wordCount" = EXCLUDED."wordCount"
    '''
    return m.neon_query(sql)

def process_resource(resource):
    """Process one resource: search, download, upload, update."""
    rid = resource['id']
    nid = resource['numericId']
    title = resource['title']
    
    # Try each candidate listing URL
    candidates = get_listing_urls(resource)
    
    for url in candidates:
        page_html = fetch_page(url)
        if not page_html:
            continue
        
        match = find_pdf_match(page_html, resource)
        if match:
            # Download the PDF
            pdf_bytes, err = download_pdf_from_tc(match['url'])
            if err or not pdf_bytes:
                continue
            
            # Quick verify it has real text
            try:
                doc = fitz.open(stream=pdf_bytes, filetype='pdf')
                text = ''
                for p in doc:
                    text += p.get_text()
                doc.close()
                if len(text) < 200:
                    continue  # Skip if too short
            except:
                continue
            
            # Upload to Vercel Blob
            result, err = upload_to_blob(rid, pdf_bytes)
            if err or not result or not result.get('success'):
                return {'nid': nid, 'status': 'upload_failed', 'error': err or str(result)}
            
            # Update ResourceContent
            r = update_resource_content(rid, text)
            
            return {
                'nid': nid,
                'status': 'ok',
                'tc_url': match['url'],
                'tc_filename': match['filename'],
                'new_size': result.get('newSize'),
                'old_size': result.get('oldSize'),
                'extracted_chars': len(text),
            }
    
    return {'nid': nid, 'status': 'no_match', 'candidates_tried': len(candidates)}

def get_broken_resources():
    """Get all broken PDF resources (short text or GPT refused) from tunisiecollege.net."""
    r = m.neon_query('''
    SELECT r.id, r."numericId", r.title, r.type, r.year, s.slug as subject, c.slug as class_slug
    FROM "Resource" r
    LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
    JOIN "Subject" s ON s.id = r."subjectId"
    LEFT JOIN "Class" c ON c.id = r."classId"
    WHERE r."importedFrom" = 'tunisiecollege.net'
      AND (
        r.id NOT IN (SELECT "resourceId" FROM "ResourceContent" WHERE "resourceId" IS NOT NULL)
        OR LENGTH(COALESCE(rc."fullText", '')) < 200
        OR rc."fullText" ILIKE '%unable to extract%'
        OR rc."fullText" ILIKE '%sorry, but i can%'
        OR rc."fullText" ILIKE '%i can''t assist%'
        OR rc."fullText" ILIKE '%i cannot extract%'
      )
    ORDER BY r."numericId"
    ''')
    rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
    keys = ['id', 'numericId', 'title', 'type', 'year', 'subject', 'class_slug']
    return [dict(zip(keys, row)) for row in rows]

def main():
    targets = get_broken_resources()
    print(f'Total broken TunisieCollege resources: {len(targets)}')
    
    # Load progress
    progress = {'done': [], 'errors': {}}
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            progress = json.load(f)
    
    done_set = set(progress['done'])
    todo = [t for t in targets if t['numericId'] not in done_set]
    print(f'Already done: {len(done_set)}, remaining: {len(todo)}')
    
    if todo:
        print()
        print('First 5 targets:')
        for t in todo[:5]:
            print(f'  NID {t["numericId"]}: {t["subject"]}/{t["class_slug"]} - {t["title"][:60]}')
            print(f'    URLs to try: {get_listing_urls(t)}')

if __name__ == '__main__':
    main()

# Now add the main batch function
def run_batch():
    targets = get_broken_resources()
    print(f'Total targets: {len(targets)}')
    
    progress = {'done': [], 'errors': {}, 'ok': []}
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            progress = json.load(f)
    
    done_set = set(progress['done'])
    todo = [t for t in targets if t['numericId'] not in done_set]
    print(f'Already done: {len(done_set)}, remaining: {len(todo)}')
    
    for i, t in enumerate(todo):
        result = process_resource(t)
        progress['done'].append(t['numericId'])
        if result.get('status') == 'ok':
            progress['ok'].append(result)
            print(f'  [{i+1}/{len(todo)}] NID {result["nid"]}: OK - {result["extracted_chars"]}c from {result["tc_filename"][:40]}')
        else:
            progress['errors'][str(t['numericId'])] = result.get('status', 'unknown') + ':' + str(result.get('error', result.get('candidates_tried', '?')))
            print(f'  [{i+1}/{len(todo)}] NID {t["numericId"]}: {result.get("status")}')
        
        # Save progress every 5
        if (i+1) % 5 == 0:
            with open(PROGRESS_FILE, 'w') as f:
                json.dump(progress, f)
    
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress, f)
    
    print()
    print(f'Final: {len(progress["ok"])} recovered, {len(progress["errors"])} failed')
    if progress['errors']:
        from collections import Counter
        c = Counter(v.split(":")[0] for v in progress['errors'].values())
        print('Failure reasons:', dict(c))

# Uncomment to run batch:
# run_batch()
