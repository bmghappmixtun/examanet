#!/usr/bin/env python3
"""
Arabe-specific crawler for TunisieCollege.net.
Strategy: download all PDFs from the right class page, then match by year in extracted text.
"""
import os, json, time, re, urllib.request, urllib.parse, urllib.error
from pathlib import Path
import fitz
import sys, importlib.util

spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

CACHE_DIR = Path('/tmp/tc/arabe_pdfs')
CACHE_DIR.mkdir(parents=True, exist_ok=True)
PROGRESS_FILE = '/workspace/edutunisie/pdf-test/tc_arabe_progress.json'

# Arabe URL paths (with correct number of underscores!)
ARABE_URLS = {
    '7eme': '/arabe/فــــروض-الـعــــربـيــة/السابعة-7-أساسي/',
    '8eme': '/arabe/فــــروض-الـعــــربـيــة/الثامنة-8-أساسي/',
    '9eme': '/arabe/فــــروض-الـعــــربـيــة/التاسعة-9-أساسي/',
}

def fetch_page(url):
    """Fetch and cache page."""
    cache_key = re.sub(r'[^a-zA-Z0-9]', '_', url) + '.html'
    cache_path = CACHE_DIR / cache_key
    if cache_path.exists():
        with open(cache_path, 'rb') as f:
            return f.read().decode('utf-8', errors='ignore')
    
    # URL-encode only the Arabic chars but keep /, -, . intact
    import urllib.parse
    # Encode each path segment
    parts = url.split('/')
    encoded_parts = [urllib.parse.quote(p, safe='') if i > 0 else p for i, p in enumerate(parts)]
    encoded_url = '/'.join(encoded_parts)
    full_url = f'https://www.tunisiecollege.net{encoded_url}'
    try:
        req = urllib.request.Request(full_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read().decode('utf-8', errors='ignore')
            with open(cache_path, 'wb') as f:
                f.write(body.encode('utf-8'))
            return body
    except urllib.error.HTTPError as e:
        return None
    except Exception as e:
        return None

def get_all_pdfs_from_page(page_url):
    """Extract all PDF URLs from an Arabe page."""
    page = fetch_page(page_url)
    if not page:
        return []
    return re.findall(r'href="(/app/download/(\d+)/([^"]+)\.pdf\?[^"]+)"', page)

def download_pdf(url, cache_name):
    """Download PDF to cache."""
    cache_path = CACHE_DIR / cache_name
    if cache_path.exists():
        with open(cache_path, 'rb') as f:
            return f.read()
    # Encode Arabic parts
    import urllib.parse
    parts = url.split('/')
    encoded_parts = [urllib.parse.quote(p, safe='?=&') if i > 0 else p for i, p in enumerate(parts)]
    encoded_url = '/'.join(encoded_parts)
    full_url = f'https://www.tunisiecollege.net{encoded_url}'
    try:
        req = urllib.request.Request(full_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
            with open(cache_path, 'wb') as f:
                f.write(data)
            return data
    except Exception as e:
        return None

def extract_year_from_text(text, target_year):
    """Check if target year appears in text."""
    if not target_year:
        return True
    y1, y2 = target_year.split('-')
    if y1 in text and y2 in text:
        return True
    # Try just one year
    if y1 in text or y2 in text:
        return True
    return False

def find_matching_pdf(resource, pdfs):
    """For Arabe: download each PDF and check year match."""
    class_slug = resource.get('class_slug', '')
    if class_slug not in ARABE_URLS:
        return None
    
    # Get all PDFs from this class page
    page_url = ARABE_URLS[class_slug]
    all_pdfs = get_all_pdfs_from_page(page_url)
    if not all_pdfs:
        return None
    
    # Try each PDF
    target_year = resource.get('year', '')
    for full_path, file_id, fname_encoded in all_pdfs:
        cache_name = f'{file_id}.pdf'
        pdf_bytes = download_pdf(full_path, cache_name)
        if not pdf_bytes:
            continue
        
        # Extract text
        try:
            doc = fitz.open(stream=pdf_bytes, filetype='pdf')
            text = ''
            for p in doc:
                text += p.get_text()
            doc.close()
        except:
            continue
        
        if len(text) < 100:
            continue
        
        # Check year match
        if extract_year_from_text(text, target_year):
            return {
                'url': full_path,
                'pdf_bytes': pdf_bytes,
                'text': text,
                'filename': urllib.parse.unquote(fname_encoded),
            }
    
    return None

def upload_to_blob(resource_id, pdf_bytes):
    """Upload PDF to Vercel Blob."""
    seed_token = os.environ.get('SEED_TOKEN') or open('/workspace/edutunisie/.env').read().split('SEED_TOKEN=')[1].split('\n')[0].strip('"')
    url = 'https://examanet.com/api/admin/resource-overwrite'
    
    boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
    crlf = b'\r\n'
    parts = []
    parts.append(b'--' + boundary.encode())
    parts.append(b'Content-Disposition: form-data; name="resourceId"')
    parts.append(b'')
    parts.append(resource_id.encode())
    parts.append(b'--' + boundary.encode())
    parts.append(b'Content-Disposition: form-data; name="file"; filename="arabe-recovered.pdf"')
    parts.append(b'Content-Type: application/pdf')
    parts.append(b'')
    parts.append(pdf_bytes)
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

def update_content(rid, text):
    text_clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    wc = len(text_clean.split())
    sql = f'''
    INSERT INTO "ResourceContent" ("id", "resourceId", "fullText", "extractionMethod", "extractedAt", "wordCount")
    VALUES (gen_random_uuid()::text, $${rid}$$, $${text_clean}$$, 'pymupdf-arabe-tc', NOW(), {wc})
    ON CONFLICT ("resourceId") DO UPDATE SET
      "fullText" = EXCLUDED."fullText",
      "extractionMethod" = EXCLUDED."extractionMethod",
      "extractedAt" = NOW(),
      "wordCount" = EXCLUDED."wordCount"
    '''
    return m.neon_query(sql)

def process_resource(resource):
    """Process one Arabe resource."""
    rid = resource['id']
    nid = resource['numericId']
    
    # Get all PDFs from the right class page
    class_slug = resource.get('class_slug', '')
    if class_slug not in ARABE_URLS:
        return {'nid': nid, 'status': 'no_class'}
    
    page_url = ARABE_URLS[class_slug]
    all_pdfs = get_all_pdfs_from_page(page_url)
    if not all_pdfs:
        return {'nid': nid, 'status': 'no_pdfs'}
    
    # Try each PDF until year match
    target_year = resource.get('year', '')
    for full_path, file_id, fname_encoded in all_pdfs:
        cache_name = f'{class_slug}_{file_id}.pdf'
        pdf_bytes = download_pdf(full_path, cache_name)
        if not pdf_bytes:
            continue
        
        try:
            doc = fitz.open(stream=pdf_bytes, filetype='pdf')
            text = ''
            for p in doc:
                text += p.get_text()
            doc.close()
        except:
            continue
        
        if len(text) < 100:
            continue
        
        # Year check
        if target_year:
            y1, y2 = target_year.split('-')
            if y1 in text and y2 in text:
                # Match!
                pass
            elif y1 in text or y2 in text:
                # Partial match
                pass
            else:
                continue
        
        # Upload and update
        result, err = upload_to_blob(rid, pdf_bytes)
        if err or not result.get('success'):
            return {'nid': nid, 'status': 'upload_failed', 'error': err or str(result)}
        
        r = update_content(rid, text)
        return {
            'nid': nid,
            'status': 'ok',
            'tc_url': full_path,
            'extracted_chars': len(text),
            'new_size': result.get('newSize'),
            'old_size': result.get('oldSize'),
        }
    
    return {'nid': nid, 'status': 'no_year_match', 'tried': len(all_pdfs)}

def get_arabe_targets():
    """Get all broken Arabe resources from TunisieCollege."""
    r = m.neon_query('''
    SELECT r.id, r."numericId", r.title, r.year, s.slug as subject, c.slug as class_slug
    FROM "Resource" r
    LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
    JOIN "Subject" s ON s.id = r."subjectId"
    LEFT JOIN "Class" c ON c.id = r."classId"
    WHERE r."importedFrom" = 'tunisiecollege.net'
      AND s.slug = 'arabe'
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
    keys = ['id', 'numericId', 'title', 'year', 'subject', 'class_slug']
    return [dict(zip(keys, row)) for row in rows]

def main():
    targets = get_arabe_targets()
    print(f'Total Arabe targets: {len(targets)}')
    
    progress = {'done': [], 'ok': [], 'errors': {}}
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
            print(f'  [{i+1}/{len(todo)}] NID {result["nid"]}: OK - {result["extracted_chars"]}c')
        else:
            progress['errors'][str(t['numericId'])] = result.get('status', 'unknown')
            print(f'  [{i+1}/{len(todo)}] NID {t["numericId"]}: {result.get("status")}')
        
        if (i+1) % 5 == 0:
            with open(PROGRESS_FILE, 'w') as f:
                json.dump(progress, f)
    
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress, f)
    
    print(f'\nFinal: {len(progress["ok"])} recovered, {len(progress["errors"])} failed')
    from collections import Counter
    c = Counter(v for v in progress['errors'].values())
    print(f'Failure reasons: {dict(c)}')

if __name__ == '__main__':
    main()
