#!/usr/bin/env python3
"""
Import client: process Zouari SAmi files locally, then upload to Examanet via API.

Pipeline per file:
1. Download PDF from tunisiecollege.net
2. Strip watermark + add Examanet branding (pikepdf)
3. Send to https://examanet.com/api/admin/tunisiecollege-import
   (admin endpoint handles Vercel Blob upload + DB insert)
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

EXAMANET_API = os.environ.get("EXAMANET_API_URL", "https://examanet.com/api/admin/tunisiecollege-import")
SEED_TOKEN = os.environ["SEED_TOKEN"]  # Set in env or .env (never commit)
LOGO_PATH = os.environ.get("EXAMANET_LOGO_PATH", "/tmp/examanet-branding/examanet-logo-small.png")
PASSWORD = os.environ.get("TUNISIECOLLEGE_PDF_PASSWORD", "***REMOVED***")
SITE_URL = os.environ.get("EXAMANET_SITE_URL", "https://examanet.com/")

# Global stats
STATS = {
    "success": 0,
    "skipped": 0,
    "errors": 0,
    "total_size": 0,
    "errors_list": [],
}


def parse_title(raw_title: str) -> dict:
    """Parse tunisiecollege.net title to extract metadata."""
    title = raw_title

    # Detect schoolType FIRST (from raw)
    schoolType = "PUBLIC"
    if re.search(r"coll[èe]ge pilote", raw_title, re.IGNORECASE) or re.search(r"lyc[ée]e pilote", raw_title, re.IGNORECASE) or re.search(r"pilote", raw_title, re.IGNORECASE):
        schoolType = "PILOTE"

    # Strip prefix
    title = re.sub(r"^Coll[èe]ge pilote\s*[-–—:]\s*", "", title, flags=re.IGNORECASE)
    title = re.sub(r"^Lyc[ée]e pilote\s*[-–—:]\s*", "", title, flags=re.IGNORECASE)
    # Strip suffix "(2)", "(3)"
    title = re.sub(r"\s*\(\d+\)\s*$", "", title).strip()

    has_arabic = bool(re.search(r"[\u0600-\u06FF]", title))
    has_correction = bool(re.search(
        r"(?:avec|et|w/|[-–—])\s*(?:le\s+|sa\s+)?(?:corrig[ée]|correction)|(?:corrig[ée]|correction)\s+(?:inclus|d[eé]taill[ée]|complet)",
        title, re.IGNORECASE
    ))

    # Type
    resource_type = "OTHER"
    if re.match(r"^(?:corrig[ée]|correction)\b", title, re.IGNORECASE):
        resource_type = "CORRECTION"
    elif re.match(r"^(?:cours|leçon)\b", title, re.IGNORECASE) or (re.search(r"\bcours\b", title, re.IGNORECASE) and not re.search(r"s[ée]rie", title, re.IGNORECASE)):
        resource_type = "COURSE"
    elif re.search(r"s[ée]rie d'exercices?|s[ée]rie\b", title, re.IGNORECASE):
        resource_type = "EXERCISE"
    elif re.match(r"^tp\b|^travaux pratiques?\b", title, re.IGNORECASE):
        resource_type = "EXERCISE"
    elif re.search(r"r[eé]sum[eé]\b", title, re.IGNORECASE):
        resource_type = "SUMMARY"
    elif re.search(r"fiche\b", title, re.IGNORECASE):
        resource_type = "CARD"
    elif re.search(r"concours\b", title, re.IGNORECASE) or re.search(r"sujet\s*bac|sujets?\s*bac", title, re.IGNORECASE):
        resource_type = "BAC_SUBJECT"
    elif re.search(r"\bexamen\b", title, re.IGNORECASE) and not re.search(r"contr[oô]le", title, re.IGNORECASE):
        resource_type = "EXAM"
    elif re.search(r"devoir\b", title, re.IGNORECASE) or re.search(r"فرض|واجب", title):
        resource_type = "HOMEWORK"
    elif re.search(r"exercice\b", title, re.IGNORECASE):
        resource_type = "EXERCISE"

    # Homework subtype
    homework_subtype = None
    if resource_type == "HOMEWORK":
        if re.search(r"contr[oôö]le", title, re.IGNORECASE):
            homework_subtype = "CONTROL"
        elif re.search(r"synth[eèéê]se|synt[eèéê]se", title, re.IGNORECASE):
            homework_subtype = "SYNTHESIS"
        elif re.search(r"\bmaison\b", title, re.IGNORECASE):
            homework_subtype = "HOUSEWORK"

    # Homework number
    homework_number = None
    num_match = re.search(r"N[°o\u00ba]\s*(\d+)|num[eéè]ro\s*(\d+)", title, re.IGNORECASE)
    if num_match:
        n = int(num_match.group(1) or num_match.group(2))
        if 1 <= n <= 20:
            homework_number = n

    # Trimester
    trimester = None
    if homework_number == 1:
        trimester = "T1"
    elif homework_number == 2:
        trimester = "T2"
    elif homework_number and homework_number >= 3:
        trimester = "T3"

    # Subject
    subject_patterns = [
        (r"\bmath[eé]matiques?\b|رياضيات|\bmaths?\b", "mathematiques"),
        (r"\bphysique\b|علوم فيزيائية", "physique"),
        (r"\bsvt\b|sciences?\s+(de la )?vie|علوم الحياة", "svt"),
        (r"\bfran[çc]ais\b", "francais"),
        (r"\banglais\b|إنقليزية", "anglais"),
        (r"\barabe\b|عربية", "arabe"),
        (r"\bhistoire\b|تاريخ", "histoire"),
        (r"\bg[ée]ographie\b|جغرافيا", "geographie"),
        (r"\binformatique\b|إعلامية", "informatique"),
        (r"\btechnologie\b|تكنولوجيا", "technologie"),
        (r"\bphilosophie\b|فلسفة", "philosophie"),
        (r"\b[eé]conomie\b|اقتصاد", "economie"),
        (r"\bgestion\b|تصرف", "gestion"),
        (r"\bsport\b|[eé]ducation physique|رياضة", "sport"),
        (r"\balgo\b|algorithmique", "algo-prog"),
    ]
    subject_slug = None
    for pat, slug in subject_patterns:
        if re.search(pat, title, re.IGNORECASE):
            subject_slug = slug
            break

    # Class
    class_slug = None
    cls_match = re.search(r"(\d+)\s*(?:[èé]me|eme|ème|année)\b", title, re.IGNORECASE)
    if cls_match:
        n = int(cls_match.group(1))
        class_map = {7: "7eme", 8: "8eme", 9: "9eme",
                     1: "1ere-secondaire", 2: "2eme-secondaire",
                     3: "3eme-secondaire", 4: "4eme-secondaire"}
        class_slug = class_map.get(n)

    # Year
    year_match = re.search(r"\((\d{4})(?:-(\d{4}))?\)", title)
    year = None
    if year_match:
        if year_match.group(2):
            year = f"{year_match.group(1)}-{year_match.group(2)}"
        else:
            year = year_match.group(1)

    language = "ar" if has_arabic else "fr"

    return {
        "title": title,
        "type": resource_type,
        "homeworkSubtype": homework_subtype,
        "homeworkNumber": homework_number,
        "trimester": trimester,
        "schoolType": schoolType,
        "subjectSlug": subject_slug,
        "classSlug": class_slug,
        "language": language,
        "year": year,
        "hasCorrection": has_correction,
    }


def download_pdf(url: str) -> bytes:
    """Download PDF from tunisiecollege.net."""
    r = requests.get(url, timeout=60, allow_redirects=True, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    })
    r.raise_for_status()
    ct = r.headers.get("content-type", "")
    if not ct.startswith("application/pdf") and not r.content[:4] == b"%PDF":
        raise Exception(f"Not a PDF (content-type={ct}, size={len(r.content)})")
    return r.content


def process_pdf(pdf_bytes: bytes) -> bytes:
    """Strip TunisieCollege.net watermark + add Examanet branding."""
    logo_img = Image.open(LOGO_PATH).convert("RGB")
    logo_w, logo_h = logo_img.size
    jpeg_buf = BytesIO()
    logo_img.save(jpeg_buf, format="JPEG", quality=90)
    logo_jpeg = jpeg_buf.getvalue()

    with pikepdf.open(BytesIO(pdf_bytes), password=PASSWORD) as pdf:
        for page in pdf.pages:
            resources = page.obj.get("/Resources")
            if resources is None:
                resources = pikepdf.Dictionary()
                page.obj["/Resources"] = resources

            # Strip /Fm0 XObject (watermark)
            if "/XObject" in resources and "/Fm0" in resources["/XObject"]:
                del resources["/XObject"]["/Fm0"]

            # Strip /Fm0 Do references from content streams
            contents = page.obj.get("/Contents")
            if contents is None:
                continue

            def strip_fm0(stream_data):
                pattern = rb"q\s*\n?\s*[\d.\s-]+cm\s*/Fm0\s+Do\s*\n?\s*Q\s*\n?"
                cleaned = re.sub(pattern, b"", stream_data)
                cleaned = re.sub(rb"/Fm0\s+Do\s*\n?", b"", cleaned)
                return cleaned

            if isinstance(contents, pikepdf.Stream):
                contents.write(strip_fm0(contents.read_bytes()))
            elif isinstance(contents, pikepdf.Array):
                for stream in contents:
                    if isinstance(stream, pikepdf.Stream):
                        stream.write(strip_fm0(stream.read_bytes()))

            # Add Examanet logo
            if "/XObject" not in resources:
                resources["/XObject"] = pikepdf.Dictionary()
            logo_stream = pikepdf.Stream(pdf, logo_jpeg)
            logo_stream["/Type"] = pikepdf.Name("/XObject")
            logo_stream["/Subtype"] = pikepdf.Name("/Image")
            logo_stream["/Width"] = logo_w
            logo_stream["/Height"] = logo_h
            logo_stream["/ColorSpace"] = pikepdf.Name("/DeviceRGB")
            logo_stream["/BitsPerComponent"] = 8
            logo_stream["/Filter"] = pikepdf.Name("/DCTDecode")
            resources["/XObject"]["/ImLogo"] = logo_stream

            media_box = page.MediaBox
            page_w = float(media_box[2])
            logo_w_pt = 80
            logo_h_pt = 26
            margin = 15
            x = page_w - logo_w_pt - margin
            y = margin
            transform = f"{logo_w_pt} 0 0 {logo_h_pt} {x} {y} cm"

            content = f"q\n{transform}\n/ImLogo Do\nQ\n"
            existing = page.obj.get("/Contents")
            new_stream = pikepdf.Stream(pdf, content.encode("latin-1"))
            if existing is None:
                page.obj["/Contents"] = new_stream
            elif isinstance(existing, pikepdf.Stream):
                combined = content.encode("latin-1") + existing.read_bytes()
                page.obj["/Contents"] = pikepdf.Stream(pdf, combined)
            elif isinstance(existing, pikepdf.Array):
                new_array = pikepdf.Array([new_stream] + list(existing))
                page.obj["/Contents"] = new_array

            # Link annotation
            link_rect = pikepdf.Array([x, y, x + logo_w_pt, y + logo_h_pt])
            annot = pikepdf.Dictionary({
                "/Type": pikepdf.Name("/Annot"),
                "/Subtype": pikepdf.Name("/Link"),
                "/Rect": link_rect,
                "/Border": pikepdf.Array([0, 0, 0]),
                "/H": pikepdf.Name("/I"),
                "/A": pikepdf.Dictionary({
                    "/S": pikepdf.Name("/URI"),
                    "/URI": SITE_URL,
                }),
                "/PA": pikepdf.Dictionary({
                    "/S": pikepdf.Name("/URI"),
                    "/URI": SITE_URL,
                }),
            })
            if "/Annots" not in page.obj:
                page.obj["/Annots"] = pikepdf.Array()
            page.obj["/Annots"].append(annot)

        buf = BytesIO()
        pdf.save(buf)
        return buf.getvalue()


def upload_to_examanet(file_id: int, processed_bytes: bytes, parsed: dict, teacher_name: str) -> dict:
    """Send processed PDF to Examanet admin endpoint."""
    files = {
        "file": (f"{file_id}.pdf", BytesIO(processed_bytes), "application/pdf"),
    }
    data = {
        "metadata": json.dumps({
            "fileId": str(file_id),
            "parsed": parsed,
            "teacherName": teacher_name,
        }),
    }
    headers = {"x-seed-token": SEED_TOKEN}
    r = requests.post(EXAMANET_API, files=files, data=data, headers=headers, timeout=120)
    return r.json()


def main():
    # Load files
    with open("/tmp/zouari-unique-files.json") as f:
        files = json.load(f)
    print(f"📋 Loaded {len(files)} unique Zouari files\n")

    print(f"🚀 Starting import to {EXAMANET_API}\n")
    print(f"{'='*80}")

    for i, file_meta in enumerate(files, 1):
        file_id = file_meta["fileId"]
        title = file_meta["cleanTitle"]
        teacher_name = file_meta.get("teacherNormalized", "Mr Zouari SAmi")

        # Parse title
        parsed = parse_title(title)
        print(f"\n[{i}/{len(files)}] 📄 {title[:70]}")
        print(f"    → {parsed['type']}" +
              (f" {parsed['homeworkSubtype']} N°{parsed['homeworkNumber']}" if parsed['type'] == 'HOMEWORK' else "") +
              f" | {parsed['subjectSlug']} | {parsed['classSlug']} | T={parsed['trimester']}" +
              (f" | PILOTE" if parsed['schoolType'] == 'PILOTE' else "") +
              (f" | CORRIGÉ" if parsed['hasCorrection'] else ""))

        try:
            # Skip if missing critical data
            if not parsed['subjectSlug'] or not parsed['classSlug']:
                print(f"    ⏭️ Skipping (no subject or class)")
                STATS['skipped'] += 1
                continue

            # Download
            print(f"    ⬇️ Downloading...")
            pdf_bytes = download_pdf(file_meta["url"])
            orig_size = len(pdf_bytes)

            # Process
            print(f"    🔧 Processing ({orig_size/1024:.0f} KB)...")
            processed = process_pdf(pdf_bytes)
            new_size = len(processed)
            STATS['total_size'] += new_size

            # Upload to Examanet
            print(f"    ☁️ Uploading to Examanet...")
            result = upload_to_examanet(file_id, processed, parsed, teacher_name)

            if result.get("success"):
                if result.get("skipped"):
                    print(f"    ⏭️ Already imported: {result['resourceId']}")
                    STATS['skipped'] += 1
                else:
                    print(f"    ✅ Resource: {result['resourceId']}")
                    print(f"    🔗 {result['fileUrl'][:70]}...")
                    STATS['success'] += 1
            else:
                print(f"    ❌ API Error: {result.get('error', 'unknown')}")
                STATS['errors'] += 1
                STATS['errors_list'].append({"fileId": file_id, "error": result.get("error")})

        except Exception as e:
            print(f"    ❌ Error: {e}")
            STATS['errors'] += 1
            STATS['errors_list'].append({"fileId": file_id, "error": str(e)})

        # Rate limit
        time.sleep(0.5)

    print(f"\n{'='*80}")
    print(f"📊 IMPORT COMPLETE")
    print(f"{'='*80}")
    print(f"✅ Success:    {STATS['success']}")
    print(f"⏭️ Skipped:    {STATS['skipped']}")
    print(f"❌ Errors:     {STATS['errors']}")
    print(f"📦 Total size: {STATS['total_size']/1024/1024:.1f} MB")

    if STATS['errors_list']:
        print(f"\n⚠️ Error details:")
        for e in STATS['errors_list'][:10]:
            print(f"  - {e['fileId']}: {e['error']}")


if __name__ == "__main__":
    main()