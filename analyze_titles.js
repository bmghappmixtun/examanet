const { Client } = require('pg');

(async () => {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // 1. Get sample of well-formed titles
  console.log('═══════════════════════════════════════');
  console.log('  ANALYSE TITRES RESSOURCES');
  console.log('═══════════════════════════════════════\n');

  console.log('📊 Counts:');
  const cnt = await c.query(`
    SELECT
      (SELECT COUNT(*) FROM "Resource") as total,
      (SELECT COUNT(*) FROM "Resource" WHERE status = 'PUBLISHED') as pub,
      (SELECT COUNT(*) FROM "Resource" WHERE title IS NULL OR TRIM(title) = '') as empty
  `);
  console.log('  Total resources:', Number(cnt.rows[0].total));
  console.log('  Published:', Number(cnt.rows[0].pub));
  console.log('  Empty title:', Number(cnt.rows[0].empty));
  console.log('');

  // 2. Sample of titles to see structure
  console.log('📋 Sample of titles (random 30):');
  const sample = await c.query(`
    SELECT r.title, r.type, r."classId", r."subjectId",
      c.nameFr as class_name, s.nameFr as subject_name
    FROM "Resource" r
    LEFT JOIN "Class" c ON r."classId" = c.id
    LEFT JOIN "Subject" s ON r."subjectId" = s.id
    WHERE r.status = 'PUBLISHED' AND r.title IS NOT NULL AND r.title != ''
    ORDER BY RANDOM() LIMIT 30
  `);
  sample.rows.forEach(r => {
    console.log('  ' + JSON.stringify(r.title));
  });
  console.log('');

  // 3. Check title patterns - detect components
  console.log('🔍 Pattern analysis:');
  const allTitles = await c.query(`
    SELECT title FROM "Resource"
    WHERE status = 'PUBLISHED' AND title IS NOT NULL AND title != ''
  `);
  const totalTitles = allTitles.rows.length;
  
  // Check various regex patterns
  const patterns = {
    'Type (Devoir|Examen|Test)': /devoir|examen|test/i,
    'Controle/Synthese': /contrôle|synth[eè]se|controle/i,
    'Matière (math|physique|svt|...)': /math|physique|svt|arabe|fran[cç]ais|anglais|philo|hist|geo|informatique|techno/i,
    'Classe (7eme|8eme|9eme|1ere|2eme|3eme|4eme)': /\b(7|8|9|[1-4])([eè]me|ère|ere)\b|\b7e\b|\b8e\b|\b9e\b|\b1e\b|\b2e\b|\b3e\b|\b4e\b|\bbac\b/i,
    'Section (sciences|lettres|eco|tech|info)': /sciences?|lettres?|eco|gestion|techno|info(?:rmatique)?|sport|musiq/i,
    'Année scolaire (2010-2011, 2020/2021, ...)': /20[0-2][0-9][\s\-\/]+20[0-2][0-9]/,
    'Lycée/Collège': /lyc[eé]e|coll[eè]ge|pilote/i,
  };

  for (const [name, re] of Object.entries(patterns)) {
    const matching = allTitles.rows.filter(r => re.test(r.title)).length;
    const pct = ((matching / totalTitles) * 100).toFixed(1);
    console.log('  ' + name + ': ' + matching + '/' + totalTitles + ' (' + pct + '%)');
  }
  console.log('');

  // 4. Check for malformed patterns
  console.log('⚠️  Malformed patterns:');
  
  // Titles that look like filenames (have .pdf, .docx, IMG, etc.)
  const filenames = allTitles.rows.filter(r =>
    /\.(pdf|docx?|xls|xlsx|pptx?|jpg|jpeg|png|gif|webp|zip|rar)\b/i.test(r.title) ||
    /\bIMG[_-]?\d+/i.test(r.title) ||
    /\bDOC[_-]?\d+/i.test(r.title) ||
    /\bDSC[_-]?\d+/i.test(r.title) ||
    /scan|scanned|scanner/i.test(r.title)
  );
  console.log('  Filenames (pdf, docx, IMG...): ' + filenames.length);
  filenames.slice(0, 5).forEach(r => console.log('    ' + JSON.stringify(r.title)));
  console.log('');

  // Watermarks
  const watermarks = allTitles.rows.filter(r =>
    /tunisiecollege|devoirat\.net|google\s*drive|dropbox|youtube|telecharg|examanet/i.test(r.title) ||
    /[a-z]+@[a-z]+\.(com|fr|net|org)/i.test(r.title)
  );
  console.log('  Watermarks/source: ' + watermarks.length);
  watermarks.slice(0, 5).forEach(r => console.log('    ' + JSON.stringify(r.title)));
  console.log('');

  // Random gibberish (no recognizable words)
  const gibberish = allTitles.rows.filter(r => {
    const t = r.title.toLowerCase();
    return t.length > 0 && (
      /[a-z]{20,}/.test(t.replace(/[^a-z]/g, '')) ||
      /[^a-z\u0600-\u06FF\u00C0-\u017F\s\d\-\.\(\)\/&,'":!?]+/i.test(t) ||
      t.length > 200
    );
  });
  console.log('  Gibberish/very long: ' + gibberish.length);
  gibberish.slice(0, 5).forEach(r => console.log('    ' + JSON.stringify(r.title)));
  console.log('');

  // Titles missing key component
  console.log('🔎 Titles missing components (likely malformed):');
  const noType = allTitles.rows.filter(r => !/devoir|examen|test|révision|revision|série|serie|cours|leçon|leçon|exercice/i.test(r.title));
  console.log('  No "Type" (devoir/examen/...): ' + noType.length);
  noType.slice(0, 3).forEach(r => console.log('    ' + JSON.stringify(r.title)));

  const noYear = allTitles.rows.filter(r => !/20[0-2][0-9]/.test(r.title));
  console.log('  No year (20XX): ' + noYear.length);
  noYear.slice(0, 3).forEach(r => console.log('    ' + JSON.stringify(r.title)));

  const noClass = allTitles.rows.filter(r => !/\b(7|8|9|[1-4])([eè]me|ère|ere)\b|\b7e\b|\b8e\b|\b9e\b|\b1e\b|\b2e\b|\b3e\b|\b4e\b|\bbac\b|coll[eè]ge/i.test(r.title));
  console.log('  No class (7-9eme, bac): ' + noClass.length);
  noClass.slice(0, 3).forEach(r => console.log('    ' + JSON.stringify(r.title)));

  await c.end();
})();
