#!/usr/bin/env python3
"""
Bulk-generate summaries for the 206 lycée (1ère AS) resources still missing them.

Flow:
1. Fetch 206 published resources (status=PUBLISHED) without summary, with OCR text
2. For each, call GPT-4o-mini with the LYCÉE prompt (2 paragraphs plain text)
3. Save to both ResourceSummary and Resource.summary
4. 3 parallel workers, retry x3 on 429/insufficient_quota
"""
import os, json, re, time, importlib.util, threading
from concurrent.futures import ThreadPoolExecutor, as_completed

spec = importlib.util.spec_from_file_location('bulk_math_v5', '/workspace/edutunisie/pdf-test/bulk_math_v5.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

# OpenAI client
try:
    from openai import OpenAI
    api_key = os.environ.get('OPENAI_API_KEY')
    if not api_key:
        # Try from .env
        for line in open('/workspace/edutunisie/.env.local'):
            if 'OPENAI_API_KEY' in line:
                api_key = line.split('=', 1)[1].strip().strip('"').strip("'")
                break
    client = OpenAI(api_key=api_key)
except Exception as e:
    print(f"❌ OpenAI init failed: {e}")
    exit(1)

PROGRESS = '/workspace/edutunisie/pdf-test/gen_lycee_summary_progress.json'

# Lycée prompt (2 paragraphs, plain text, French)
LYCEE_PROMPT = """Tu es un expert en éducation tunisienne. Génère un résumé de ce document scolaire pour des élèves de 1ère année secondaire (lycée tunisien).

Titre: {title}
Type: {type}
Matière: {subject}

Texte du document (premiers 5000 caractères):
{text}

RÈGLES:
- Résume en exactement 2 paragraphes de texte fluide (PAS de liste à puces, PAS de JSON)
- Premier paragraphe: présente le document (type, classe, année si visible) et les thèmes/exercices principaux
- Second paragraphe: détaille les compétences/concepts travaillés et le niveau de difficulté
- En français, ton neutre et pédagogique
- 150-250 mots au total
- N'invente AUCUNE information qui n'est pas dans le texte

Réponds UNIQUEMENT avec le texte des 2 paragraphes, sans guillemets ni préambule."""


def sanitize_text(val):
    if val is None:
        return ''
    return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', str(val))


def call_openai(prompt, max_retries=3):
    """Call GPT-4o-mini with retry on 429/quota errors."""
    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model='gpt-4o-mini',
                messages=[
                    {"role": "system", "content": "Tu réponds UNIQUEMENT avec le texte demandé, sans préambule."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=600,
                temperature=0.2,
            )
            return response.choices[0].message.content.strip(), response.usage.total_tokens, None
        except Exception as err:
            err_str = str(err)
            if '429' in err_str or 'Rate limit' in err_str or 'insufficient_quota' in err_str:
                if attempt < max_retries - 1:
                    delay = 5 * (2 ** attempt)
                    print(f"  ⚠️  429/quota, retry {attempt+1}/{max_retries} in {delay}s")
                    time.sleep(delay)
                    continue
                return None, 0, f"quota_exhausted: {err_str[:100]}"
            return None, 0, f"error: {err_str[:200]}"


# Load progress
done = set()
if os.path.exists(PROGRESS):
    try:
        with open(PROGRESS) as f:
            done = set(json.load(f).get('done', []))
    except:
        pass


def process_resource(args):
    rid, title, type_, subject, ocr_text = args
    if rid in done:
        return rid, True, 'skipped', 0

    # Truncate text
    text = sanitize_text(ocr_text or '')[:5000]
    if not text or len(text) < 50:
        return rid, False, 'no_text', 0

    prompt = LYCEE_PROMPT.format(
        title=title or '?',
        type=type_ or '?',
        subject=subject or '?',
        text=text,
    )

    summary, tokens, err = call_openai(prompt)
    if not summary:
        return rid, False, err or 'no_response', 0

    summary = sanitize_text(summary)
    if len(summary) < 30:
        return rid, False, 'too_short', 0

    # Save to ResourceSummary
    rid_e = m.sql_escape(rid)
    summ_e = m.sql_escape(summary)
    r1 = m.neon_query(f'''INSERT INTO "ResourceSummary" (id, "resourceId", summary, "modelUsed", "extractedAt")
                          VALUES ({m.sql_escape('rsum_' + rid[:20])}, {rid_e}, {summ_e}, 'gpt-4o-mini', NOW())
                          ON CONFLICT ("resourceId") DO UPDATE SET summary = EXCLUDED.summary, "extractedAt" = NOW()''')
    if not r1.get('response'):
        return rid, False, 'summary_table_insert_failed', tokens

    # Copy to Resource.summary
    r2 = m.neon_query(f'''UPDATE "Resource"
                          SET summary = {summ_e}, "updatedAt" = NOW()
                          WHERE id = {rid_e}''')
    if not r2.get('response'):
        return rid, False, 'resource_update_failed', tokens

    return rid, True, 'ok', tokens


# Fetch 206 resources
print("=" * 60)
print("📋 Génération summaries pour 206 resources lycée manquantes")
print("=" * 60)

# Use NOT IN for done set, but cap to 1000 chars
done_str = ','.join(m.sql_escape(d) for d in list(done)[:5000]) if done else "''"
r = m.neon_query(f'''SELECT r.id, r.title, r.type, s.slug as subject, 
                            COALESCE(rc."fullText", '') as ocr_text
                     FROM "Resource" r
                     JOIN "Class" c ON r."classId" = c.id
                     JOIN "Subject" s ON r."subjectId" = s.id
                     LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
                     WHERE r.status = 'PUBLISHED'
                     AND c.slug IN ('1ere-secondaire','2eme-secondaire','3eme-secondaire','4eme-secondaire')
                     AND (r.summary IS NULL OR r.summary = '' OR TRIM(r.summary) = '')
                     AND r.id NOT IN ({done_str})
                     ORDER BY r."numericId"
                     LIMIT 300''')
resources = r['response'][0]['data']['rows']
print(f"📚 À traiter: {len(resources)} resources")
print(f"✅ Déjà faites: {len(done)}")

if not resources:
    print("✅ Rien à faire")
    exit(0)

# Process with 3 parallel workers
start = time.time()
total_tokens = 0
ok_count = 0
fail_count = 0
lock = threading.Lock()

with ThreadPoolExecutor(max_workers=3) as executor:
    futures = {executor.submit(process_resource, res): res[0] for res in resources}
    for i, future in enumerate(as_completed(futures), 1):
        rid, success, msg, tokens = future.result()
        with lock:
            total_tokens += tokens
            if success:
                ok_count += 1
                done.add(rid)
                if ok_count % 20 == 0 or i == len(resources):
                    elapsed = time.time() - start
                    rate = ok_count / elapsed if elapsed > 0 else 0
                    print(f"  [{i:3d}/{len(resources)}] OK: {ok_count}, Fail: {fail_count}, Tokens: {total_tokens}, Rate: {rate:.1f}/s")
            else:
                fail_count += 1
                if fail_count <= 5:
                    print(f"  ✗ {rid[:15]}: {msg}")
        
        # Save progress every 10
        if i % 10 == 0:
            with open(PROGRESS, 'w') as f:
                json.dump({'done': list(done)}, f)

# Final save
with open(PROGRESS, 'w') as f:
    json.dump({'done': list(done)}, f)

elapsed = time.time() - start
cost = total_tokens / 1_000_000 * 0.15  # $0.15 per 1M input tokens
print(f"\n{'=' * 60}")
print(f"✅ TERMINÉ")
print(f"   OK: {ok_count}, Fail: {fail_count}")
print(f"   Tokens: {total_tokens:,} (~$ {cost:.4f})")
print(f"   Time: {elapsed/60:.1f} min")
print(f"{'=' * 60}")
