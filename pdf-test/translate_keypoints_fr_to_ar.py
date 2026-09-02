#!/usr/bin/env python3
"""
Batch translate all FR keyPoints in live ResourceMetadata to AR.

For Math collège (1485 files), ~8163 FR items → AR.
- Pull all unique FR items (dedup)
- Batch translate via gpt-4o-mini (batches of 50)
- For each resource: replace FR with AR translations
- Keep existing AR items as-is

Snapshot before: snap-weathered-tree-asdb0res
"""
import os, json, re, urllib.request, time
from openai import OpenAI

def q(sql):
    body = {'db_name': 'neondb', 'role_name': 'neondb_owner', 'query': sql, 'branch_id': 'br-purple-recipe-as2x8yyo'}
    req = urllib.request.Request(
        'https://console.neon.tech/api/v2/projects/little-silence-94324724/query',
        data=json.dumps(body).encode(),
        headers={'Authorization': f'Bearer {os.environ["NEON_API_KEY"]}', 'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def parse_pg_array(s):
    if not s: return []
    s = s.strip()
    if not s.startswith('{'): return []
    if not s.endswith('}'): return []
    inner = s[1:-1]
    items, current, in_quote, escaped = [], '', False, False
    for c in inner:
        if escaped:
            current += c
            escaped = False
            continue
        if c == '\\' and in_quote:
            current += c
            escaped = True
            continue
        if c == '"': in_quote = not in_quote
        elif c == ',' and not in_quote:
            if current.strip(): items.append(current.strip())
            current = ''
        else: current += c
    if current.strip(): items.append(current.strip())
    return items


def is_arabic(s):
    return any('\u0600' <= c <= '\u06FF' for c in (s or ''))


def translate_batch(client, items: list[str]) -> dict[str, str]:
    """Translate a batch of FR items to AR. Returns fr → ar dict."""
    if not items:
        return {}
    # Number the items so we can parse the response
    numbered = '\n'.join(f'{i+1}. {it}' for i, it in enumerate(items))
    prompt = f"""Translate each numbered item from French to Arabic. The items are math/education key concepts.
Output ONLY the translations, in the same numbered format (one per line), nothing else.
Keep the translations SHORT (1-4 Arabic words), concise like a UI badge.

Items:
{numbered}

Translations (numbered):"""

    resp = client.responses.create(
        model='gpt-4o-mini',
        input=prompt,
        temperature=0.1,
    )
    output_text = resp.output_text.strip()

    # Parse the numbered response
    out = {}
    for line in output_text.split('\n'):
        line = line.strip()
        if not line: continue
        m = re.match(r'^(\d+)[\.\)]\s*(.+)$', line)
        if m:
            idx = int(m.group(1)) - 1
            ar_text = m.group(2).strip()
            if 0 <= idx < len(items):
                out[items[idx]] = ar_text
    return out


def main():
    client = OpenAI()
    print('═══ Batch translate FR keyPoints → AR ═══\n')

    # 1. Pull all keyPoints from Math collège
    print('Step 1: Pulling all keyPoints from Math collège...')
    res = q("""
    SELECT r.id, rm."keyPoints"::text
    FROM "ResourceMetadata" rm
    JOIN "Resource" r ON r.id = rm."resourceId"
    JOIN "Subject" s ON r."subjectId" = s.id
    WHERE s.slug = 'mathematiques'
      AND r."classId" IN (SELECT id FROM "Class" WHERE slug IN ('7eme','8eme','9eme'))
      AND rm."keyPoints" IS NOT NULL
    """)
    rows = res.get('response', [{}])[0].get('data', {}).get('rows', [])
    print(f'  Got {len(rows)} resources with keyPoints')

    # 2. Extract unique FR items
    print('Step 2: Extracting unique FR items (deduplication)...')
    fr_unique = set()
    fr_to_resources = {}  # fr → list of resource IDs
    for rid, kp_str in rows:
        items = parse_pg_array(kp_str)
        for it in items:
            if not is_arabic(it) and any(c.isalpha() and ord(c) < 128 for c in it):
                fr_unique.add(it)
                fr_to_resources.setdefault(it, []).append(rid)

    fr_unique_list = sorted(fr_unique)
    print(f'  Unique FR items to translate: {len(fr_unique_list)}')
    print(f'  Total FR item occurrences in DB: {sum(len(v) for v in fr_to_resources.values())}')

    # 3. Batch translate
    print('\nStep 3: Translating via gpt-4o-mini (batches of 50)...')
    fr_to_ar = {}
    BATCH = 50
    start = time.time()
    for i in range(0, len(fr_unique_list), BATCH):
        batch = fr_unique_list[i:i+BATCH]
        try:
            out = translate_batch(client, batch)
            fr_to_ar.update(out)
            elapsed = time.time() - start
            print(f'  {i+len(batch)}/{len(fr_unique_list)} translated in {elapsed:.1f}s')
        except Exception as e:
            print(f'  Batch {i}: ERROR: {e}')

    print(f'\n  Translated: {len(fr_to_ar)}/{len(fr_unique_list)}')
    print(f'  Total time: {time.time()-start:.1f}s')

    # Save mapping for inspection
    with open('/tmp/fr_to_ar.json', 'w', encoding='utf-8') as f:
        json.dump(fr_to_ar, f, ensure_ascii=False, indent=2)
    print(f'  Mapping saved to /tmp/fr_to_ar.json')

    # 4. Update resources: replace FR with AR
    print('\nStep 4: Updating live resources...')
    updated = 0
    errors = 0
    start = time.time()
    for idx, (rid, kp_str) in enumerate(rows):
        items = parse_pg_array(kp_str)
        new_items = []
        for it in items:
            if is_arabic(it):
                # Keep AR as-is
                new_items.append(it)
            elif it in fr_to_ar:
                # Replace with translation
                ar = fr_to_ar[it]
                # Avoid duplicates
                if ar not in new_items:
                    new_items.append(ar)
                else:
                    # Skip duplicate, keep first occurrence
                    pass
            else:
                # No translation (shouldn't happen), skip
                pass

        if not new_items:
            continue
        if new_items == items:
            continue  # No change

        # Build UPDATE
        arr_str = '{' + ','.join(f'"{s.replace(chr(34), chr(34)+chr(34))}"' for s in new_items) + '}'
        # Escape single quotes in items (they should be in AR so no apostrophes usually, but safety)
        # Actually array elements are double-quoted, so single quotes are safe
        sql = f"""UPDATE "ResourceMetadata" SET "keyPoints" = '{arr_str}'::text[] WHERE "resourceId" = '{rid}';"""

        try:
            q(sql)
            updated += 1
        except Exception as e:
            errors += 1
            if errors < 3:
                print(f'  Error #{idx} rid={rid}: {str(e)[:200]}')

    print(f'\n  Updated: {updated}/{len(rows)} resources')
    print(f'  Errors: {errors}')
    print(f'  Time: {time.time()-start:.1f}s')

    # 5. Verify
    print('\nStep 5: Verifying AR coverage...')
    res = q("""
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE rm."keyPoints" IS NOT NULL AND array_length(rm."keyPoints", 1) > 0) as has_kp,
      COUNT(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM unnest(rm."keyPoints") AS kp WHERE NOT (kp ~ '[\\u0600-\\u06FF]')
      )) as all_ar
    FROM "ResourceMetadata" rm
    JOIN "Resource" r ON r.id = rm."resourceId"
    JOIN "Subject" s ON r."subjectId" = s.id
    WHERE s.slug = 'mathematiques'
      AND r."classId" IN (SELECT id FROM "Class" WHERE slug IN ('7eme','8eme','9eme'))
    """)
    for row in res.get('response', [{}])[0].get('data', {}).get('rows', []):
        total, has_kp, all_ar = row
        print(f'  Total: {total}  with kp: {has_kp}  100% AR: {all_ar} ({100*int(all_ar)/int(has_kp):.1f}%)')


if __name__ == '__main__':
    main()
