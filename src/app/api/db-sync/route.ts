import { NextResponse } from 'next/server';
import { Client } from 'pg';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * DB Sync endpoint — Vercel Cron auto-heal for Neon password.
 *
 * Optimized 2026-08-21 v2: use DB connection test instead of comparing
 * Vercel env (which is cached at lambda boot). This is a true no-op when
 * the existing password works.
 *
 * Flow:
 * 1. Try to connect to DB with current process.env.DATABASE_URL
 * 2. If connection succeeds, NO-OP (most common case, 99% of calls)
 * 3. If connection fails, reset Neon password + update Vercel env (prod + preview)
 * 4. NO redeploy — env vars are picked up on next cold start
 *
 * Schedule (vercel.json): 0 8,20 * * * — twice daily at 8am and 8pm UTC
 *
 * Protected by CRON_SECRET (Vercel Cron sends Authorization: Bearer ${CRON_SECRET})
 */
export async function GET(req: Request) {
  // Vercel Cron sends Authorization: Bearer ${CRON_SECRET}
  const authHeader = req.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  const results: any = {
    steps: [],
    duration: 0,
  };

  // Step 1: Test current DB connection (cheap, ~50ms)
  const currentDbUrl = process.env.DATABASE_URL;
  if (!currentDbUrl) {
    return NextResponse.json({ ok: false, error: 'DATABASE_URL not set' }, { status: 500 });
  }

  const client = new Client({ connectionString: currentDbUrl, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    await client.query('SELECT 1');
    await client.end();

    // Connection works — no-op
    results.steps.push({ step: 'db_connection', ok: true, message: 'DB connection succeeded, no rotation needed' });
    results.changed = false;
    results.duration = Date.now() - start;
    return NextResponse.json({ ok: true, ...results });
  } catch (err: any) {
    results.steps.push({ step: 'db_connection', ok: false, error: err?.message?.slice(0, 200) });
    try { await client.end(); } catch {}
    // Connection failed — fall through to reset
  }

  // Step 2: Reset Neon password and update Vercel env
  try {
    const neonKey = process.env.NEON_API_KEY!;
    const vercelToken = process.env.VERCEL_TOKEN!;
    const vercelProjectId = process.env.VERCEL_PROJECT_ID!;
    const envProd = process.env.VERCEL_ENV_PROD!;
    const envPreview = process.env.VERCEL_ENV_PREVIEW!;

    const PROJECT_ID = 'little-silence-94324724';
    const BRANCH_ID = 'br-purple-recipe-as2x8yyo';
    const ROLE = 'neondb_owner';
    const HOST = 'ep-round-art-asyh88wq-pooler.c-4.eu-central-1.aws.neon.tech';
    const DB = 'neondb';

    // Reset Neon password
    const resetRes = await fetch(
      `https://console.neon.tech/api/v2/projects/${PROJECT_ID}/branches/${BRANCH_ID}/roles/${ROLE}/reset_password`,
      { method: 'POST', headers: { Authorization: `Bearer ${neonKey}` } }
    );
    const resetData = await resetRes.json();
    const newPass = resetData?.role?.password;

    if (!newPass) {
      results.steps.push({ step: 'reset_password', ok: false, error: 'no password in response' });
      return NextResponse.json({ ...results, ok: false }, { status: 500 });
    }
    results.steps.push({ step: 'reset_password', ok: true });
    results.newPasswordPrefix = newPass.slice(0, 8);

    // Build new DATABASE_URL and update Vercel env
    const newUrl = `postgresql://${ROLE}:${newPass}@${HOST}/${DB}?sslmode=require`;

    for (const [envId, target] of [[envProd, 'production'], [envPreview, 'preview']]) {
      const patchRes = await fetch(
        `https://api.vercel.com/v9/projects/${vercelProjectId}/env/${envId}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${vercelToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ value: newUrl, type: 'encrypted', target: [target] }),
        }
      );
      results.steps.push({ step: `update_vercel_${target}`, ok: patchRes.ok });
    }

    results.changed = true;
    results.message = 'Password rotated and Vercel env updated. Next cold start will use new password.';
    results.duration = Date.now() - start;
    return NextResponse.json({ ok: true, ...results });
  } catch (err: any) {
    results.error = err?.message;
    results.duration = Date.now() - start;
    return NextResponse.json({ ok: false, ...results }, { status: 500 });
  }
}
