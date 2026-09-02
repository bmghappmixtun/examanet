#!/usr/bin/env python3
"""
Fix the 50 Physique collège docs that have corrupted keyPoints
(character-by-character array due to $$...$$ escape bug).

Re-extracts AR keyPoints and applies directly to live ResourceMetadata.
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

# The 50 numericIds that were misdetected as French
TARGET_IDS = [
    454, 456, 461, 473, 477, 484, 487, 491, 497, 503, 508, 512, 514, 516, 518, 522, 526,
    781, 784, 785, 788, 789, 790, 791, 797, 851, 859, 863, 865, 866, 950, 953, 958, 959,
    1017, 1018, 1019, 1024, 1025, 1030, 1031, 1032, 1034, 1035, 1174, 1175, 1176, 1177, 1180, 1239
]


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


def process_one(args):
    """Re-extract keyPoints in AR for one resource."""
    rid, nid, text, dry_run = args
    text = text or ""
    if len(text) < 100:
        return {"id": nid, "status": "TEXT_TOO_SHORT", "len": len(text)}

    header = text[:1000].replace("\n", " ")
    body = text[:2000].replace("\n", " ")

    try:
        prompt = PROMPT_KEYPOINTS_AR.format(header=header, body=body)
        resp = call_ai(prompt, max_tokens=400)
        data = extract_json(resp)
        kps = data.get("keyPoints") if data else None
        return {
            "id": nid,
            "rid": rid,
            "status": "OK",
            "keyPoints": kps,
            "kp_count": len(kps) if kps else 0,
        }
    except Exception as e:
        return {"id": nid, "rid": rid, "status": "ERROR", "error": str(e)[:200]}


def fetch_resources():
    """Fetch the 50 resources with their OCR text."""
    ids_csv = ",".join(str(i) for i in TARGET_IDS)
    sql = f"""
    SELECT r.id, r."numericId", rc."fullText"
    FROM "Resource" r
    LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
    WHERE r."numericId" IN ({ids_csv})
    ORDER BY r."numericId"::int
    """
    r = neon_query(sql)
    return r.get('response', [{}])[0].get('data', {}).get('rows', [])


def apply_to_live(rid, nid, key_points):
    """Apply keyPoints directly to live ResourceMetadata."""
    if not key_points:
        return False
    elements = []
    for k in key_points:
        if k is None: continue
        k_safe = str(k).replace('\\', '\\\\').replace('"', '\\"').replace("'", "''")
        elements.append(f'"{k_safe}"')
    kp_array = '{' + ','.join(elements) + '}'
    sql = f"UPDATE \"ResourceMetadata\" SET \"keyPoints\" = '{kp_array}'::text[] WHERE \"resourceId\" = '{rid}'"
    result = neon_query(sql, role='neondb_owner', timeout=30)
    return not result.get('errors')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--workers', type=int, default=5)
    args = ap.parse_args()

    dry_run = not args.apply

    print(f'\n{"="*80}')
    print(f'{"DRY-RUN" if dry_run else "*** APPLY ***"}: Fix 50 corrupted Physique collège keyPoints')
    print(f'{"="*80}\n')

    print("Fetching 50 resources + OCR text...")
    resources = fetch_resources()
    print(f"Got {len(resources)} resources")

    job_args = [(rid, nid, text or "", dry_run) for (rid, nid, text) in resources]
    # Filter out entries with no/short text (a[2] is text, must be len >= 100)
    job_args = [a for a in job_args if len(a[2]) >= 100]

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
                has_ar = any('\u0600' <= c <= '\u06FF' for k in kps for c in k)
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
        '\u0600' <= c <= '\u06FF' for k in r["keyPoints"] for c in k
    ))
    print(f"With AR keyPoints: {ar_count}/{len(ok)}")
    print(f"Cost (estimate): ~${len(ok) * 0.002:.2f}")

    if dry_run:
        print("\nDRY-RUN: not applied. Use --apply to write to live.")
        return

    # Apply directly to live
    print(f"\nApplying {len(ok)} to live ResourceMetadata...")
    applied = 0
    for r in ok:
        if apply_to_live(r['rid'], r['id'], r['keyPoints']):
            applied += 1
    print(f"Applied: {applied}/{len(ok)}")


if __name__ == '__main__':
    main()
