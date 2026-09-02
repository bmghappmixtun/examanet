import { searchV2 } from '../src/lib/search-v2';

const queries = [
  'devoir',
  '1as',
  'mathematiques',
  'svt',
  'physique',
  'corrige',
  '9eme',
  'francais',
  'mathematik',
  'الفرنسية',
];

for (const q of queries) {
  const d = await searchV2({ q, limit: 5 });
  console.log(
    `  ${q.padEnd(15)} → ${String(d.total).padStart(5)} in ${String(d.durationMs).padStart(4)}ms | variants=${d.variants.length} | syn=${d.synonymsApplied.length}`,
  );
}
