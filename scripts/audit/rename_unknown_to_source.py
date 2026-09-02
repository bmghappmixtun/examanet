#!/usr/bin/env python3
"""
Rename the 'مجهول' (Unknown) placeholder teacher to 'TunisieCollège'
to indicate these PDFs came from tunisiecollege.net without an
identifiable teacher in the title or PDF header.

Also sets bio, isVerifiedTeacher=true so it shows on /professeurs.
"""

import os, sys, subprocess, asyncio, asyncpg

# Auto-install
for m, p in {'asyncpg': 'asyncpg', 'psycopg2': 'psycopg2-binary'}.items():
    try: __import__(m)
    except ImportError: subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', '--break-system-packages', p])

for env_file in ['/workspace/edutunisie/.env.local', '/workspace/edutunisie/.env']:
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line: continue
                k, v = line.split('=', 1); os.environ.setdefault(k, v.strip('"').strip("'"))


async def main():
    conn = await asyncpg.connect(os.environ['DATABASE_URL'].replace('?schema=public', ''))
    
    # Find the مجهول placeholder
    rows = await conn.fetch('''
        SELECT id, "firstName", "lastName", "firstNameAr", "lastNameAr"
        FROM "User"
        WHERE ("firstName" = 'مجهول' OR "firstName" = 'Unknown')
          AND email LIKE 'import.%'
    ''')
    
    print(f"📊 {len(rows)} placeholder(s) to rename")
    
    for r in rows:
        old_name = f"{r[1]} {r[2]}"
        print(f"   {r[0]}: '{old_name}' → 'TunisieCollège (source originale)'")
        
        await conn.execute('''
            UPDATE "User" 
            SET "firstName" = $1, "lastName" = $2,
                "firstNameAr" = $3, "lastNameAr" = $4,
                status = 'ACTIVE',
                "isVerifiedTeacher" = true,
                bio = COALESCE(bio, 'Source originale de TunisieCollège.net - ressources sans prof identifié'),
                "updatedAt" = NOW()
            WHERE id = $5
        ''',
        'TunisieCollège', '(source originale)',
        'TunisieCollège', '(المصدر الأصلي)',
        r[0])
    
    print(f"\n✅ Done")
    
    # Verify
    for r in rows:
        new = await conn.fetchrow('''
            SELECT "firstName", "lastName", status, "isVerifiedTeacher", bio
            FROM "User" WHERE id = $1
        ''', r[0])
        count = await conn.fetchval('SELECT COUNT(*) FROM "Resource" WHERE "teacherId" = $1', r[0])
        print(f"   {r[0]}: {new[0]} {new[1]} ({new[2]}, verified={new[3]}, {count} resources)")
    
    await conn.close()


asyncio.run(main())
