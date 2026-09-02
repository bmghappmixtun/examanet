#!/usr/bin/env python3
"""
Apply staging.keyPoints + staging.subject (as topics) to live ResourceMetadata.

The orchestrator v4 generated keyPoints for ALL 1485 Math collège files,
but we only ever applied the metadata fields (schoolName, year, teacherNameAr).
The keyPoints and topics stayed in staging and were never applied to live.

This script closes that gap. PRUDENT MODE by default:
  - keyPoints: only update if live is empty/NULL (preserves the 119 existing)
  - topics:    only update if live is empty/NULL

For the 119 existing live keyPoints, the new staging value is actually MORE
detailed (e.g., 6 specific items vs 3 generic ones). We could force-override
with --force, but by default we keep the existing data.

Snapshot before: snap-steep-poetry-as61zue9 (2026-08-01 13:24:54)
"""
import os, json, re, sys, argparse, urllib.request

NEON_API_KEY = os.environ.get('NEON_API_KEY', '')
NEON_PROJECT = 'little-silence-94324724'
BRANCH_ID = 'br-purple-recipe-as2x8yyo'
ROLE = 'edutunisie_app'

def neon_query(sql):
    body = {'db_name': 'neondb', 'role_name': ROLE, 'query': sql, 'branch_id': BRANCH_ID}
    req = urllib.request.Request(
        f'https://console.neon.tech/api/v2/projects/{NEON_PROJECT}/query',
        data=json.dumps(body).encode(),
        headers={'Authorization': f'Bearer {NEON_API_KEY}', 'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=20)
    ap.add_argument('--offset', type=int, default=0)
    ap.add_argument('--class', dest='class_filter')
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--force', action='store_true',
                    help='Force-override live values (use staging even if live is set)')
    args = ap.parse_args()

    dry_run = not args.apply
    class_filter = ''
    if args.class_filter:
        class_filter = f"AND c.slug = '{args.class_filter}'"

    # Get staging + live data
    sql = f"""
    SELECT
      rms.id as staging_id,
      r.id as resource_id,
      r."numericId",
      r.title,
      c.slug as class_slug,
      rm.id as live_meta_id,
      rm."keyPoints"::text as live_kp,
      rm.topics::text as live_topics,
      rms."keyPoints"::text as staging_kp,
      rms.subject as staging_subject
    FROM "ResourceMetadataStaging" rms
    JOIN "Resource" r ON r.id = rms."resourceId"
    JOIN "Subject" s ON r."subjectId" = s.id
    JOIN "Class" c ON r."classId" = c.id
    LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
    WHERE s.slug = 'mathematiques' AND c.slug IN ('7eme','8eme','9eme')
      {class_filter}
    ORDER BY r."numericId"
    LIMIT {args.limit} OFFSET {args.offset}
    """
    result = neon_query(sql)
    rows = result.get('response', [{}])[0].get('data', {}).get('rows', [])
    if not rows:
        print('No records found.')
        return

    print(f'\n{"="*80}')
    print(f'{"DRY-RUN" if dry_run else "*** APPLY ***"}: {len(rows)} Math collège resources')
    print(f'Mode: {"FORCE" if args.force else "PRUDENT (only fill empty live)"}')
    print(f'{"="*80}\n')

    changes = []
    unchanged = 0
    skipped_kp = 0
    skipped_topics = 0

    for row in rows:
        (staging_id, rid, nid, title, class_slug,
         live_meta_id, live_kp, live_topics, staging_kp, staging_subject) = row

        updates = {}

        # Normalize for dedup (lowercase + strip whitespace)
        def normalize(s):
            return re.sub(r'\s+', ' ', s.lower().strip()) if s else ''

        # 1. keyPoints: MERGE old + new (dedup, preserve order: old first then new)
        # Per user rule (2026-08-01): "on garde les anciens aussi, on affiche les
        # anciens + les nouveaux" — both old and new key points are useful
        # (old = generic, new = specific, complementary).
        staging_kp_list = parse_pg_array(staging_kp) if staging_kp else []
        live_kp_list = parse_pg_array(live_kp) if live_kp else []

        if staging_kp_list or live_kp_list:
            seen = set()
            merged = []
            # Old first (in their original order)
            for kp in live_kp_list:
                k = normalize(kp)
                if k and k not in seen:
                    seen.add(k)
                    merged.append(kp)
            # Then new (skip duplicates of old)
            for kp in staging_kp_list:
                k = normalize(kp)
                if k and k not in seen:
                    seen.add(k)
                    merged.append(kp)
            # Only update if the merged list is different from current live
            if merged != live_kp_list:
                updates['keyPoints'] = merged
            else:
                skipped_kp += 1
        elif staging_kp_list and not live_kp_list:
            updates['keyPoints'] = staging_kp_list

        # 2. topics: MERGE old topics + new staging.subject (dedup)
        if staging_subject and staging_subject.strip():
            staging_topic = staging_subject.strip()
            live_topics_list = parse_pg_array(live_topics) if live_topics else []
            seen = set()
            merged_topics = []
            for t in live_topics_list:
                k = normalize(t)
                if k and k not in seen:
                    seen.add(k)
                    merged_topics.append(t)
            k = normalize(staging_topic)
            if k and k not in seen:
                seen.add(k)
                merged_topics.append(staging_topic)
            if merged_topics != live_topics_list:
                updates['topics'] = merged_topics
            elif merged_topics:
                skipped_topics += 1

        # Display
        print(f'━━━ #{nid} ({class_slug}) ━━━')
        print(f'  Title:  {(title or "")[:70]}')
        if updates:
            for field, val in updates.items():
                if field == 'keyPoints':
                    print(f'  ✏️  {field}:')
                    for v in val:
                        print(f'        • {v}')
                else:
                    print(f'  ✏️  {field}: {val}')
            changes.append((rid, live_meta_id, updates))
        else:
            unchanged += 1
            if not live_meta_id:
                print(f'  ⚠️  No live ResourceMetadata row exists!')
            else:
                print(f'  ✓ No change needed')

        # Show skipped
        skip_reasons = []
        if staging_kp_list and live_kp_list and not args.force and not updates.get('keyPoints'):
            skip_reasons.append(f'keyPoints: live has {len(live_kp_list)} items already')
        if staging_subject and parse_pg_array(live_topics) and not args.force and not updates.get('topics'):
            skip_reasons.append(f'topics: live has {len(parse_pg_array(live_topics))} items already')
        if skip_reasons:
            print(f'  ⏭️  Skipped: {"; ".join(skip_reasons)} (use --force to override)')
        print()

    print(f'\n{"="*80}')
    print(f'SUMMARY')
    print(f'{"="*80}')
    print(f'  Resources processed:     {len(rows)}')
    print(f'  Would change:            {len(changes)}')
    print(f'  Unchanged:               {unchanged}')
    print(f'  Skipped (live non-empty): {skipped_kp} keyPoints, {skipped_topics} topics')
    print(f'  Errors:                  0')

    if dry_run:
        print(f'\n  → Run with --apply to write to live DB')
        if skipped_kp + skipped_topics > 0:
            print(f'  → Use --force to override existing live values')
    else:
        print(f'\n  Writing to live DB...')
        ok = 0
        err = 0
        for rid, meta_id, updates in changes:
            # Ensure ResourceMetadata row exists
            if not meta_id:
                # Create the row
                create_sql = f"INSERT INTO \"ResourceMetadata\" (id, \"resourceId\") VALUES (gen_random_uuid()::text, '{rid}');"
                try:
                    neon_query(create_sql)
                    # Re-fetch the new id
                    res = neon_query(f"SELECT id FROM \"ResourceMetadata\" WHERE \"resourceId\" = '{rid}';")
                    meta_id = res.get('response', [{}])[0].get('data', {}).get('rows', [])[0][0]
                except Exception as e:
                    print(f'  ❌ #{rid[:8]} create error: {e}')
                    err += 1
                    continue

            # Build UPDATE
            set_parts = []
            for k, v in updates.items():
                arr_str = '{' + ','.join(f'"{s.replace(chr(34), chr(34)+chr(34))}"' for s in v) + '}'
                set_parts.append(f'"{k}" = \'{arr_str}\'::text[]')
            set_clause = ', '.join(set_parts)
            update_sql = f'UPDATE "ResourceMetadata" SET {set_clause} WHERE id = \'{meta_id}\''
            try:
                neon_query(update_sql)
                ok += 1
            except Exception as e:
                print(f'  ❌ #{rid[:8]} update error: {e}')
                err += 1
        print(f'\n  Done! Updated {ok}, errors {err}')


def parse_pg_array(s):
    """Parse PostgreSQL array literal: {item1,item2,"item with space"}"""
    if not s: return []
    s = s.strip()
    if not s.startswith('{') or not s.endswith('}'): return []
    inner = s[1:-1]
    items = []
    current = ''
    in_quote = False
    escaped = False
    for c in inner:
        if escaped:
            current += c
            escaped = False
            continue
        if c == '\\' and in_quote:
            current += c
            escaped = True
            continue
        if c == '"':
            in_quote = not in_quote
            continue
        if c == ',' and not in_quote:
            if current.strip():
                items.append(current.strip())
            current = ''
        else:
            current += c
    if current.strip():
        items.append(current.strip())
    return items


if __name__ == '__main__':
    main()
