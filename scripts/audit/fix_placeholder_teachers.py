#!/usr/bin/env python3
"""
Reassign resources from "Unknown Unknown" placeholder teacher.

For each resource currently assigned to the Unknown placeholder:
1. If headerData.teacher is set, find/create matching placeholder and reassign
2. Otherwise, keep on Unknown (legitimately no teacher info)

Also: rename the Unknown placeholder to "مجهول" for better display.
"""

import os, sys, subprocess, re, json, asyncio, asyncpg, uuid

# Auto-install
for m, p in {'asyncpg': 'asyncpg', 'psycopg2': 'psycopg2-binary'}.items():
    try: __import__(m)
    except ImportError: subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', '--break-system-packages', p])

# Load env
for env_file in ['/workspace/edutunisie/.env.local', '/workspace/edutunisie/.env']:
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                k, v = line.split('=', 1)
                os.environ.setdefault(k, v.strip('"').strip("'"))

DB_URL = os.environ['DATABASE_URL'].replace('?schema=public', '')


def normalize_name(name: str) -> tuple:
    """Strip titles, return (firstname, lastname)."""
    n = name.strip()
    for prefix in ['الأستاذ ', 'الأستاذة ', 'الاستاذ ', 'الاستاذة ', 'أستاذ ', 'أستاذة ',
                   'Mr ', 'Mme ', 'Mlle ', 'Mrs ', 'Mr. ', 'Mme. ', 'M. ']:
        if n.startswith(prefix):
            n = n[len(prefix):]
    n = n.rstrip(',.;:').strip()
    parts = n.split()
    if not parts:
        return ('Unknown', 'Unknown')
    if len(parts) == 1:
        return (parts[0], 'Unknown')
    return (parts[0], ' '.join(parts[1:]))


def generate_email(firstname: str, lastname: str) -> str:
    return f"import.{firstname.lower()}.{lastname.lower().replace(' ', '')}@examanet-import.local"


async def find_or_create_placeholder(conn, teacher_name: str):
    first, last = normalize_name(teacher_name)
    if first == 'Unknown' and last == 'Unknown':
        return None
    
    # Exact match
    row = await conn.fetchrow('''
        SELECT id FROM "User"
        WHERE LOWER("firstName") = LOWER($1) AND LOWER("lastName") = LOWER($2)
          AND email LIKE 'import.%'
        LIMIT 1
    ''', first, last)
    if row: return row[0]
    
    # Just first name match
    if last == 'Unknown':
        row = await conn.fetchrow('''
            SELECT id FROM "User"
            WHERE LOWER("firstName") = LOWER($1) AND email LIKE 'import.%'
            LIMIT 1
        ''', first)
        if row: return row[0]
    
    # Create new
    email = generate_email(first, last)
    base_email = email
    counter = 1
    while await conn.fetchval('SELECT 1 FROM "User" WHERE email = $1', email):
        email = base_email.replace('@examanet-import.local', f'-{counter}@examanet-import.local')
        counter += 1
    
    user_id = f"cmq{uuid.uuid4().hex[:22]}"
    await conn.execute('''
        INSERT INTO "User" (id, "firstName", "lastName", email, role, "firstNameAr", "lastNameAr", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, 'TEACHER', $5, $6, NOW(), NOW())
    ''', user_id, first, last, email, first, last)
    return user_id


async def main():
    conn = await asyncpg.connect(DB_URL)
    
    UNKNOWN_ID = 'cmqwnim9l000d106jknf7uu3b'
    
    # 1. Reassign resources with real teacher name
    print("=" * 70)
    print("📊 Step 1: Reassign resources with real teacher to proper placeholder")
    print("=" * 70)
    
    resources = await conn.fetch('''
        SELECT id, "headerData"->>'teacher' as real_teacher, title
        FROM "Resource"
        WHERE "teacherId" = $1
    ''', UNKNOWN_ID)
    
    print(f"   Total: {len(resources)}")
    
    reassigned = 0
    skipped = 0
    created_new = 0
    created_teacher_names = []
    
    for r in resources:
        rid = str(r[0])
        real_teacher = r[1]
        title = (r[2] or '')[:50]
        
        if not real_teacher or real_teacher.strip() in ['', 'null', 'None']:
            skipped += 1
            continue
        
        new_teacher_id = await find_or_create_placeholder(conn, real_teacher)
        if not new_teacher_id or new_teacher_id == UNKNOWN_ID:
            skipped += 1
            continue
        
        await conn.execute(
            'UPDATE "Resource" SET "teacherId" = $1 WHERE id = $2',
            new_teacher_id, rid
        )
        reassigned += 1
        
        # Track if this was a newly created placeholder
        first, last = normalize_name(real_teacher)
        exists = await conn.fetchval('''
            SELECT 1 FROM "User" WHERE id = $1
        ''', new_teacher_id)
        # Check if this was the first time we created it
        # (approximation: count of resources for this teacher > 0)
        count = await conn.fetchval('SELECT COUNT(*) FROM "Resource" WHERE "teacherId" = $1', new_teacher_id)
        if count == 1:  # Just this one resource
            created_new += 1
            created_teacher_names.append(f"   + {first} {last}")
    
    print(f"   Reassigned: {reassigned}")
    print(f"   Skipped (no teacher info): {skipped}")
    print(f"   New placeholders created: {created_new}")
    
    # 2. Rename the placeholder to a friendly name
    print(f"\n{'='*70}")
    print("📊 Step 2: Rename Unknown placeholder to مجهول (Unknown in Arabic)")
    print("=" * 70)
    
    remaining = await conn.fetchval('SELECT COUNT(*) FROM "Resource" WHERE "teacherId" = $1', UNKNOWN_ID)
    print(f"   Remaining resources on Unknown placeholder: {remaining}")
    
    # Check if user still exists
    user_exists = await conn.fetchval('SELECT 1 FROM "User" WHERE id = $1', UNKNOWN_ID)
    if user_exists:
        await conn.execute('''
            UPDATE "User" 
            SET "firstName" = $1, "lastName" = $2, 
                "firstNameAr" = $3, "lastNameAr" = $4,
                "updatedAt" = NOW()
            WHERE id = $5
        ''', 'مجهول', '(sans nom)', 'مجهول', '(sans nom)', UNKNOWN_ID)
        print(f"   ✅ Renamed to 'مجهول (sans nom)'")
    
    # Final stats
    print(f"\n{'='*70}")
    print("📊 Final stats")
    print("=" * 70)
    
    final_count = await conn.fetchval('SELECT COUNT(*) FROM "Resource" WHERE "teacherId" = $1', UNKNOWN_ID)
    print(f"   Resources on placeholder: {final_count}")
    print(f"   (these are truly unidentifiable - no teacher in title or PDF)")
    
    # Total placeholder users
    placeholder_count = await conn.fetchval("SELECT COUNT(*) FROM \"User\" WHERE email LIKE 'import.%'")
    print(f"   Total import.* placeholder users: {placeholder_count}")
    
    await conn.close()


asyncio.run(main())
