#!/usr/bin/env python3
"""
Re-extract keyPoints for the 50 Physique collège docs that were
incorrectly detected as French (bug: Arabic Presentation Forms not counted).

Forces AR prompt for these 50 (since real content is AR per user rule).
Saves to ResourceMetadataStaging (does NOT touch live).
"""
import os, json, re, sys, argparse, time
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


# =================== PROMPTS (AR forced) ===================

# Subject prompt in AR
PROMPT_SUBJECT_AR = """أنت خبير في التعليم التونسي. حلّل هذا المستند الدراسي التونس (فرض، تمرين أو درس) واستخرج الموضوع العام.

اللغة: العربية فقط.
الموضوع يجب أن يكون قصير (3-8 كلمات) ومحدد.

Header (بداية المستند):
{header}

Body (أول 2000 حرف):
{body}

Metadata:
- Titre: {title}
- Matière: {subject_name_ar}
- Classe: {class_name_ar}

Réponds UNIQUEMENT avec ce JSON:
{{"subject": "الموضوع العام"}}
"""

# KeyPoints prompt in AR
PROMPT_KEYPOINTS_AR = """أنت خبير في التعليم التونسي. حلّل هذا المستند واستخرج 4-6 نقاط رئيسية (Key Points) تصف المفاهيم الأساسية التي يتناولها المستند.

اللغة: العربية فقط.
كل نقطة يجب أن تكون:
- قصيرة (2-5 كلمات)
- محددة (تذكر مفهوماً واحداً واضحاً)
- مستخرجة فعلياً من المستند (لا تخمّن)

Header:
{header}

Body (أول 2000 حرف):
{body}

Réponds UNIQUEMENT avec ce JSON:
{{"keyPoints": ["نقطة 1", "نقطة 2", "نقطة 3", "نقطة 4", "نقطة 5", "نقطة 6"]}}
"""


def call_ai(prompt, max_tokens=400):
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
    """Extract JSON from AI response (sometimes wrapped in markdown)."""
    if not content:
        return None
    # Try direct parse
    try:
        return json.loads(content)
    except Exception:
        pass
    # Try markdown code block
    m = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', content, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass
    # Try first { ... }
    m = re.search(r'\{.*\}', content, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            pass
    return None


def process_one(args):
    """Process one resource: re-extract subject + keyPoints in AR."""
    rid, nid, title, class_slug, subject_slug, text, dry_run = args
    text = text or ""
    if len(text) < 100:
        return {"id": nid, "status": "TEXT_TOO_SHORT", "len": len(text)}

    # Get first 1000 chars (header) and 2000 chars (body)
    header = text[:1000].replace("\n", " ")
    body = text[:2000].replace("\n", " ")

    # Class names in AR
    class_names_ar = {
        "7eme": "السابعة أساسي",
        "8eme": "الثامنة أساسي",
        "9eme": "التاسعة أساسي",
    }
    subject_names_ar = {
        "physique": "الفيزياء",
    }

    try:
        # 1. Subject
        subject_prompt = PROMPT_SUBJECT_AR.format(
            class_slug=class_slug,
            subject_slug=subject_slug,
            class_name_ar=class_names_ar.get(class_slug, class_slug),
            subject_name_ar=subject_names_ar.get(subject_slug, subject_slug),
            title=title,
            header=header,
            body=body,
        )
        subject_resp = call_ai(subject_prompt, max_tokens=100)
        subject_data = extract_json(subject_resp)
        subject = subject_data.get("subject") if subject_data else None

        # 2. KeyPoints
        kp_prompt = PROMPT_KEYPOINTS_AR.format(
            header=header,
            body=body,
        )
        kp_resp = call_ai(kp_prompt, max_tokens=400)
        kp_data = extract_json(kp_resp)
        key_points = kp_data.get("keyPoints") if kp_data else None

        result = {
            "id": nid,
            "status": "OK",
            "subject": subject,
            "keyPoints": key_points,
            "kp_count": len(key_points) if key_points else 0,
        }
        return result
    except Exception as e:
        return {"id": nid, "status": "ERROR", "error": str(e)[:200]}


def find_50_targets():
    """Find the 50 Physique collège docs with FR-only keyPoints in live."""
    sql = """
    SELECT r.id as resource_id, r."numericId", r.title, c.slug, s.slug
    FROM "Resource" r
    JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    JOIN "Subject" s ON s.id = r."subjectId"
    JOIN "Class" c ON c.id = r."classId"
    WHERE s.slug = 'physique' AND c.slug IN ('7eme','8eme','9eme')
      AND r."schoolType" = 'PUBLIC'
      AND r.language = 'ar'
      AND array_length(rm."keyPoints", 1) > 0
      AND NOT EXISTS (
        SELECT 1 FROM unnest(rm."keyPoints") kp
        WHERE kp ~ '[\\u0600-\\u06FF]'
      )
    ORDER BY r."numericId"::int
    """
    r = neon_query(sql)
    if not r.get('response') or not r['response'][0].get('data', {}).get('rows'):
        return []
    return r['response'][0]['data']['rows']


def fetch_text_for_ids(resource_ids):
    """Fetch OCR text for given resource IDs."""
    if not resource_ids:
        return {}
    ids_list = "'" + "','".join(resource_ids) + "'"
    sql = f"""
    SELECT rc."resourceId", rc."fullText"
    FROM "ResourceContent" rc
    WHERE rc."resourceId" IN ({ids_list})
    """
    r = neon_query(sql)
    out = {}
    for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
        rid, text = row
        out[rid] = text or ""
    return out


def save_to_staging(rid, nid, key_points, subject, model_name):
    """Save keyPoints + subject to ResourceMetadataStaging (do not touch live)."""
    if not key_points:
        return False
    # Escape PG array
    elements = []
    for k in key_points:
        if k is None: continue
        k_safe = str(k).replace("\\", "\\\\").replace('"', '\\"').replace("'", "''")
        elements.append(f'"{k_safe}"')
    kp_array = '{' + ','.join(elements) + '}'

    # Update or insert into staging
    sql = f"""
    UPDATE "ResourceMetadataStaging"
    SET "keyPoints" = '{kp_array}'::text[],
        "subject" = '{subject.replace(chr(39), chr(39)+chr(39)) if subject else ""}',
        "modelUsed" = '{model_name}',
        "extractedAt" = NOW(),
        "isApplied" = false
    WHERE "resourceId" = '{rid}'
    """
    try:
        r = neon_query(sql, role='neondb_owner', timeout=30)
        return not r.get('errors')
    except Exception as e:
        print(f"  Save error for #{nid}: {str(e)[:200]}")
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--limit', type=int, default=50)
    ap.add_argument('--workers', type=int, default=3)
    args = ap.parse_args()

    dry_run = not args.apply
    if dry_run and not args.dry_run:
        args.dry_run = True

    print(f'\n{"="*80}')
    print(f'{"DRY-RUN" if dry_run else "*** APPLY ***"}: Re-extract keyPoints in AR for 50 Physique collège docs')
    print(f'{"="*80}\n')

    targets = find_50_targets()
    print(f"Found {len(targets)} target docs")
    if not targets:
        return
    if args.limit:
        targets = targets[:args.limit]

    # Fetch OCR text
    print("Fetching OCR text...")
    rids = [t[0] for t in targets]
    texts = fetch_text_for_ids(rids)
    print(f"Got text for {len(texts)}/{len(rids)} resources")

    # Build args
    job_args = []
    for (rid, nid, title, class_slug, subject_slug) in targets:
        text = texts.get(rid, "")
        if not text:
            print(f"  #{nid}: no text, skip")
            continue
        job_args.append((rid, nid, title, class_slug, subject_slug, text, dry_run))

    print(f"\nProcessing {len(job_args)} jobs with {args.workers} workers...\n")

    results = []
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futures = {ex.submit(process_one, a): a for a in job_args}
        for f in as_completed(futures):
            r = f.result()
            results.append(r)
            status = r.get("status")
            if status == "OK":
                kps = r.get("keyPoints") or []
                has_ar = any('\u0600' <= c <= '\u06FF' or '\uFB50' <= c <= '\uFDFF' or '\uFE70' <= c <= '\uFEFF' for k in kps for c in k)
                print(f"  #{r['id']} OK ({r.get('kp_count', 0)} kp, AR={has_ar})")
            else:
                print(f"  #{r['id']} {status}: {r.get('error', '')}")

    # Summary
    print(f"\n{'='*80}")
    print(f"SUMMARY")
    print(f"{'='*80}")
    ok = [r for r in results if r.get("status") == "OK"]
    print(f"OK: {len(ok)}/{len(results)}")
    ar_count = sum(1 for r in ok if r.get("keyPoints") and any(
        '\u0600' <= c <= '\u06FF' or '\uFB50' <= c <= '\uFDFF' or '\uFE70' <= c <= '\uFEFF' for k in r["keyPoints"] for c in k
    ))
    print(f"With AR keyPoints: {ar_count}/{len(ok)}")
    print(f"Total new keyPoints: {sum(r.get('kp_count', 0) for r in ok)}")
    print(f"Cost (estimate): ~${len(ok) * 0.002:.2f}")

    if dry_run:
        print("\nDRY-RUN: not saved. Use --apply to write to staging.")
        return

    # Save to staging
    print(f"\nSaving {len(ok)} to ResourceMetadataStaging...")
    saved = 0
    for r in ok:
        kps = r.get("keyPoints")
        subject = r.get("subject")
        nid = r.get("id")
        # Find rid from job_args
        rid = next((a[0] for a in job_args if a[1] == nid), None)
        if not rid: continue
        if save_to_staging(rid, nid, kps, subject, "regen_keypoints_for_50"):
            saved += 1
    print(f"Saved: {saved}/{len(ok)}")


if __name__ == '__main__':
    main()
