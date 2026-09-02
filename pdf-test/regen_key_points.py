#!/usr/bin/env python3
"""
Regenerate ResourceMetadata.keyPoints as 2-3 word Arabic labels.

Per user rule (2026-07-30): the existing keyPoints are full sentences
(e.g. "تناول هذا الدرس كيفية رسم المسقط الأفقي") which look ugly
as rounded bubbles. This script regenerates them as 2-3 word AR tags
(e.g. "المسقط الأفقي") suitable for the new bubble display.

Reads each Technologie resource's:
  - ResourceContent.fullText (OCR'd PDF text)
  - ResourceMetadata.generalSubject (الموضوع العام)
  - ResourceMetadata.systemName (اسم المنتج / اسم النظام)
  - Resource.title (for context)

Calls GPT-4o-mini to produce 3-5 short AR key concepts (2-3 words each).
Writes to ResourceMetadata.keyPoints.

Run with: source pdf-test/venv/bin/activate && python3 pdf-test/regen_key_points.py

Options:
  --subject technologie   # filter to one subject (default: all)
  --limit 50             # process only N resources
  --dry-run              # don't write, just show what would be generated
"""
import os, sys, json, time, argparse, re
import importlib.util

# bulk_math_v5 needs openai/fitz/PIL stubs so it can be imported without those libs
import types
sys.modules.setdefault('openai', types.ModuleType('openai'))
sys.modules['openai'].OpenAI = lambda: None
sys.modules.setdefault('fitz', types.ModuleType('fitz'))
sys.modules.setdefault('PIL', types.ModuleType('PIL'))
sys.modules['PIL'].Image = types.ModuleType('Image')

# Now load bulk_math_v5 (for DB helpers)
spec = importlib.util.spec_from_file_location('m', os.path.join(os.path.dirname(__file__), 'bulk_math_v5.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

# Now reload the REAL openai (we want to use the actual OpenAI client, not the stub)
import importlib
if 'openai' in sys.modules:
    del sys.modules['openai']
from openai import OpenAI

# Load OpenAI key
api_key = os.environ.get('OPENAI_API_KEY') or open('/workspace/edutunisie/.env.local').read().split('OPENAI_API_KEY=')[1].split('\n')[0].strip('"')
client = OpenAI(api_key=api_key)

PROGRESS_FILE = '/tmp/regen_kp_progress.json'


def load_progress():
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            return json.load(f)
    return {'done': [], 'ok': [], 'errors': {}, 'skipped': []}


def save_progress(p):
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(p, f, ensure_ascii=False, indent=2)


def is_arabic(s: str) -> bool:
    if not s:
        return False
    arabic = sum(1 for c in s if '\u0600' <= c <= '\u06FF')
    return arabic > 0


def has_fulltext(rid: str) -> tuple[bool, str]:
    r = m.neon_query(
        f'SELECT "fullText" FROM "ResourceContent" WHERE "resourceId" = \'{rid}\' LIMIT 1'
    )
    rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
    if rows and rows[0][0]:
        return True, rows[0][0]
    return False, ''


def gen_key_points(rid: str, title: str, general_subject: str, system_name: str, full_text: str) -> list[str]:
    """Call GPT-4o-mini to generate 3-5 short AR key concepts (2-3 words each)."""
    # Truncate the full text to avoid blowing up the context window
    text_sample = full_text[:2500] if full_text else ''

    prompt = f"""You are generating "key points" (النقاط الرئيسية) for a Tunisian college Technologie resource.

The user wants SHORT tags (2-3 words each) — NOT full sentences. These will be displayed as rounded colored bubbles, so each tag must be very concise.

Context:
- Resource title: {title}
- General subject (الموضوع العام): {general_subject or '?'}
- System/product name (اسم النظام / اسم المنتج): {system_name or '?'}
- PDF text sample (first 2500 chars):
{text_sample}

Generate exactly 3 to 5 key concepts. Each MUST be:
- In ARABIC (always)
- 2-3 words maximum (no longer)
- A core concept from the document (not a description or action)
- A noun phrase or technical term (e.g. "المسقط الأفقي", "الحماية الكهربائية", "دارة التحكم")

BAD examples (too long, sentences):
- "تناول هذا الدرس كيفية رسم المسقط الأفقي" (a sentence)
- "في هذا الجزء يتم التعرف على الدارة الكهربائية" (a sentence)
- "الهدف من الدرس هو فهم..." (a sentence)

GOOD examples (short tags):
- "المسقط الأفقي"
- "الحماية الكهربائية"
- "دارة التحكم"
- "القطع ثلاثي الأبعاد"
- "المخطط الوظيفي"

Return ONLY a JSON array of strings (no other text, no markdown):
["tag1", "tag2", "tag3"]"""

    resp = client.chat.completions.create(
        model='gpt-4o-mini',
        messages=[{'role': 'user', 'content': prompt}],
        temperature=0.3,
        response_format={'type': 'json_object'},
    )
    result = json.loads(resp.choices[0].message.content)
    # GPT sometimes returns an array, sometimes a dict with array values,
    # sometimes a dict where keys themselves are the tags (e.g. {"tag1": "tag1"}).
    # Handle all cases.
    tags: list[str] = []
    if isinstance(result, list):
        tags = result
    elif isinstance(result, dict):
        # Try array values first
        for v in result.values():
            if isinstance(v, list):
                tags = v
                break
        # Fallback: dict with string values (keys ARE the tags)
        if not tags and all(isinstance(v, str) for v in result.values()):
            tags = list(result.keys())
    # Clean: keep only AR, 2-3 words, no punctuation
    cleaned = []
    for t in tags:
        t = str(t).strip()
        if not t:
            continue
        # Skip non-AR (shouldn't happen, but safety)
        if not is_arabic(t):
            continue
        # Word count check (Arabic words are space-separated)
        words = t.split()
        if len(words) > 3:
            # Truncate to first 3 words
            t = ' '.join(words[:3])
        # Remove common punctuation
        t = t.rstrip('.,;:!?،؛')
        cleaned.append(t)
    return cleaned[:5]  # max 5


def update_keypoints(rid: str, new_points: list[str]) -> bool:
    """Update ResourceMetadata.keyPoints via Neon HTTP (PostgreSQL text[])."""
    # PostgreSQL text array literal: '{"a", "b", "c"}'
    # The whole array is wrapped in single quotes; inner strings are double-quoted.
    # Escape backslashes and double-quotes inside each string.
    def escape(s: str) -> str:
        return s.replace('\\', '\\\\').replace('"', '\\"').replace("'", "\\'")
    inner = ', '.join(f'"{escape(p)}"' for p in new_points)
    arr_lit = f"'{{{inner}}}'"  # '{"a", "b", "c"}'
    sql = f'''UPDATE "ResourceMetadata"
              SET "keyPoints" = {arr_lit}::text[],
                  "extractedAt" = NOW()
              WHERE "resourceId" = '{rid}\''''
    r = m.neon_query(sql)
    # Check for errors
    if isinstance(r, dict) and r.get('error'):
        print(f"  DB err: {r.get('error')[:200]}")
        return False
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--subject', default=None, help='slug like technologie')
    parser.add_argument('--limit', type=int, default=0, help='max resources (0=all)')
    parser.add_argument('--dry-run', action='store_true', help="don't write to DB")
    parser.add_argument('--ids', default='', help='comma-separated numeric IDs to process')
    args = parser.parse_args()

    # Build query
    where = ['r.status = \'PUBLISHED\'']
    if args.subject:
        where.append(f's.slug = \'{args.subject}\'')
    if args.ids:
        nids = [n.strip() for n in args.ids.split(',') if n.strip()]
        where.append(f'r."numericId" IN ({",".join(nids)})')
    where_clause = ' AND '.join(where)

    sql = f'''SELECT r.id, r."numericId", r.title, rm."generalSubject", rm."systemName"
             FROM "Resource" r
             LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
             JOIN "Subject" s ON s.id = r."subjectId"
             WHERE {where_clause}
             ORDER BY r."numericId"'''
    r = m.neon_query(sql)
    targets = r.get('response', [{}])[0].get('data', {}).get('rows', [])
    print(f'Total targets: {len(targets)}')

    if args.limit > 0:
        targets = targets[:args.limit]

    progress = load_progress()
    done_set = set(progress['done'])
    todo = [t for t in targets if t[1] not in done_set]
    print(f'Already done: {len(done_set)}, remaining: {len(todo)}')

    success = 0
    skipped = 0
    errors = 0
    total_cost = 0.0
    t_start = time.time()

    for i, (rid, nid, title, gs, sys_name) in enumerate(todo):
        print(f'\n[{i+1}/{len(todo)}] #{nid}: {title[:60]}')
        # Skip if no fullText (no point asking GPT to hallucinate)
        has_text, full_text = has_fulltext(rid)
        if not has_text:
            print('  SKIP (no fullText)')
            progress['skipped'].append({'nid': str(nid), 'reason': 'no_fullText'})
            progress['done'].append(nid)
            save_progress(progress)
            skipped += 1
            continue

        try:
            new_points = gen_keypoints_with_calc = gen_key_points(rid, title, gs or '', sys_name or '', full_text)
        except Exception as e:
            print(f'  GPT err: {str(e)[:200]}')
            progress['errors'][str(nid)] = f'gpt:{str(e)[:200]}'
            progress['done'].append(nid)
            save_progress(progress)
            errors += 1
            continue

        if not new_points:
            print('  SKIP (no AR tags generated)')
            progress['skipped'].append({'nid': str(nid), 'reason': 'no_ar_tags'})
            progress['done'].append(nid)
            save_progress(progress)
            skipped += 1
            continue

        print(f'  Generated: {new_points}')

        if args.dry_run:
            print('  DRY RUN — not writing')
        else:
            ok = update_keypoints(rid, new_points)
            if ok:
                progress['ok'].append({'nid': str(nid), 'points': new_points})
                success += 1
            else:
                print('  DB update failed')
                progress['errors'][str(nid)] = 'db_update_failed'
                errors += 1
        progress['done'].append(nid)
        save_progress(progress)

        # Cost estimate: ~$0.001-0.002 per call
        total_cost += 0.0015
        # Rate limit
        time.sleep(0.2)

    elapsed = time.time() - t_start
    print(f'\n=== Done ===')
    print(f'Success: {success}, Skipped: {skipped}, Errors: {errors}')
    print(f'Elapsed: {elapsed:.0f}s, est cost: ${total_cost:.2f}')


if __name__ == '__main__':
    main()
