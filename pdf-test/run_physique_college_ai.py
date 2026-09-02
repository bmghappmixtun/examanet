#!/usr/bin/env python3
"""
Run AI metadata extraction for 365 Physique collège resources.

Per user rule (2026-08-02):
- If text is FR → all output in FR
- If text is AR → all output in AR

Reads from LIVE ResourceContent table (best OCR: PyMuPDF + Tesseract fallback)
Saves to ResourceMetadataStaging (consistent with existing 58 entries).

Usage:
  python3 run_physique_college_ai.py --dry-run --limit 5
  python3 run_physique_college_ai.py --apply --workers 3
"""
import os
import sys
import re
import json
import time
import argparse
import asyncio
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

# SECURITY: env var required, never hardcoded
NEON_API_KEY = os.environ.get("NEON_API_KEY")
if not NEON_API_KEY:
    sys.exit("❌ NEON_API_KEY env var is required. Set in .env.local and export.")

BRANCH_ID = "br-purple-recipe-as2x8yyo"
PROJECT_ID = "little-silence-94324724"

# === OpenAI client ===
from openai import OpenAI
client = OpenAI()


def q(sql, role="edutunisie_app", timeout=60):
    body = json.dumps({"db_name": "neondb", "role_name": role, "query": sql, "branch_id": BRANCH_ID}).encode()
    req = urllib.request.Request(
        f"https://console.neon.tech/api/v2/projects/{PROJECT_ID}/query",
        data=body,
        headers={"Authorization": f"Bearer {NEON_API_KEY}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def esc(s):
    if s is None:
        return ""
    return str(s).replace("\\", "\\\\").replace("'", "''")


def find_pending_physique_college(limit=None):
    """Find Physique collège resources NOT YET in ResourceMetadataStaging.
    Returns list of (rid, numericId, title, class_slug, subject_slug, language, text).
    """
    limit_str = f"LIMIT {limit}" if limit else ""
    sql = f"""
    SELECT r.id, r."numericId", r.title, r.language, c.slug AS class_slug, s.slug AS subject_slug,
           rc."fullText"
    FROM "Resource" r
    JOIN "Subject" s ON s.id = r."subjectId"
    JOIN "Class" c ON c.id = r."classId"
    LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
    WHERE s.slug = 'physique'
      AND c.slug IN ('7eme', '8eme', '9eme')
      AND r.id NOT IN (SELECT "resourceId" FROM "ResourceMetadataStaging")
    ORDER BY r."numericId"
    {limit_str}
    """
    r = q(sql)
    return r.get("response", [{}])[0].get("data", {}).get("rows", [])


# === LANGUAGE-AWARE PROMPTS ===

PROMPT_SUBJECT_AR = """أنت خبير في تصنيف الموارد التعليمية التونسية.

القسم: {class_slug}
المادة: {subject_slug}
العنوان: {title}

نص المستند (أول 3000 حرف):
{text}

حدد الموضوع العام لهذا المستند (مثال: "الأعداد الحقيقية"، "الشعر"، "الخلية").

أرجع كائن JSON يحتوي على حقل "subject".
مثال: {{"subject": "الأعداد الحقيقية"}}"""

PROMPT_SUBJECT_FR = """Tu es un expert en classification de ressources éducatives tunisiennes.

Classe: {class_slug}
Sujet connu: {subject_slug}
Titre: {title}

Texte du document (premiers 3000 chars):
{text}

Détermine le sujet général de ce document (ex: "Les nombres réels", "La poésie", "La cellule").

Retourne un objet JSON avec le champ "subject".
Exemple: {{"subject": "Les nombres réels"}}"""

PROMPT_KEYPOINTS_AR = """أنت خبير في بيداغوجيا التعليم التونسي.

الموضوع: {subject}
القسم: {class_slug}
العنوان: {title}

نص المستند (أول 4000 حرف):
{text}

حدد 4-6 مفاهيم/نقاط رئيسية لهذا المستند.
لكل نقطة، أعط عنوان قصير (2-3 كلمات بحد أقصى) بالعربية سيتم عرضه كشارة قابلة للنقر.
أمثلة: "الأعداد الحقيقية"، "المعادلات"، "نظرية فيثاغورس"

أرجع JSON: {{"key_points": ["نقطة1", "نقطة2", ...]}}"""

PROMPT_KEYPOINTS_FR = """Tu es un expert en pédagogie tunisienne.

Sujet: {subject}
Classe: {class_slug}
Titre: {title}

Texte du document (premiers 4000 chars):
{text}

Identifie les 4-6 concepts/points clés de ce document.
Pour chaque point, donne un TITRE COURT (2-3 mots MAX) en français qui sera affiché comme un badge cliquable.
Exemples: "Nombres réels", "Équations", "Théorème de Pythagore"

Retourne un JSON: {{"key_points": ["point1", "point2", ...]}}"""

PROMPT_META_AR = """أنت خبير في استخراج البيانات الوصفية للمستندات المدرسية التونسية.

الموضوع: {subject}
القسم: {class_slug}
المادة في قاعدة البيانات: {subject_slug}
العنوان: {title}

نص المستند (أول 3000 حرف):
{text}

استخرج البيانات الوصفية التالية بصيغة JSON:
- profLastName: اسم الأستاذ بالفرنسية (بدون لقب)
- profLastNameAr: اسم الأستاذ بالعربية
- schoolName: اسم المدرسة بالفرنسية
- schoolNameAr: اسم المدرسة بالعربية
- type: نوع المستند (DEVOIR/EXERCICE/EXAMEN/COURSE/RESUME)
- academicYear: السنة الدراسية (مثال: "2019-2020") أو null
- trimester: الثلاثي (1، 2، أو 3) أو null
- duration: المدة (مثال: "55 دقيقة") أو null
- confidence: مستوى الثقة 0-1

أرجع JSON فقط، بدون markdown."""

PROMPT_META_FR = """Tu es un expert en extraction de métadonnées pour documents scolaires tunisiens.

Sujet: {subject}
Classe: {class_slug}
Sujet DB: {subject_slug}
Titre: {title}

Texte du document (premiers 3000 chars):
{text}

Extrais les métadonnées suivantes en JSON:
- profLastName: nom du prof en français (sans titre)
- profLastNameAr: nom du prof en arabe
- schoolName: nom de l'école en français
- schoolNameAr: nom de l'école en arabe
- type: type de document (DEVOIR/EXERCICE/EXAMEN/COURSE/RESUME)
- academicYear: année scolaire (ex: "2019-2020") ou null
- trimester: trimestre (1, 2, ou 3) ou null
- duration: durée (ex: "55 minutes") ou null
- confidence: niveau de confiance 0-1

Retourne UNIQUEMENT le JSON, sans markdown."""


def call_ai(prompt, max_tokens=200):
    """Call gpt-4o-mini with JSON response format."""
    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            max_tokens=max_tokens,
        )
        return json.loads(resp.choices[0].message.content)
    except Exception as e:
        return None


def detect_real_lang(text):
    """FR if Latin ratio >= 0.8, else AR (per user rule).

    IMPORTANT: Cover ALL Arabic Unicode blocks:
    - U+0600-U+06FF: Arabic
    - U+0750-U+077F: Arabic Supplement
    - U+08A0-U+08FF: Arabic Extended-A
    - U+FB50-U+FDFF: Arabic Presentation Forms-A
    - U+FE70-U+FEFF: Arabic Presentation Forms-B
    Without these, OCR text with Arabic Presentation Forms (which is what
    PyMuPDF + Tesseract usually produce) is incorrectly detected as Latin.
    """
    if not text:
        return "ar"
    # Arabic: U+0600-U+06FF + U+0750-U+077F + U+08A0-U+08FF + U+FB50-U+FDFF + U+FE70-U+FEFF
    ar_pattern = r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]"
    ar = len(re.findall(ar_pattern, text))
    # Latin: ASCII A-Z/a-z + Latin Extended (for accented French chars)
    lat = len(re.findall(r"[A-Za-z\u00C0-\u024F]", text))
    total = ar + lat
    if total == 0:
        return "ar"
    return "fr" if (lat / total) >= 0.8 else "ar"


def process_one(args):
    """Process one resource. args = (rid, nid, title, class_slug, subject_slug, db_lang, text, dry_run)."""
    rid, nid, title, class_slug, subject_slug, db_lang, text, dry_run = args
    text = text or ""
    if len(text) < 100:
        return {"id": nid, "status": "TEXT_TOO_SHORT", "len": len(text)}

    # Per user rule: respect REAL text language (not just DB field)
    real_lang = detect_real_lang(text)

    # Pick prompts based on language
    if real_lang == "ar":
        subject_prompt = PROMPT_SUBJECT_AR.format(class_slug=class_slug, subject_slug=subject_slug, title=title, text=text[:3000])
        meta_prompt_tpl = PROMPT_META_AR
    else:
        subject_prompt = PROMPT_SUBJECT_FR.format(class_slug=class_slug, subject_slug=subject_slug, title=title, text=text[:3000])
        meta_prompt_tpl = PROMPT_META_FR

    # 1. Subject extraction
    sub_data = call_ai(subject_prompt, max_tokens=100)
    if not sub_data:
        return {"id": nid, "status": "SUBJECT_ERROR"}
    subject = sub_data.get("subject") or sub_data.get("sujet") or sub_data.get("name") or sub_data.get("title") or ""
    if not subject:
        return {"id": nid, "status": "SUBJECT_EMPTY"}

    # 2. Key points
    if real_lang == "ar":
        kp_prompt = PROMPT_KEYPOINTS_AR.format(subject=subject, class_slug=class_slug, title=title, text=text[:4000])
    else:
        kp_prompt = PROMPT_KEYPOINTS_FR.format(subject=subject, class_slug=class_slug, title=title, text=text[:4000])
    kp_data = call_ai(kp_prompt, max_tokens=200)
    key_points = (kp_data or {}).get("key_points", [])
    if not isinstance(key_points, list):
        key_points = []

    # 3. Metadata
    meta_prompt = meta_prompt_tpl.format(
        subject=subject, class_slug=class_slug, subject_slug=subject_slug, title=title, text=text[:3000]
    )
    meta = call_ai(meta_prompt, max_tokens=500)
    if not meta:
        return {"id": nid, "status": "META_ERROR", "subject": subject, "key_points": key_points}

    result = {
        "subject": subject,
        "keyPoints": key_points,
        "profLastName": meta.get("profLastName"),
        "profLastNameAr": meta.get("profLastNameAr"),
        "schoolName": meta.get("schoolName"),
        "schoolNameAr": meta.get("schoolNameAr"),
        "type": meta.get("type"),
        "academicYear": meta.get("academicYear"),
        "trimester": meta.get("trimester"),
        "duration": meta.get("duration"),
        "confidence": meta.get("confidence", 0.5),
    }

    if dry_run:
        return {
            "id": nid,
            "status": "DRY_RUN_OK",
            "lang": real_lang,
            "subject": result["subject"],
            "kp_count": len(result["keyPoints"]),
            "prof": result["profLastNameAr"] or result["profLastName"] or "?",
            "school": result["schoolNameAr"] or result["schoolName"] or "?",
        }

    # Save to ResourceMetadataStaging
    save_to_staging(nid, rid, result)
    return {
        "id": nid,
        "status": "STAGED",
        "lang": real_lang,
        "subject": result["subject"],
        "kp_count": len(result["keyPoints"]),
        "prof": result["profLastNameAr"] or result["profLastName"] or "?",
        "school": result["schoolNameAr"] or result["schoolName"] or "?",
    }


def save_to_staging(numeric_id, resource_id, meta):
    """Save metadata to ResourceMetadataStaging."""
    kp_array = "{" + ",".join(f'"{esc(p)}"' for p in (meta.get("keyPoints") or [])) + "}"
    sql = f"""
    INSERT INTO "ResourceMetadataStaging"
        ("resourceId", "numericId", "subject", "keyPoints",
         "profLastName", "profLastNameAr",
         "schoolName", "schoolNameAr",
         "type", "academicYear", "trimester", "duration",
         "confidence", "sourceTable", "modelUsed", "isApplied")
    VALUES
        ('{esc(resource_id)}', {numeric_id}, '{esc(meta.get("subject"))}', '{kp_array}'::text[],
         '{esc(meta.get("profLastName"))}', '{esc(meta.get("profLastNameAr"))}',
         '{esc(meta.get("schoolName"))}', '{esc(meta.get("schoolNameAr"))}',
         '{esc(meta.get("type"))}', '{esc(meta.get("academicYear"))}', '{esc(meta.get("trimester"))}', '{esc(meta.get("duration"))}',
         {meta.get("confidence") or 0.5}, 'ResourceContent', 'run_physique_college_ai', FALSE)
    ON CONFLICT ("resourceId") DO UPDATE SET
        "subject" = EXCLUDED."subject",
        "keyPoints" = EXCLUDED."keyPoints",
        "profLastName" = EXCLUDED."profLastName",
        "profLastNameAr" = EXCLUDED."profLastNameAr",
        "schoolName" = EXCLUDED."schoolName",
        "schoolNameAr" = EXCLUDED."schoolNameAr",
        "type" = EXCLUDED."type",
        "academicYear" = EXCLUDED."academicYear",
        "trimester" = EXCLUDED."trimester",
        "duration" = EXCLUDED."duration",
        "confidence" = EXCLUDED."confidence",
        "extractedAt" = NOW()
    """
    q(sql, role="neondb_owner", timeout=30)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--offset", type=int, default=0)
    ap.add_argument("--workers", type=int, default=3)
    args = ap.parse_args()

    dry_run = not args.apply

    print(f"{'[DRY-RUN]' if dry_run else '[APPLY]'} Physique collège AI extraction")
    print(f"Workers: {args.workers}")
    print()

    print("Step 1/3: Finding pending Physique collège resources...")
    resources = find_pending_physique_college(limit=args.limit)
    if args.offset:
        resources = resources[args.offset:]
    print(f"  Found {len(resources)} resources without staging metadata")

    if not resources:
        print("Nothing to do.")
        return

    # Step 2: Build work items
    work = [
        (rid, nid, title, class_slug, subject_slug, lang, text, dry_run)
        for rid, nid, title, lang, class_slug, subject_slug, text in resources
    ]

    # Step 3: Process
    print(f"\nStep 2/3: Processing {len(work)} resources...")
    print(f"{'─' * 90}")

    start = time.time()
    results = []
    if args.workers > 1:
        with ThreadPoolExecutor(max_workers=args.workers) as executor:
            futures = {executor.submit(process_one, w): w for w in work}
            for i, f in enumerate(as_completed(futures), 1):
                r = f.result()
                results.append(r)
                elapsed = time.time() - start
                if i % 5 == 0 or r["status"] in ("STAGED", "DRY_RUN_OK"):
                    prof = r.get("prof") or "?"
                    print(f"  [{i}/{len(work)}] #{r['id']} {r['status']:14} {r.get('lang', '?'):2} {prof[:25]!r} (elapsed {elapsed:.0f}s)")
    else:
        for i, w in enumerate(work, 1):
            r = process_one(w)
            results.append(r)
            elapsed = time.time() - start
            if i % 5 == 0 or r["status"] in ("STAGED", "DRY_RUN_OK"):
                prof = r.get("prof") or "?"
                print(f"  [{i}/{len(work)}] #{r['id']} {r['status']:14} {r.get('lang', '?'):2} {prof[:25]!r} (elapsed {elapsed:.0f}s)")

    # Summary
    print(f"\n{'=' * 90}")
    print(f"SUMMARY (total {time.time() - start:.1f}s)")
    print(f"{'=' * 90}")
    by_status = {}
    by_lang = {}
    for r in results:
        by_status.setdefault(r["status"], []).append(r)
        lang = r.get("lang", "?")
        by_lang[lang] = by_lang.get(lang, 0) + 1
    for status, items in sorted(by_status.items()):
        print(f"  {status}: {len(items)}")
    print(f"\nBy language:")
    for lang, count in sorted(by_lang.items()):
        print(f"  {lang}: {count}")

    # Quality stats
    ok = [r for r in results if r["status"] in ("STAGED", "DRY_RUN_OK")]
    if ok:
        profs = sum(1 for r in ok if r.get("prof") and r["prof"] != "?")
        schools = sum(1 for r in ok if r.get("school") and r["school"] != "?")
        kps = sum(r.get("kp_count", 0) for r in ok)
        print(f"\nQuality on {len(ok)} resources:")
        print(f"  prof detected:   {profs}/{len(ok)} ({profs / len(ok) * 100:.1f}%)")
        print(f"  school detected: {schools}/{len(ok)} ({schools / len(ok) * 100:.1f}%)")
        print(f"  total keyPoints: {kps} (avg {kps / len(ok):.1f}/resource)")


if __name__ == "__main__":
    main()
