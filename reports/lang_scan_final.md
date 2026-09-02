# Language Scan Report - 2026-08-08

## Coverage
- **Total scanned**: 15,330 / 15,372 published resources (99.7%)
- **Method**: `langdetect` Python library on `ResourceContent.fullText` (first 2000 chars)
- **Performance**: ~5 min for 15k files (batched Python processing)

## Results

### Original scan found 507 suspect files:
| Severity | Count | Description |
|----------|-------|-------------|
| HIGH | 378 | Subject migration needed (langdetect ≠ current subject) |
| MEDIUM | 22 | AR file with FR content (lang tag fix) |
| LOW | 107 | FR file with AR content (lang tag fix) |

## Fixes Applied ✅

### 1. 3L Allemand migrations (4 files)
- #4924, #8472, #8474, #14677 → 3ème Langue - Allemand
- All were Ali Nafkha's allemand devoi (1AS, 3AS, 4ème Bac)

### 2. Language tag fixes (375 files)
- **247 anglais files**: language `fr` → `en` (subject was already correct)
- **106 files**: language `fr` → `ar` (AR content: math, histoire, géographie, islamique, philosophie, etc.)
- **22 files**: language `ar` → `fr` (FR content incorrectly tagged AR)

### 3. Anglais migrations (29 files)
- **3 files** with "Anglais" in title but in other subject (#4330, #7869, #13849)
- **9 files** with English exam patterns (Reading Comprehension, etc.) 
- **17 files** with long English content actually in math/svt/physics subject

### 4. Title reformatting
- All migrated files had title updated (Mathématiques → Anglais / 3ème Langue - Allemand)
- Cleanup of duplicate "3ème Langue - Allemand" patterns

## Final State

### Subjects count
| Subject | Count |
|---------|-------|
| mathematiques | 6,734 |
| anglais | **616** (+29) |
| 3eme-langue-allemand | **63** (+4) |
| 3eme-langue-italien | 4 |
| 3eme-langue-espagnol | 1 |

### Languages count
| Language | Count |
|----------|-------|
| fr | 11,562 |
| ar | 3,113 |
| en | **629** (+253) |
| de | **63** (+4) |
| it | 4 |
| es | 1 |

## Remaining 95 HIGH Issues (False Positives) ⏭️

All remaining are **langdetect false positives**:
- **~30 OCR garbage files** (text is "sss sss" or "!!@#")
- **~32 short text files** (<500 chars, langdetect unreliable)
- **3 HTML code files** (TIC: #4383, #11955, #12039) - HTML tags confuse detector
- **~5 German quote in French math** (one German sentence in correction)
- **~3 OCR tool errors** ("I can't assist with extracting...")
- **~25 "de" detections** on French math files (langdetect fooled by single German word)

These do NOT need migration - the content is correctly classified, langdetect is just wrong.

## Scripts Created

- `/workspace/edutunisie/scan_language_fast.js` - main scanner (batch 500 + Python call)
- `/workspace/edutunisie/scan_language_v2.js` - alternative scanner (per-file)
- `/tmp/lang_scan.py` - Python detection script (langdetect)
- `/tmp/fix_lang_tags.js` - bulk language tag updater
- `/tmp/aggressive_en.js` - smart English pattern detector
- `/tmp/cleanup_dupes2.js` - title duplicate cleanup
