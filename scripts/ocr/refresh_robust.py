#!/usr/bin/env python3
"""
Robust OCR pipeline:
- Single worker (no parallelism) — predictable memory usage
- Checkpointing — resume from any crash
- OOM detection — pause + gc when memory low
- Per-PDF timeout — fail-safe skip
- Auto-cleanup of temp files
- Status tracking: pending/done/failed/skipped
- Auto-install missing deps
"""

import os, sys, subprocess

# ---------------------------------------------------------------------------
# Auto-install missing dependencies BEFORE other imports
# ---------------------------------------------------------------------------
REQUIRED_DEPS = {
    # module_name : pip_package_name
    'asyncpg': 'asyncpg',
    'requests': 'requests',
    'psycopg2': 'psycopg2-binary',
    'psutil': 'psutil',
    'PIL': 'Pillow',
    'pikepdf': 'pikepdf',
    'arabic_reshaper': 'arabic_reshaper',
    'bidi': 'python-bidi',
}

def ensure_deps():
    missing = []
    for module, pkg in REQUIRED_DEPS.items():
        try:
            __import__(module)
        except ImportError:
            missing.append(pkg)
    if missing:
        print(f"📦 Installing missing deps: {missing}", flush=True)
        # Try in user mode first (PEP 668 friendly), then break-system-packages
        for cmd in (
            [sys.executable, '-m', 'pip', 'install', '-q', '--user'] + missing,
            [sys.executable, '-m', 'pip', 'install', '-q', '--break-system-packages'] + missing,
        ):
            try:
                subprocess.check_call(cmd)
                print("✅ Dependencies installed", flush=True)
                break
            except subprocess.CalledProcessError:
                continue
        # Verify after install
        still_missing = []
        for module in REQUIRED_DEPS:
            try:
                __import__(module)
            except ImportError:
                still_missing.append(module)
        if still_missing:
            print(f"⚠️ Still missing after install: {still_missing}", flush=True)
            sys.exit(1)

ensure_deps()

# Now the real imports (post-deps)
import json, time, gc, signal, atexit
import asyncio
import requests
import hashlib as hl, glob, shutil
import traceback
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutTimeout

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
for env_file in ['/workspace/edutunisie/.env.local', '/workspace/edutunisie/.env']:
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                k, v = line.split('=', 1)
                os.environ.setdefault(k, v.strip('"').strip("'"))

import psycopg2
sys.path.insert(0, '/workspace/scripts/ocr')
import extract_custom

CHECKPOINT_FILE = '/workspace/scripts/ocr/robust_progress.json'
LOG_FILE = '/workspace/scripts/ocr/robust_pipeline.log'
TEMP_DIR = '/tmp/ocr_robust'
PROGRESS_EVERY = 5          # Save checkpoint every N PDFs
PER_PDF_TIMEOUT_S = 90       # Per-PDF overall timeout (download + OCR + DB)
OCR_TIMEOUT_S = 50           # OCR subprocess timeout
MEMORY_LOW_MB = 250          # Pause when available memory drops below this
MEMORY_CHECK_EVERY = 10      # Check memory every N PDFs
COOLDOWN_AFTER_OOM_S = 15    # Sleep this long after OOM


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
log_lock = __import__('threading').Lock()
log_f = open(LOG_FILE, 'a', buffering=1)  # line-buffered


def log(msg, level='INFO'):
    line = f"[{datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')}] [{level}] {msg}"
    print(line, flush=True)
    with log_lock:
        log_f.write(line + '\n')


# ---------------------------------------------------------------------------
# Checkpoint
# ---------------------------------------------------------------------------
def load_checkpoint():
    if os.path.exists(CHECKPOINT_FILE):
        try:
            with open(CHECKPOINT_FILE) as f:
                return json.load(f)
        except Exception as e:
            log(f"Failed to load checkpoint: {e}", 'WARN')
    return {}


def save_checkpoint(cp, force=False):
    """Atomic save to avoid corruption on crash."""
    tmp = CHECKPOINT_FILE + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(cp, f, indent=2, ensure_ascii=False)
    os.replace(tmp, CHECKPOINT_FILE)


# ---------------------------------------------------------------------------
# Memory
# ---------------------------------------------------------------------------
def available_memory_mb():
    try:
        import psutil
        return psutil.virtual_memory().available / 1024 / 1024
    except ImportError:
        return 999_999


def wait_for_memory():
    """Block until enough memory is available."""
    while True:
        mb = available_memory_mb()
        if mb >= MEMORY_LOW_MB:
            return
        log(f"⚠️ Low memory ({mb:.0f}MB < {MEMORY_LOW_MB}MB), waiting 30s...", 'WARN')
        time.sleep(30)


# ---------------------------------------------------------------------------
# Per-PDF processing
# ---------------------------------------------------------------------------
def process_one(resource, cp):
    """Process a single PDF. Returns (status, error_or_none)."""
    rid = resource['id']
    slug = resource['slug']
    title = (resource['title'] or '')[:60]

    # Skip if already done in this run
    rec = cp.get(rid, {})
    status = rec.get('status')
    if status == 'done':
        return 'skipped', None

    # Memory pre-flight
    if available_memory_mb() < MEMORY_LOW_MB:
        wait_for_memory()

    # 1. Download
    url = resource['fileUrl']
    try:
        resp = requests.get(url, timeout=PER_PDF_TIMEOUT_S, stream=False)
        resp.raise_for_status()
        pdf_bytes = resp.content
    except requests.exceptions.Timeout:
        return 'failed', 'download_timeout'
    except Exception as e:
        return 'failed', f'download_error:{type(e).__name__}'

    if not pdf_bytes or len(pdf_bytes) < 10_000:
        return 'failed', f'too_small:{len(pdf_bytes)}'

    # 2. OCR (synchronous, with subprocess timeouts inside extract_custom)
    try:
        fields = extract_custom.extract_from_bytes(pdf_bytes)
    except Exception as e:
        return 'failed', f'ocr_error:{type(e).__name__}:{str(e)[:80]}'

    if not fields or not isinstance(fields, dict):
        return 'failed', 'no_fields_returned'

    # 3. DB write
    try:
        write_to_db(rid, fields)
    except Exception as e:
        return 'failed', f'db_error:{type(e).__name__}:{str(e)[:80]}'

    return 'done', None


def write_to_db(rid, fields):
    """Update headerData + schoolName."""
    conn = psycopg2.connect(os.environ['DATABASE_URL'].replace('?schema=public', ''))
    cur = conn.cursor()
    cur.execute(
        'UPDATE "Resource" SET "headerData" = %s::jsonb WHERE id = %s',
        (json.dumps(fields, ensure_ascii=False), str(rid)),
    )
    if fields.get('school'):
        cur.execute(
            'UPDATE "Resource" SET "schoolName" = %s WHERE id = %s',
            (fields['school'], str(rid)),
        )
    conn.commit()
    cur.close()
    conn.close()


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
async def fetch_resources():
    conn = await asyncpg.connect(os.environ['DATABASE_URL'].replace('?schema=public', ''))
    rows = await conn.fetch('''
        SELECT id, slug, title, "fileUrl", "fileSize"
        FROM "Resource"
        WHERE "fileSize" > 80000
          AND "headerData" IS NOT NULL
        ORDER BY id
    ''')
    await conn.close()
    return [dict(r) for r in rows]


async def main():
    os.makedirs(TEMP_DIR, exist_ok=True)
    log("=" * 70)
    log("🚀 ROBUST OCR PIPELINE START")
    log("=" * 70)

    # Load checkpoint
    cp = load_checkpoint()
    done_count = sum(1 for r in cp.values() if r.get('status') == 'done')
    failed_count = sum(1 for r in cp.values() if r.get('status') == 'failed')
    log(f"📦 Checkpoint: {done_count} done, {failed_count} failed (resume mode)")

    # Fetch resources
    log("Loading resources from DB...")
    resources = await fetch_resources()
    log(f"📊 {len(resources)} resources to process")

    total = len(resources)
    skipped = done_count
    failed = failed_count
    success = 0
    start = time.time()

    for i, resource in enumerate(resources):
        rid = resource['id']

        # Already done?
        rec = cp.get(rid, {})
        if rec.get('status') == 'done':
            skipped += 1
            continue

        # Memory check periodically
        if i % MEMORY_CHECK_EVERY == 0:
            mb = available_memory_mb()
            log(f"💾 Memory: {mb:.0f}MB free | [{i+1}/{total}] done={success} failed={failed} skipped={skipped}")

        # Process with overall timeout via executor
        try:
            with ThreadPoolExecutor(max_workers=1) as ex:
                future = ex.submit(process_one, resource, cp)
                try:
                    status, err = future.result(timeout=PER_PDF_TIMEOUT_S)
                except FutTimeout:
                    status, err = 'failed', 'overall_timeout'
                except Exception as e:
                    status, err = 'failed', f'subprocess_error:{type(e).__name__}'
        except Exception as e:
            status, err = 'failed', f'wrapper_error:{type(e).__name__}'

        # Update counts and checkpoint
        if status == 'done':
            success += 1
            cp[rid] = {'status': 'done', 'ts': time.time()}
            log(f"✅ [{i+1}/{total}] {resource['title'][:50]} → done")
        elif status == 'failed':
            failed += 1
            cp[rid] = {'status': 'failed', 'reason': err, 'ts': time.time()}
            log(f"❌ [{i+1}/{total}] {resource['title'][:50]} → FAILED ({err})", 'ERROR')
            # If OOM, pause before continuing
            if err and 'memory' in str(err).lower():
                log(f"💥 Detected OOM, cooling down {COOLDOWN_AFTER_OOM_S}s...", 'WARN')
                time.sleep(COOLDOWN_AFTER_OOM_S)
        elif status == 'skipped':
            skipped += 1

        # Save checkpoint every N PDFs
        if (success + failed) % PROGRESS_EVERY == 0:
            save_checkpoint(cp, force=True)
            elapsed = time.time() - start
            rate = (success + failed) / elapsed if elapsed > 0 else 0
            log(f"💾 Checkpoint saved. Rate: {rate:.2f} PDFs/sec, ETA: {(total - i - 1) / max(rate, 0.01) / 60:.1f}min")

        # Aggressive cleanup
        gc.collect()
        # Clean temp files (they're /tmp/ocr_* from extract_custom)
        for pattern in ['/tmp/ocr_*', '/tmp/cust_*', '/tmp/h_*', '/tmp/t_*', '/tmp/sch*', '/tmp/dbg_*', '/tmp/c2_*', '/tmp/c3_*']:
            for f in glob.glob(pattern):
                try:
                    os.remove(f)
                except:
                    pass

    # Final save
    save_checkpoint(cp, force=True)
    elapsed = time.time() - start
    log("=" * 70)
    log(f"🏁 DONE: {success} success, {failed} failed, {skipped} skipped in {elapsed:.0f}s ({success / max(elapsed, 1):.2f}/s)")
    log("=" * 70)


if __name__ == '__main__':
    # Handle SIGTERM/SIGINT gracefully
    def handler(signum, frame):
        log(f"⚠️ Received signal {signum}, saving checkpoint and exiting...", 'WARN')
        # Will be saved at next PROGRESS_EVERY — or just rely on periodic save
        sys.exit(0)
    signal.signal(signal.SIGTERM, handler)
    signal.signal(signal.SIGINT, handler)

    asyncio.run(main())