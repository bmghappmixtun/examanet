#!/usr/bin/env node
/**
 * Upload 9raya.tn PDFs (sujets + corrigés) to Vercel Blob via API route.
 *
 * Files to upload (15 total):
 * - Math cycles 2001-2003, 2005-2009 (8 fichiers, sauf 2004 = ministère perdu)
 * - Arabe modèles 2025 (2 fichiers, sans corrigé)
 * - SVT: 1 sujet 2019 + 1 corrigé 2019 + 1 sujet modèle 3 (3 fichiers)
 * - Cycle 2020 + الإصلاح (Math) combo (1 fichier - GOLD)
 * - French trial + إصلاح (1 fichier)
 *
 * Auth: SEED_TOKEN (admin)
 * Storage namespace: concours-9eme/9raya/
 */
import { readFileSync } from 'node:fs';

const API_URL = 'https://examanet.com/api/admin/concours-9eme/bulk-upload';
const SEED_TOKEN = process.env.SEED_TOKEN || 'cffa7e495ff6a441d253b03b8cf1efa7';

// 9raya.tn files to upload
// Format: { key: blob key, sourceUrl: 9raya.tn direct PDF URL, year, subject, type, note }
const FILES = [
  // ========== A) MATH (cycles 2001-2003, 2005-2009) ==========
  {
    key: 'concours-9eme/9raya/2001/general/sujets/math.pdf',
    sourceUrl: 'https://9raya.tn/wp-content/uploads/2022/03/دورة-2001.pdf',
    year: 2001,
    subject: 'math',
    voie: 'general',
    type: 'sujet',
    source: '9raya.tn',
    note: 'سنة تاسعة — math 2001',
  },
  {
    key: 'concours-9eme/9raya/2002/general/sujets/math.pdf',
    sourceUrl: 'https://9raya.tn/wp-content/uploads/2022/03/دورة-2002.pdf',
    year: 2002,
    subject: 'math',
    voie: 'general',
    type: 'sujet',
    source: '9raya.tn',
    note: 'سنة تاسعة — math 2002',
  },
  {
    key: 'concours-9eme/9raya/2003/general/sujets/math.pdf',
    sourceUrl: 'https://9raya.tn/wp-content/uploads/2022/03/دورة-2003.pdf',
    year: 2003,
    subject: 'math',
    voie: 'general',
    type: 'sujet',
    source: '9raya.tn',
    note: 'سنة تاسعة — math 2003',
  },
  {
    key: 'concours-9eme/9raya/2005/general/sujets/math.pdf',
    sourceUrl: 'https://9raya.tn/wp-content/uploads/2022/03/دورة-2005.pdf',
    year: 2005,
    subject: 'math',
    voie: 'general',
    type: 'sujet',
    source: '9raya.tn',
    note: 'سنة تاسعة — math 2005',
  },
  {
    key: 'concours-9eme/9raya/2006/general/sujets/math.pdf',
    sourceUrl: 'https://9raya.tn/wp-content/uploads/2022/03/دورة-2006.pdf',
    year: 2006,
    subject: 'math',
    voie: 'general',
    type: 'sujet',
    source: '9raya.tn',
    note: 'سنة تاسعة — math 2006',
  },
  {
    key: 'concours-9eme/9raya/2007/general/sujets/math.pdf',
    sourceUrl: 'https://9raya.tn/wp-content/uploads/2022/03/دورة-2007.pdf',
    year: 2007,
    subject: 'math',
    voie: 'general',
    type: 'sujet',
    source: '9raya.tn',
    note: 'سنة تاسعة — math 2007',
  },
  {
    key: 'concours-9eme/9raya/2008/general/sujets/math.pdf',
    sourceUrl: 'https://9raya.tn/wp-content/uploads/2022/03/دورة-2008.pdf',
    year: 2008,
    subject: 'math',
    voie: 'general',
    type: 'sujet',
    source: '9raya.tn',
    note: 'سنة تاسعة — math 2008',
  },
  {
    key: 'concours-9eme/9raya/2009/general/sujets/math.pdf',
    sourceUrl: 'https://9raya.tn/wp-content/uploads/2022/03/دورة-2009.pdf',
    year: 2009,
    subject: 'math',
    voie: 'general',
    type: 'sujet',
    source: '9raya.tn',
    note: 'سنة تاسعة — math 2009',
  },

  // ========== B) ARABE modèles 2025 (2 fichiers) ==========
  {
    key: 'concours-9eme/9raya/2025/general/sujets/arabe-modele-1.pdf',
    sourceUrl: 'https://9raya.tn/wp-content/uploads/2025/06/مناظرات-عربية-سنة-تاسعة-نموذج1.pdf',
    year: 2025,
    subject: 'arabe',
    voie: 'general',
    type: 'sujet',
    source: '9raya.tn',
    note: 'مناظرة عربية سنة تاسعة نموذج 1',
  },
  {
    key: 'concours-9eme/9raya/2025/general/sujets/arabe-modele-2.pdf',
    sourceUrl: 'https://9raya.tn/wp-content/uploads/2025/06/مناظرات-عربية-سنة-تاسعة-نموذج2.pdf',
    year: 2025,
    subject: 'arabe',
    voie: 'general',
    type: 'sujet',
    source: '9raya.tn',
    note: 'مناظرة عربية سنة تاسعة نموذج 2',
  },

  // ========== C) SVT (1 sujet 2019 + 1 corrigé 2019 + 1 sujet 2024) ==========
  {
    key: 'concours-9eme/9raya/2019/general/sujets/svt.pdf',
    sourceUrl:
      'https://9raya.tn/wp-content/uploads/2019/06/مناظرة-علوم-الحياة-و-الارض-سنة-تاسعة2.pdf',
    year: 2019,
    subject: 'svt',
    voie: 'general',
    type: 'sujet',
    source: '9raya.tn',
    note: 'مناظرة علوم الحياة والأرض سنة تاسعة',
  },
  {
    key: 'concours-9eme/9raya/2019/general/corriges/svt.pdf', // ⭐ CORRIGÉ
    sourceUrl:
      'https://9raya.tn/wp-content/uploads/2019/06/إصلاح-اختبار-علوم-الحياة-والأرض-التاسعة-أساسي-2019.pdf',
    year: 2019,
    subject: 'svt',
    voie: 'general',
    type: 'corrige',
    source: '9raya.tn',
    note: 'إصلاح اختبار علوم الحياة والأرض التاسعة أساسي 2019',
  },
  {
    key: 'concours-9eme/9raya/2024/general/sujets/svt-modele-3.pdf',
    sourceUrl:
      'https://9raya.tn/wp-content/uploads/2024/04/مناظرة-علوم-الحياة-و-الارض-سنة-تاسعة-نموذج-عدد3.pdf',
    year: 2024,
    subject: 'svt',
    voie: 'general',
    type: 'sujet',
    source: '9raya.tn',
    note: 'مناظرة علوم الحياة والأرض سنة تاسعة نموذج 3',
  },

  // ========== D) CYCLE 2020 + الإصلاح (Math) combo — ⭐ GOLD CORRIGÉ 2020+ ==========
  {
    key: 'concours-9eme/9raya/2020/general/sujets+correction/math.pdf', // ⭐ CORRIGÉ
    sourceUrl:
      'https://9raya.tn/wp-content/uploads/2021/04/إمتحان-شهادة-ختم-التعليم-الأساسي-الإصلاح.pdf',
    year: 2020,
    subject: 'math',
    voie: 'general',
    type: 'corrige',
    source: '9raya.tn',
    note: 'إمتحان شهادة ختم التعليم الأساسي دورة 2020 + الإصلاح — MATH',
  },

  // ========== E) FRENCH TRIAL + corrigé ==========
  {
    key: 'concours-9eme/9raya/2020/general/sujets+correction/francais-trial.pdf', // ⭐ CORRIGÉ
    sourceUrl: 'https://9raya.tn/wp-content/uploads/2019/06/مناظرة-تجريبية-فرنسية-مع-الإصلاح.pdf',
    year: 2020,
    subject: 'francais',
    voie: 'general',
    type: 'corrige',
    source: '9raya.tn',
    note: 'مناظرة تجريبية فرنسية مع الإصلاح',
  },
];

console.log(`📤 Uploading ${FILES.length} fichiers 9raya.tn vers Vercel Blob...`);

async function uploadBatch(batch) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-seed-token': SEED_TOKEN,
    },
    body: JSON.stringify({ files: batch }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

async function main() {
  const results = { uploaded: [], failed: [] };
  const BATCH_SIZE = 15; // 9raya files are all small, can do in 1 batch
  for (let i = 0; i < FILES.length; i += BATCH_SIZE) {
    const batch = FILES.slice(i, i + BATCH_SIZE);
    console.log(`\n📦 Batch ${i / BATCH_SIZE + 1}: ${batch.length} fichiers`);
    try {
      const r = await uploadBatch(batch);
      console.log(`   ✅ uploaded: ${r.uploaded?.length || 0}`);
      console.log(`   ❌ failed:    ${r.failed?.length || 0}`);
      if (r.uploaded) results.uploaded.push(...r.uploaded);
      if (r.failed) results.failed.push(...r.failed);
    } catch (err) {
      console.error(`   💥 batch error: ${err.message}`);
      for (const f of batch) {
        results.failed.push({ key: f.key, sourceUrl: f.sourceUrl, error: err.message });
      }
    }
  }
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 TOTAL: uploaded=${results.uploaded.length} failed=${results.failed.length}`);
  console.log(`${'='.repeat(60)}\n`);

  // Save results to file
  const fs = await import('node:fs');
  fs.writeFileSync(
    '/workspace/docs/concours-9eme-9raya-upload-result.json',
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: '9raya.tn',
        site: 'examanet.com',
        total_tasks: FILES.length,
        total_uploaded: results.uploaded.length,
        total_failed: results.failed.length,
        uploaded: results.uploaded,
        failed: results.failed,
      },
      null,
      2,
    ),
  );
  console.log('💾 Saved: /workspace/docs/concours-9eme-9raya-upload-result.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
