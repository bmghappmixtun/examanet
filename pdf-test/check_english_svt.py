"""Check resources classified as SVT but with English content"""
import sys
sys.path.insert(0, '/workspace/edutunisie/pdf-test')
import importlib.util
spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

# Check 15338, 15352 + look for similar
for nid in [15338, 15352]:
    r = m.neon_query(f'''
SELECT r."numericId", r.title, sub.slug as subj, c.slug as cls, sec.slug as sec,
  SUBSTRING(rc."fullText", 1, 600) as text,
  rm.subject as ai_subject
FROM "Resource" r
JOIN "Subject" sub ON sub.id = r."subjectId"
JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Section" sec ON sec.id = r."sectionId"
LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
LEFT JOIN "ResourceMetadata" rm ON rm."resourceId" = r.id
WHERE r."numericId" = {nid}
''')
    for row in r.get('response', [{}])[0].get('data', {}).get('rows', []):
        print(f'\nNID {row[0]}: subject={row[1]}, class={row[2]}')
        print(f'  Title: {row[0] and "see below"}')
        if row[4]:
            print(f'  Text: {row[4][:300]}')

# Find SVT resources with English-looking text (high English word density)
print()
print("=" * 60)
print("Looking for SVT resources that are actually English")
print("=" * 60)

# Common English words that wouldn't appear in SVT
english_words = ['the', 'and', 'with', 'have', 'this', 'that', 'they', 'from', 'are', 'was', 'were', 'been', 'will', 'their', 'which', 'when', 'where', 'what', 'there']

r = m.neon_query('''
SELECT r.id, r."numericId", r.title, 
  sub.slug as subj, c.slug as cls, sec.slug as sec,
  rc."fullText"
FROM "Resource" r
JOIN "Subject" sub ON sub.id = r."subjectId"
LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
JOIN "Class" c ON c.id = r."classId"
LEFT JOIN "Section" sec ON sec.id = r."sectionId"
WHERE sub.slug IN ('svt', 'mathematiques', 'physique') 
  AND rc."fullText" IS NOT NULL
  AND LENGTH(rc."fullText") > 200
LIMIT 2000
''')
rows = r.get('response', [{}])[0].get('data', {}).get('rows', [])
print(f'Sampled {len(rows)} SVT/Math/Physique resources')

# Count English words in text
import re
def english_word_count(text):
    if not text:
        return 0, 0
    text_lower = text.lower()
    words = re.findall(r'\b\w+\b', text_lower)
    en_count = sum(1 for w in words if w in english_words)
    return en_count, len(words)

suspicious = []
for rid, nid, title, subj, cls, sec, text in rows:
    en_count, total = english_word_count(text)
    if total > 50:
        ratio = en_count / total
        # If more than 20% of words are common English words, it's likely English content
        if ratio > 0.15 and en_count > 30:
            suspicious.append((nid, title, subj, ratio))

print(f'\nSuspicious (English-looking SVT/Math/Physique): {len(suspicious)}')
for nid, title, subj, ratio in suspicious[:30]:
    print(f'  NID {nid} [{subj}] ratio={ratio:.2%}: {title[:70]}')
