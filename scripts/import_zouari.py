#!/usr/bin/env python3
"""
Import script for Zouari SAmi files from tunisiecollege.net to Examanet.

Pipeline per file:
1. Download from tunisiecollege.net
2. Decrypt (password ***REMOVED***, usually no-op)
3. Strip TunisieCollege.net watermark (XObject /Fm0 + /Fm0 Do refs)
4. Add Examanet branding (small logo + link to https://examanet.com/)
5. Upload to Vercel Blob
6. Create Resource (PUBLISHED, importedByAdmin=true) + TeacherFile (readOnly=true)
"""
import json
import os
import re
import sys
import time
import requests
import pikepdf
import psycopg2
from io import BytesIO
from PIL import Image
from datetime import datetime

# === Configuration ===
# All sensitive values come from environment variables — NEVER hardcode.
import os

DATABASE_URL = os.environ["DATABASE_URL"]  # Set in env (never commit)
BLOB_TOKEN = os.environ["BLOB_READ_WRITE_TOKEN"]  # Set in env (never commit)
SITE_URL = os.environ.get("EXAMANET_SITE_URL", "https://examanet.com/")
LOGO_PATH = "/tmp/examanet-branding/examanet-logo-small.png"
PASSWORD = "***REMOVED***"
DOWNLOAD_BASE = "https://www.tunisiecollege.net/app/download/{fileId}/"

ZOUARI_USER_EMAIL = "zouari.sami@examanet-import.local"
ZOUARI_USER_FIRST = "Sami"
ZOUARI_USER_LAST = "Zouari"
ADMIN_USER_ID = None  # Will be fetched

# Global stats
STATS = {
    "downloaded": 0,
    "processed": 0,
    "uploaded": 0,
    "db_inserted": 0,
    "skipped": 0,
    "errors": 0,
    "total_size": 0,
}


def get_db_connection():
    return psycopg2.connect(DATABASE_URL)


def fetch_admin_user_id(conn):
    """Get the admin user ID (boutiti.mehdi@gmail.com) for teacherId attribution."""
    global ADMIN_USER_ID
    with conn.cursor() as cur:
        cur.execute('SELECT id FROM "User" WHERE email = %s LIMIT 1', ('boutiti.mehdi@gmail.com',))
        row = cur.fetchone()
        if row:
            ADMIN_USER_ID = row[0]
            print(f"🛡️  Admin user ID: {ADMIN_USER_ID}")
    return ADMIN_USER_ID


def ensure_zouari_user(conn):
    """Create or fetch the Zouari teacher user."""
    with conn.cursor() as cur:
        # Check existing
        cur.execute('SELECT id FROM "User" WHERE email = %s', (ZOUARI_USER_EMAIL,))
        row = cur.fetchone()
        if row:
            return row[0]
        # Create new user
        cur.execute("""
            INSERT INTO "User" (
                id, email, role, status,
                "firstName", "lastName", "schoolName",
                "teachingSubjects", "teachingLevels", bio,
                "isVerifiedTeacher",
                "createdAt", "updatedAt"
            )
            VALUES (
                gen_random_uuid()::text, %s, 'TEACHER', 'ACTIVE',
                %s, %s, %s,
                %s::jsonb, %s::jsonb, %s,
                TRUE,
                NOW(), NOW()
            )
            RETURNING id
        """, (
            ZOUARI_USER_EMAIL,
            ZOUARI_USER_FIRST, ZOUARI_USER_LAST, 'Lycée Pilote - Tunis',
            '["mathematiques"]', '["7eme","8eme","9eme"]',
            'Professeur de Mathématiques importé depuis tunisiecollege.net',
        ))
        user_id = cur.fetchone()[0]
        conn.commit()
        print(f"✅ Created Zouari user: {user_id}")
        return user_id


def slugify(text, max_length=60):
    """Generate URL-friendly slug."""
    text = text.lower()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'\s+', '-', text).strip('-')
    return text[:max_length] + '-' + str(int(time.time() * 1000) % 100000)


def get_subject_id(conn, slug):
    with conn.cursor() as cur:
        cur.execute('SELECT id FROM "Subject" WHERE slug = %s', (slug,))
        row = cur.fetchone()
        return row[0] if row else None


def get_class_id(conn, slug):
    with conn.cursor() as cur:
        cur.execute('SELECT id FROM "Class" WHERE slug = %s', (slug,))
        row = cur.fetchone()
        return row[0] if row else None


def download_pdf(url, max_retries=2):
    """Download PDF from tunisiecollege.net using full URL."""
    for attempt in range(max_retries):
        try:
            r = requests.get(url, timeout=60, allow_redirects=True, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            })
            r.raise_for_status()
            ct = r.headers.get('content-type', '')
            if ct.startswith('application/pdf') or r.content[:4] == b'%PDF':
                return r.content
            print(f"  ⚠️ Attempt {attempt+1}: not a PDF (content-type={ct}, size={len(r.content)})")
        except Exception as e:
            print(f"  ⚠️ Attempt {attempt+1} failed: {e}")
        time.sleep(2)
    return None


def process_pdf(pdf_bytes, output_path):
    """
    Strip TunisieCollege.net watermark + add Examanet branding.
    Returns processed PDF bytes.
    """
    # Load logo as JPEG
    logo_img = Image.open(LOGO_PATH).convert('RGB')
    logo_w, logo_h = logo_img.size
    jpeg_buf = BytesIO()
    logo_img.save(jpeg_buf, format='JPEG', quality=90)
    logo_jpeg = jpeg_buf.getvalue()

    with pikepdf.open(BytesIO(pdf_bytes), password=PASSWORD) as pdf:
        for page in pdf.pages:
            resources = page.obj.get('/Resources')
            if resources is None:
                resources = pikepdf.Dictionary()
                page.obj['/Resources'] = resources

            # STEP 1: Strip /Fm0 XObject (watermark)
            if '/XObject' in resources and '/Fm0' in resources['/XObject']:
                del resources['/XObject']['/Fm0']

            # STEP 2: Strip /Fm0 Do references from content streams
            contents = page.obj.get('/Contents')
            if contents is None:
                continue

            def strip_fm0(stream_data):
                # Remove the entire q ... cm /Fm0 Do Q block
                pattern = rb'q\s*\n?\s*[\d.\s-]+cm\s*/Fm0\s+Do\s*\n?\s*Q\s*\n?'
                cleaned = re.sub(pattern, b'', stream_data)
                cleaned = re.sub(rb'/Fm0\s+Do\s*\n?', b'', cleaned)
                return cleaned

            if isinstance(contents, pikepdf.Stream):
                contents.write(strip_fm0(contents.read_bytes()))
            elif isinstance(contents, pikepdf.Array):
                for stream in contents:
                    if isinstance(stream, pikepdf.Stream):
                        stream.write(strip_fm0(stream.read_bytes()))

            # STEP 3: Add Examanet logo
            if '/XObject' not in resources:
                resources['/XObject'] = pikepdf.Dictionary()

            logo_stream = pikepdf.Stream(pdf, logo_jpeg)
            logo_stream['/Type'] = pikepdf.Name('/XObject')
            logo_stream['/Subtype'] = pikepdf.Name('/Image')
            logo_stream['/Width'] = logo_w
            logo_stream['/Height'] = logo_h
            logo_stream['/ColorSpace'] = pikepdf.Name('/DeviceRGB')
            logo_stream['/BitsPerComponent'] = 8
            logo_stream['/Filter'] = pikepdf.Name('/DCTDecode')
            resources['/XObject']['/ImLogo'] = logo_stream

            # Position bottom-right
            media_box = page.MediaBox
            page_w = float(media_box[2])
            logo_w_pt = 80
            logo_h_pt = 26
            margin = 15
            x = page_w - logo_w_pt - margin
            y = margin
            transform = f"{logo_w_pt} 0 0 {logo_h_pt} {x} {y} cm"

            content = f"q\n{transform}\n/ImLogo Do\nQ\n"

            existing = page.obj.get('/Contents')
            new_stream = pikepdf.Stream(pdf, content.encode('latin-1'))
            if existing is None:
                page.obj['/Contents'] = new_stream
            elif isinstance(existing, pikepdf.Stream):
                combined = content.encode('latin-1') + existing.read_bytes()
                page.obj['/Contents'] = pikepdf.Stream(pdf, combined)
            elif isinstance(existing, pikepdf.Array):
                new_array = pikepdf.Array([new_stream] + list(existing))
                page.obj['/Contents'] = new_array

            # STEP 4: Link annotation
            link_rect = pikepdf.Array([x, y, x + logo_w_pt, y + logo_h_pt])
            annot = pikepdf.Dictionary({
                '/Type': pikepdf.Name('/Annot'),
                '/Subtype': pikepdf.Name('/Link'),
                '/Rect': link_rect,
                '/Border': pikepdf.Array([0, 0, 0]),
                '/H': pikepdf.Name('/I'),
                '/A': pikepdf.Dictionary({
                    '/S': pikepdf.Name('/URI'),
                    '/URI': SITE_URL,
                }),
                '/PA': pikepdf.Dictionary({
                    '/S': pikepdf.Name('/URI'),
                    '/URI': SITE_URL,
                }),
            })
            if '/Annots' not in page.obj:
                page.obj['/Annots'] = pikepdf.Array()
            page.obj['/Annots'].append(annot)

        # Save to bytes
        buf = BytesIO()
        pdf.save(buf)
        return buf.getvalue()


def upload_to_blob(file_path, content):
    """Upload to Vercel Blob."""
    url = "https://blob.vercel-storage.com/upload"
    headers = {"Authorization": f"Bearer {BLOB_TOKEN}"}
    # Use multipart form
    files = {"file": (file_path.split('/')[-1], BytesIO(content), "application/pdf")}
    data = {"path": file_path, "access": "public", "addRandomSuffix": "0"}
    r = requests.post(url, headers=headers, files=files, data=data, timeout=120)
    if r.status_code == 200:
        result = r.json()
        return result.get('url')
    raise Exception(f"Blob upload failed: {r.status_code} {r.text}")


def check_resource_exists(conn, file_id):
    """Check if resource with originalSubmissionId = file_id already exists."""
    with conn.cursor() as cur:
        cur.execute('SELECT id FROM "Resource" WHERE "originalSubmissionId" = %s', (str(file_id),))
        return cur.fetchone() is not None


def insert_resource_and_file(conn, file_id, file_meta, pdf_bytes, pdf_url, teacher_id):
    """Create Resource + TeacherFile in DB."""
    title = file_meta['cleanTitle']
    parsed = file_meta['parsed']

    # Look up IDs
    subject_id = get_subject_id(conn, parsed['subjectSlug']) if parsed.get('subjectSlug') else None
    class_id = get_class_id(conn, parsed['classSlug']) if parsed.get('classSlug') else None

    if not subject_id or not class_id:
        raise Exception(f"Missing subject_id ({subject_id}) or class_id ({class_id}) for {title}")

    slug = slugify(title)

    # Year from title
    year_match = re.search(r'\((\d{4})(?:-(\d{4}))?\)', title)
    year = None
    if year_match:
        year = f"{year_match.group(1)}-{year_match.group(2)}" if year_match.group(2) else year_match.group(1)

    with conn.cursor() as cur:
        # Create Resource
        cur.execute("""
            INSERT INTO "Resource" (
                id, slug, title, type, status,
                "fileKey", "fileUrl", "fileSize", "pageCount",
                "subjectId", "classId", "teacherId",
                trimester, year, language,
                "homeworkSubtype", "homeworkNumber", "schoolType", "product",
                "hasCorrection", "correctionSummary",
                "importedByAdmin", "importedAt", "importedFrom", "originalSubmissionId",
                "publishedAt", "approvedAt", "approvedById",
                "viewsCount", "downloadsCount", "sharesCount", "favoritesCount", "commentsCount",
                "avgRating", "ratingCount",
                "createdAt", "updatedAt"
            ) VALUES (
                gen_random_uuid()::text, %s, %s, %s, 'PUBLISHED',
                %s, %s, %s, 10,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s,
                TRUE, NOW(), 'tunisiecollege.net', %s,
                NOW(), NOW(), %s,
                0, 0, 0, 0, 0,
                0.0, 0,
                NOW(), NOW()
            )
            RETURNING id
        """, (
            slug, title, parsed['type'],
            pdf_url, pdf_url, len(pdf_bytes),
            subject_id, class_id, teacher_id,
            parsed.get('trimester'), year, parsed.get('language', 'fr'),
            parsed.get('homeworkSubtype') if parsed['type'] == 'HOMEWORK' else None,
            parsed.get('homeworkNumber'),
            parsed.get('schoolType'),
            parsed.get('product'),
            parsed.get('hasCorrection', False),
            None,  # correctionSummary
            str(file_id),
            ADMIN_USER_ID,
        ))
        resource_id = cur.fetchone()[0]

        # Create TeacherFile (linked to resource, readOnly)
        cur.execute("""
            INSERT INTO "TeacherFile" (
                id, "fileName", "fileKey", "fileUrl", "fileSize", "originalFormat",
                "subjectId", "classId", "teacherId",
                "pdfKey", "pdfUrl", "pdfSize",
                "resourceId",
                "importedByAdmin", "importedAt", "importedFrom", "originalSubmissionId", "readOnly",
                "createdAt", "updatedAt"
            ) VALUES (
                gen_random_uuid()::text, %s, %s, %s, %s, 'pdf',
                %s, %s, %s,
                %s, %s, %s,
                %s,
                TRUE, NOW(), 'tunisiecollege.net', %s, TRUE,
                NOW(), NOW()
            )
        """, (
            title + '.pdf', pdf_url, pdf_url, len(pdf_bytes),
            subject_id, class_id, teacher_id,
            pdf_url, pdf_url, len(pdf_bytes),
            resource_id,
            str(file_id),
        ))
        conn.commit()
        return resource_id


def parse_title_with_node(raw_title):
    """Call Node.js to use our parse-title.ts for consistency."""
    import subprocess
    result = subprocess.run(
        ['npx', 'tsx', '-e', f"""
import {{ parseSiteTitle }} from './scripts/parse-title';
console.log(JSON.stringify(parseSiteTitle({json.dumps(raw_title)})));
"""],
        cwd='/workspace/edutunisie',
        capture_output=True, text=True, timeout=30
    )
    if result.returncode != 0:
        raise Exception(f"Parse failed: {result.stderr}")
    return json.loads(result.stdout.strip())


def main():
    # Load files
    with open('/tmp/zouari-unique-files.json') as f:
        files = json.load(f)
    print(f"📋 Loaded {len(files)} unique Zouari files\n")

    # Parse all titles
    print("🔍 Parsing titles...")
    for f in files:
        f['parsed'] = parse_title_with_node(f['cleanTitle'])
    print(f"✅ Parsed {len(files)} titles\n")

    # Connect DB
    print("🗄️ Connecting to DB...")
    conn = get_db_connection()
    fetch_admin_user_id(conn)
    teacher_id = ensure_zouari_user(conn)
    print(f"👤 Teacher ID: {teacher_id}\n")

    # Process each file
    print("🚀 Starting import...\n")
    for i, file_meta in enumerate(files, 1):
        file_id = file_meta['fileId']
        title = file_meta['cleanTitle']
        print(f"[{i}/{len(files)}] 📄 {title[:70]}")
        try:
            # Check if already imported
            if check_resource_exists(conn, file_id):
                print(f"  ⏭️ Already imported, skipping")
                STATS['skipped'] += 1
                continue

            # Download
            print(f"  ⬇️ Downloading from {file_meta.get('url', '')[:80]}...")
            pdf_bytes = download_pdf(file_meta['url'])
            if not pdf_bytes:
                print(f"  ❌ Download failed")
                STATS['errors'] += 1
                continue
            STATS['downloaded'] += 1
            original_size = len(pdf_bytes)
            print(f"  📦 Original: {original_size/1024:.0f} KB")

            # Process (strip watermark + add branding)
            print(f"  🔧 Processing PDF...")
            processed_bytes = process_pdf(pdf_bytes, None)
            STATS['processed'] += 1
            new_size = len(processed_bytes)
            print(f"  📦 Branded: {new_size/1024:.0f} KB ({(new_size-original_size)/original_size*100:+.0f}%)")

            # Upload to Blob
            file_path = f"teacher-library/{teacher_id}/imported/{file_id}.pdf"
            print(f"  ☁️ Uploading to Blob...")
            pdf_url = upload_to_blob(file_path, processed_bytes)
            STATS['uploaded'] += 1
            STATS['total_size'] += new_size
            print(f"  ✅ {pdf_url[:80]}...")

            # Insert in DB
            print(f"  💾 Inserting in DB...")
            resource_id = insert_resource_and_file(
                conn, file_id, file_meta, processed_bytes, pdf_url, teacher_id
            )
            STATS['db_inserted'] += 1
            print(f"  ✅ Resource ID: {resource_id}\n")

        except Exception as e:
            print(f"  ❌ Error: {e}\n")
            STATS['errors'] += 1
            conn.rollback()

    # Final stats
    print(f"\n{'='*60}")
    print(f"📊 IMPORT COMPLETE")
    print(f"{'='*60}")
    print(f"Downloaded:  {STATS['downloaded']}")
    print(f"Processed:   {STATS['processed']}")
    print(f"Uploaded:    {STATS['uploaded']}")
    print(f"DB inserted: {STATS['db_inserted']}")
    print(f"Skipped:     {STATS['skipped']}")
    print(f"Errors:      {STATS['errors']}")
    print(f"Total size:  {STATS['total_size']/1024/1024:.1f} MB")

    conn.close()


if __name__ == '__main__':
    main()