import os, json, urllib.request
def q(sql):
    body = {'db_name': 'neondb', 'role_name': 'neondb_owner', 'query': sql, 'branch_id': 'br-purple-recipe-as2x8yyo'}
    req = urllib.request.Request('https://console.neon.tech/api/v2/projects/little-silence-94324724/query', data=json.dumps(body).encode(), headers={'Authorization': f'Bearer {os.environ["NEON_API_KEY"]}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=10) as r: return json.loads(r.read())
res = q("""SELECT COUNT(*) FILTER (WHERE rm."keyPoints" IS NOT NULL AND array_length(rm."keyPoints", 1) > 0) as has_kp FROM "ResourceMetadata" rm JOIN "Resource" r ON r.id = rm."resourceId" JOIN "Subject" s ON r."subjectId" = s.id WHERE s.slug = 'mathematiques' AND r."classId" IN (SELECT id FROM "Class" WHERE slug IN ('7eme','8eme','9eme'))""")
print(res.get('response', [{}])[0].get('data', {}).get('rows', []))
