
### 🤖 OpenAI Agents SDK v4 — pre-extraction + LLM confirmation (DONE 2026-07-31, `orchestrator_v4.py`)

**Goal**: handle OCR-degraded PDFs where v3 missed prof/school/year.

**Approach**:
- **Pre-extraction in Python** BEFORE the model call (regex hints):
  - Year: `(YYYY)-(YYYY)` or `YYYY/YYYY`
  - Duration: `مدة` + number + `دقيقة/دق` (or `durée 1h`)
  - Prof: `الأستاذ` (with OCR variants) + 1-4 Arabic words; OR no-prefix scan of first 15 lines
  - School: `المدرسة` + 1-6 Arabic words; OR `Lycée/Collège/École` + name
  - Date: `DD/MM/YYYY` patterns
- **Hints passed to LLM** as suggestions (LLM can confirm or override)
- **OCR-tolerant regex**: accepts Arabic Presentation Forms (U+FE70-U+FEFF) and Greek chars (U+0370-U+03FF) mixed with Arabic
- **Lam-Alef ligature handling**: "ﻻ" → "لا" (so "اﻷول" → "الاول" matches stop words)
- **Stop-word filter** for the no-prefix prof scanner: "التمرين", "الأول", "الإسم", "اللقب", "التوقيت", "المدة", "الفوج", etc.
- **PROF_END_MARKERS** truncate greedy match at "التوقيت" "الإنجاز" "المدة" etc.

**Test results on 50 Math collège files**:
- 48/50 success (96%)
- pre-hints: year=10/48 | prof=44/48 | school=17/48 | duration=10/48
- LLM final: **prof=47/48 (97.9%)** | school=45/48 (93.8%) | year=45/48 (93.8%) | duration=27/48 (56.3%)

**Comparison vs v3 on same 50**:
| Field | v3 | v4 | Δ |
|---|---|---|---|
| prof | 44/49 (89.8%) | **47/48 (97.9%)** | **+8%** |
| school | 47/49 (95.9%) | 45/48 (93.8%) | -2% |
| year | 49/49 (100%) | 45/48 (93.8%) | -6% |
| duration | not measured | 27/48 (56.3%) | new metric |

**v4 wins on prof**, slight loss on school/year. The year/school loss is because v4 is more strict (LLM rejects bad guesses) while v3 was lenient.

**Specific wins**:
- #1338: v3 returned prof "نجوى العلاني" (wrong) and null school; v4 returns "سمي الشابي" + "المدرسة الإعدادية العهد الجديد بنبل"
- #1054: v3 null prof; v4 "عِمَاد الناصِر" (from presentation-form OCR)
- #3282: v3 null prof; v4 "Fouzi Gharbi" / "فوزي الغربي" + school "المدرسة الإعدادية النموذجية"
- #1077: v4 correctly drops OCR-reversed "االستاذة" label from prof name → "يسرى ديسم"

**Avg time**: 5.2s (vs 5.6s for v3) — same speed, better accuracy.

**Decision**: **v4 is the new standard**. v3 stays for backward compat.

**Files**: `pdf-test/orchestrator_v4.py` (676 lines, ready for production).

### 🔍 OCR Degradation Detection + Tesseract Re-OCR (DONE 2026-07-31)

**Goal**: auto-detect files where existing OCR is broken, re-OCR with Tesseract (ara+fra+eng).

**Detection heuristics** (`pdf-test/detect_ocr_degradation.py`):
1. Greek/Latin char ratio in Arabic text (high = degraded) — biggest signal
2. Arabic presentation form ratio (very high = OCR ligated)
3. Control characters (\x00-\x1f)
4. Missing school/prof header markers
5. Very short text (< 200 chars = image-based)
6. High Latin ratio in Arabic text
7. Replacement chars (\ufffd, ???, □)

**Score 0-100**: 0-30 clean, 30-60 moderate (re-OCR), 60-100 severe (must re-OCR).

**Tesseract re-OCR**:
- lang=`ara+fra+eng`, dpi=200, psm=6, max 3 pages
- Saves with method='tesseract', model='tesseract-5.3.0-ara+fra+eng'

**Test on 10 Math collège files** (3 known degraded + 7 random):
| ID | Before | After | Prof recovered |
|---|---|---|---|
| #2755 | pres_forms 75% (score 40) | pres_forms 0% (score 20) | no (no prof in PDF) |
| #3282 | pres_forms 74% (score 40) | clean (score 0) | no (no prof in PDF) |
| #1338 | greek_noise 28% (score 50) | **clean (score 0)** | **YES "الأستاذ سامي الشلي"** |

**3/10 (30%) were degraded, 3/3 (100%) improved**. The 30% rate holds on larger samples (15/50, 18/100).

**Files**:
- `pdf-test/detect_ocr_degradation.py` (detection + re-OCR pipeline)
- `pdf-test/test_10_math_college.py` (test suite for 10 examples)

**Known Tesseract limitations**:
- "بنابل" vs "بنبل" (similar Arabic chars confused)
- May lose some school name parts (e.g. "ضفاف البحيرة" got truncated to "النموذجية")
- Adds \u200e RTL marks that need cleanup

**Next**: bulk run on all 18%+ degraded Math collège (~600 files), then re-run orchestrator_v4 on the new text.

### 🔄 Staging Tables + Bulk Re-OCR + Orchestrator v4 (2026-07-31, IN PROGRESS)

**Goal**: Re-OCR degraded files + extract AI metadata, **staging ONLY** (no live DB/UI changes until user confirms).

**Staging tables created**:
- `ResourceContentStaging` (nouveau texte Tesseract, originalMethod, degradationScore, isApplied)
- `ResourceMetadataStaging` (AI metadata: subject, keyPoints, prof, school, type, year, duration, confidence)

**Pipeline**:
1. `pdf-test/bulk_reocr_to_staging.py --college-only --limit 3335 --apply --workers 4`
   - Filters: Technologie skipped, Lycée skipped (per user), Collège only
   - Detects degradation (Greek noise, presentation forms, control chars, no header markers)
   - Tesseract re-OCR (ara+fra+eng, 200dpi, max 3 pages)
   - Cleans \\u200e, \\u200f, \\u200b-d, \\ufeff, \\u2060 RTL marks
   - Saves to ResourceContentStaging (isApplied=FALSE)
2. `pdf-test/orchestrator_v4_staging.py --ids X,Y,Z --apply`
   - Reads Tesseract text from ResourceContentStaging
   - Runs orchestrator v4 (pre-extract + 3 agents: subject, keyPoints, metadata)
   - Saves to ResourceMetadataStaging (isApplied=FALSE)
3. `isApplied=FALSE` partout → **live DB untouched** until user reviews and applies

**Files**:
- `pdf-test/bulk_reocr_to_staging.py` (re-OCR + save to staging)
- `pdf-test/orchestrator_v4_staging.py` (v4 reads from staging)
- `pdf-test/detect_ocr_degradation.py` (reusable detection)
- `pdf-test/test_10_math_college.py` (reusable test)

**Progress (snapshot 2026-07-31)**:
- 192/3335 files OCR'd in staging (~20% degradation rate)
- 70/192 metadata extracted (100% prof, 100% school, 100% subject)
- Bulk re-OCR running in background, ETA ~2-3 hours

**Fix made to orchestrator_v4**: duration regex IndexError when pattern has 1 group (m.group(2) raises) → added try/except with `m.lastindex and m.lastindex >= 2 and m.group(2) else ""`

**Tesseract gotcha**: `ara.traineddata` can disappear from `/usr/share/tesseract-ocr/5/tessdata/`. Re-download:
```bash
cd /usr/share/tesseract-ocr/5/tessdata/
curl -fsSL "https://github.com/tesseract-ocr/tessdata_fast/raw/main/ara.traineddata" -o ara.traineddata
curl -fsSL "https://github.com/tesseract-ocr/tessdata_fast/raw/main/fra.traineddata" -o fra.traineddata
```

**Apply to live (when user confirms)**:
```sql
-- ResourceContentStaging → ResourceContent (text)
UPDATE "ResourceContent" rc
SET "fullText" = rcs."stagingText",
    "extractionMethod" = rcs."stagingMethod",
    "extractedAt" = rcs."extractedAt"
FROM "ResourceContentStaging" rcs
WHERE rc."resourceId" = rcs."resourceId"
  AND rcs."isApplied" = FALSE;
-- Then mark isApplied=TRUE
```
