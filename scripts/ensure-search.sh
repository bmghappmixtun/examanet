#!/bin/bash
# Ensure FTS triggers/columns are in place
# Runs on every Vercel build to prevent the "column 'new' does not exist" bug

set -e
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL not set, skipping search setup"
  exit 0
fi

echo "🔍 Ensuring FTS setup..."
node -e "
const fs = require('fs');
const { Client } = require('pg');
const c = new Client({ 
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false } 
});
(async () => {
  await c.connect();
  const sql = fs.readFileSync('scripts/setup-search.sql', 'utf8');
  await c.query(sql);
  console.log('✅ FTS setup OK');
  await c.end();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
"
