#!/usr/bin/env python3
"""
Re-extract generalSubject for Physique collège docs that have
FR generalSubject but should have AR (because the doc is in AR).

Uses the FIXED language detection (Arabic Presentation Forms covered).
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


# Arabic-only subject prompt
PROMPT_SUBJECT_AR = """أنت خبير في التعليم التونسي. حلّل هذا المستند الدراسي التونس (فرض، تمرين أو درس فيزياء) واستخرج الموضوع العام.

اللغة: العربية فقط.

قواعد:
- الموضوع يجب أن يكون قصير (3-8 كلمات)
- يصف المحتوى الفعلي للمستند (وليس العنوان الحرفي)
- مثال: "الكتلة الحجمية", "الحرارة والطاقة الحرارية", "خصائص المحاليل"

Header (بداية المستند):
{header}

Body (أول 2000 حرف):
{body}

Metadata:
- Matière: {subject_name_ar}

Réponds UNIQUEMENT avec ce JSON:
{{"subject": "الموضوع العام"}}
"""


def call_ai(prompt, max_tokens=100):
    if not client:
        raise RuntimeError("OPENAI_API_KEY not set")
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=max_tokens,
        temperature=0.2,
    )
    return resp.choices[0].message.content or ""


def extract_json(content):
    if not content:
        return None
    try:
        return json.loads(content)
    except Exception:
        pass
    m = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', content, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass
    m = re.search(r'\{.*\}', content, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            pass
    return None


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


def process_one(args):
    rid, nid, text, expected_lang = args
    text = text or ""
    if len(text) < 100:
        return {"id": nid, "status": "TEXT_TOO_SHORT", "len": len(text)}

    header = text[:1000].replace("\n", " ")
    body = text[:2000].replace("\n", " ")

    # Detect language with the FIXED logic
    real_lang = detect_real_lang(text)
    if real_lang != expected_lang:
        # Skip docs that are correctly FR (some PUBLIC docs have FR text)
        return {"id": nid, "status": "SKIP", "detected_lang": real_lang, "expected": expected_lang}

    try:
        prompt = PROMPT_SUBJECT_AR.format(
            subject_name_ar="الفيزياء",
            header=header,
            body=body,
        )
        resp = call_ai(prompt, max_tokens=100)
        data = extract_json(resp)
        subject = data.get("subject") if data else None
        return {
            "id": nid,
            "rid": rid,
            "status": "OK",
            "subject": subject,
        }
    except Exception as e:
        return {"id": nid, "rid": rid, "status": "ERROR", "error": str(e)[:200]}


def find_targets():
    """Find PUBLIC/ar docs with FR-only generalSubject."""
    sql = """
    SELECT r.id, r."numericId", c.slug, s.slug
    FROM "Resource" r
    JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    JOIN "Subject" s ON s.id = r."subjectId"
    JOIN "Class" c ON c.id = r."classId"
    WHERE s.slug = 'physique' AND c.slug IN ('7eme','8eme','9eme')
      AND r."schoolType" = 'PUBLIC'
      AND r.language = 'ar'
      AND rm."generalSubject" IS NOT NULL
      AND rm."generalSubject" ~ '[A-Za-z]'
      AND NOT (rm."generalSubject" ~ '[\\u0600-\\u06FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]')
    ORDER BY r."numericId"::int
    """
    r = neon_query(sql)
    return r.get('response', [{}])[0].get('data', {}).get('rows', [])


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


def apply_to_live(rid, subject):
    if not subject:
        return False
    # Escape apostrophes
    subj_esc = subject.replace("'", "''")
    sql = f"UPDATE \"ResourceMetadata\" SET \"generalSubject\" = '{subj_esc}' WHERE \"resourceId\" = '{rid}'"
    result = neon_query(sql, role='neondb_owner', timeout=30)
    return not result.get('errors')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--limit', type=int, default=300)
    ap.add_argument('--workers', type=int, default=5)
    args = ap.parse_args()
    dry_run = not args.apply

    print(f'\n{"="*80}')
    print(f'{"DRY-RUN" if dry_run else "*** APPLY ***"}: Re-extract generalSubject in AR for misdetected docs')
    print(f'{"="*80}\n')

    targets = find_targets()
    print(f"Found {len(targets)} target docs (PUBLIC/ar with FR-only generalSubject)")
    if not targets:
        return
    if args.limit:
        targets = targets[:args.limit]

    rids = [t[0] for t in targets]
    print(f"Fetching OCR text for {len(rids)} resources...")
    texts = fetch_texts(rids)
    print(f"Got text for {len(texts)}/{len(rids)} resources")

    job_args = []
    for (rid, nid, class_slug, subject_slug) in targets:
        text = texts.get(rid, "")
        if len(text) < 100:
            continue
        job_args.append((rid, nid, text, "ar"))

    print(f"\nProcessing {len(job_args)} jobs with {args.workers} workers (lang=AR forced, detect-validated)...\n")

    results = []
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futures = {ex.submit(process_one, a): a for a in job_args}
        for f in as_completed(futures):
            r = f.result()
            results.append(r)
            status = r.get("status")
            if status == "OK":
                subj = r.get("subject", "")
                has_ar = subj and any('\u0600' <= c <= '\u06FF' for c in subj)
                print(f"  #{r['id']} OK AR={has_ar}: {subj!r}")
            else:
                print(f"  #{r['id']} {status}: {r.get('error', r.get('detected_lang', ''))}")

    # Summary
    print(f"\n{'='*80}")
    print(f"SUMMARY")
    print(f"{'='*80}")
    ok = [r for r in results if r.get("status") == "OK"]
    print(f"OK: {len(ok)}/{len(results)}")
    ar_count = sum(1 for r in ok if r.get("subject") and any(
        '\u0600' <= c <= '\u06FF' for c in r["subject"]
    ))
    print(f"With AR subject: {ar_count}/{len(ok)}")
    print(f"Cost (estimate): ~${len(ok) * 0.001:.2f}")

    if dry_run:
        print("\nDRY-RUN: not applied. Use --apply to write.")
        return

    print(f"\nApplying {len(ok)} to live ResourceMetadata...")
    applied = 0
    for r in ok:
        if apply_to_live(r['rid'], r['subject']):
            applied += 1
    print(f"Applied: {applied}/{len(ok)}")


if __name__ == '__main__':
    main()
