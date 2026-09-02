#!/usr/bin/env python3
"""
Fix AI summaries for Physique collège:
1. Regenerate 36 FR-only summaries for PUBLIC/ar docs (force AR)
2. Deep-check 313 AR summaries for hallucinations/generic content
"""
import os, json, re, sys, argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from openai import OpenAI
import urllib.request

NEON_API_KEY = os.environ.get('NEON_API_KEY', '')
NEON_PROJECT = 'little-silence-94324724'
BRANCH_ID = 'br-purple-recipe-as2x8yyo'
OPENAI_KEY = os.environ.get('OPENAI_API_KEY', '')

client = OpenAI(api_key=OPENAI_KEY) if OPENAI_KEY else None


def neon_query(sql, role='edutunisie_app', timeout=120):
    body = {'db_name': 'neondb', 'role_name': role, 'query': sql, 'branch_id': BRANCH_ID}
    req = urllib.request.Request(
        f'https://console.neon.tech/api/v2/projects/{NEON_PROJECT}/query',
        data=json.dumps(body).encode(),
        headers={'Authorization': f'Bearer {NEON_API_KEY}', 'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


# =================== PROMPTS ===================

PROMPT_SUMMARY_AR = """أنت خبير في التعليم التونسي. اكتب ملخصاً قصيراً (3-5 جمل) لوثيقة تعليمية تونسية في الفيزياء.

اللغة: العربية فقط.
المتطلبات:
- ابدأ بـ "يتناول هذا..." أو "يغطي هذا..."
- اذكر الموضوع الرئيسي بوضوح
- اذكر المستوى الدراسي إذا كان ظاهراً
- اذكر الأستاذ إذا كان ظاهراً
- لا تذكر "OCR" أو "استخراج النص" أو "تقنية" - اكتب عن المحتوى الفعلي للمستند

Header (بداية المستند):
{header}

Body (أول 2000 حرف):
{body}

Metadata:
- Titre: {title}
- Matière: فيزياء (المستوى الإعدادي)
- Classe: {class_name_ar}

Réponds UNIQUEMENT بالملخص، بدون JSON أو markdown.
"""


def call_ai(prompt, max_tokens=400):
    if not client:
        raise RuntimeError("OPENAI_API_KEY not set")
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=max_tokens,
        temperature=0.3,
    )
    return resp.choices[0].message.content or ""


def detect_real_lang(text):
    """FR if Latin ratio >= 0.8, else AR. With Arabic Presentation Forms."""
    if not text:
        return "ar"
    ar_pattern = r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]"
    ar = len(re.findall(ar_pattern, text))
    lat = len(re.findall(r"[A-Za-z\u00C0-\u024F]", text))
    total = ar + lat
    if total == 0:
        return "ar"
    return "fr" if (lat / total) >= 0.8 else "ar"


def strip_html(s):
    return re.sub(r'<[^>]+>', ' ', s) if s else ""


# =================== DETECTION ===================

def is_ocr_hallucination(summary):
    """Detect AI hallucination about OCR technology."""
    if not summary:
        return False
    s = summary.lower()
    return any(kw in s for kw in [
        "ocr", "reconnaissance optique", "extraction de texte",
        "extraire du texte", "convertir", "images en texte"
    ])


def is_math_or_other_subject(summary):
    """Detect mismatch with Physique subject."""
    if not summary:
        return False
    s = summary.lower()
    return ("math" in s and "physique" not in s) or "technologie" in s and "physique" not in s


def is_generic(summary):
    """Detect generic summaries without specific content."""
    if not summary:
        return True
    clean = strip_html(summary)
    if len(clean) < 150:
        return True
    # Check for generic phrases with no specific topic
    generic_patterns = [
        r"^ce devoir (de |d')[a-zéè]+ (aborde|évalue|présente) des concepts",
        r"^ce document (évalue|aborde|présente) des (concepts|notions)",
    ]
    s = clean.lower().strip()
    return any(re.match(p, s) for p in generic_patterns)


# =================== MAIN ===================

def find_targets():
    """Find PUBLIC/ar docs with FR-only summary."""
    sql = """
    SELECT r.id, r."numericId", r.summary, c.slug, s.slug
    FROM "Resource" r
    JOIN "Subject" s ON s.id = r."subjectId"
    JOIN "Class" c ON c.id = r."classId"
    WHERE s.slug = 'physique' AND c.slug IN ('7eme','8eme','9eme')
      AND r."schoolType" = 'PUBLIC' AND r.language = 'ar'
      AND r.summary IS NOT NULL AND r.summary != ''
    """
    r = neon_query(sql)
    rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])

    # Classify each
    targets = []  # (rid, nid, reason, current_summary)
    for rid, nid, summary, class_slug, subject_slug in rows:
        if not summary:
            continue
        # Check language
        clean = strip_html(summary)
        ar = sum(1 for c in clean if '\u0600' <= c <= '\u06FF' or '\uFB50' <= c <= '\uFDFF' or '\uFE70' <= c <= '\uFEFF')
        la = sum(1 for c in clean if c.isascii() and c.isalpha())
        total = ar + la
        if total == 0:
            continue

        reason = None
        # Wrong language (FR-only)
        if la / total > 0.5:
            reason = "WRONG_LANG(FR)"
        # OCR hallucination
        elif is_ocr_hallucination(summary):
            reason = "OCR_HALLUCINATION"
        # Math/other subject
        elif is_math_or_other_subject(summary):
            reason = "WRONG_SUBJECT"
        # Generic
        elif is_generic(summary):
            reason = "GENERIC"

        if reason:
            targets.append((rid, nid, reason, class_slug, summary))

    return targets


def fetch_texts(rids):
    if not rids:
        return {}
    rids_csv = "'" + "','".join(rids) + "'"
    sql = f"""
    SELECT rc."resourceId", rc."fullText"
    FROM "ResourceContent" rc
    WHERE rc."resourceId" IN ({rids_csv})
    """
    r = neon_query(sql)
    return {row[0]: row[1] or "" for row in r.get('response', [{}])[0].get('data', {}).get('rows', [])}


def process_one(args):
    rid, nid, class_slug, text, dry_run = args
    text = text or ""
    if len(text) < 100:
        return {"id": nid, "rid": rid, "status": "TEXT_TOO_SHORT"}

    class_names_ar = {"7eme": "السابعة أساسي", "8eme": "الثامنة أساسي", "9eme": "التاسعة أساسي"}
    class_name = class_names_ar.get(class_slug, class_slug)

    header = text[:1000].replace("\n", " ")
    body = text[:2000].replace("\n", " ")

    try:
        prompt = PROMPT_SUMMARY_AR.format(
            title="",  # Will be looked up
            class_name_ar=class_name,
            header=header,
            body=body,
        )
        resp = call_ai(prompt, max_tokens=400)
        return {
            "id": nid,
            "rid": rid,
            "status": "OK",
            "summary": resp.strip(),
        }
    except Exception as e:
        return {"id": nid, "rid": rid, "status": "ERROR", "error": str(e)[:200]}


def apply_to_live(rid, summary):
    if not summary:
        return False
    # Escape: backslash, single-quote, double-quote
    # For HTML content, we may have <, >, &, etc. Escape for SQL string
    safe = summary.replace("\\", "\\\\").replace("'", "''")
    sql = f"UPDATE \"Resource\" SET summary = '{safe}' WHERE id = '{rid}'"
    result = neon_query(sql, role='neondb_owner', timeout=30)
    if result.get('errors'):
        print(f"  Save error: {result['errors'][0].get('message', '')[:200]}")
        return False
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--workers', type=int, default=3)
    ap.add_argument('--limit', type=int, default=0)
    args = ap.parse_args()
    dry_run = not args.apply

    print(f'\n{"="*80}')
    print(f'{"DRY-RUN" if dry_run else "*** APPLY ***"}: Fix AI summaries for Physique collège')
    print(f'{"="*80}\n')

    print("Step 1: Deep analysis of all 423 summaries...")
    targets = find_targets()
    print(f"Found {len(targets)} summaries that need fixing")

    # Group by reason
    from collections import Counter
    reasons = Counter([t[2] for t in targets])
    for reason, count in reasons.most_common():
        print(f"  {reason}: {count}")

    if not targets:
        print("No fixes needed!")
        return

    if args.limit:
        targets = targets[:args.limit]

    # Show samples
    print("\nSample targets:")
    for rid, nid, reason, class_slug, summary in targets[:10]:
        print(f"  #{nid} [{reason}]: {summary[:80]}")
    print()

    print(f"Step 2: Fetching OCR text for {len(targets)}...")
    rids = [t[0] for t in targets]
    texts = fetch_texts(rids)
    print(f"Got text for {len(texts)}/{len(rids)} resources")

    job_args = []
    for (rid, nid, reason, class_slug, summary) in targets:
        text = texts.get(rid, "")
        if len(text) < 100:
            print(f"  #{nid} SKIP: no/short text")
            continue
        job_args.append((rid, nid, class_slug, text, dry_run))

    print(f"\nStep 3: Processing {len(job_args)} jobs with {args.workers} workers (AR forced)...\n")

    results = []
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futures = {ex.submit(process_one, a): a for a in job_args}
        for f in as_completed(futures):
            r = f.result()
            results.append(r)
            status = r.get("status")
            if status == "OK":
                summary = r.get("summary", "")
                has_ar = any('\u0600' <= c <= '\u06FF' for c in summary)
                has_ocr = "OCR" in summary or "reconnaissance" in summary.lower()
                quality = "✅" if has_ar and not has_ocr else "⚠️"
                print(f"  {quality} #{r['id']} OK AR={has_ar} OCR={has_ocr}: {summary[:80]}")
            else:
                print(f"  ❌ #{r['id']} {status}: {r.get('error', '')}")

    # Summary
    print(f"\n{'='*80}")
    print(f"SUMMARY")
    print(f"{'='*80}")
    ok = [r for r in results if r.get("status") == "OK"]
    print(f"OK: {len(ok)}/{len(results)}")
    ar_count = sum(1 for r in ok if any('\u0600' <= c <= '\u06FF' for c in r.get("summary", "")))
    no_ocr = sum(1 for r in ok if "OCR" not in r.get("summary", "") and "reconnaissance" not in r.get("summary", "").lower())
    print(f"With AR: {ar_count}/{len(ok)}")
    print(f"Without OCR hallucination: {no_ocr}/{len(ok)}")
    print(f"Cost (estimate): ~${len(ok) * 0.003:.2f}")

    if dry_run:
        print("\nDRY-RUN: not applied. Use --apply to write.")
        return

    print(f"\nStep 4: Applying {len(ok)} to live Resource.summary...")
    applied = 0
    for r in ok:
        if apply_to_live(r['rid'], r['summary']):
            applied += 1
    print(f"Applied: {applied}/{len(ok)}")


if __name__ == '__main__':
    main()
