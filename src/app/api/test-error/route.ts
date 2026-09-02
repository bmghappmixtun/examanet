// @ts-nocheck
/**
 * Test error endpoint — DELETE THIS after testing
 * Triggers different error types to verify the admin error pipeline
 *
 * - ?type=db       → triggers a database error
 * - ?type=server   → triggers an unhandled server error
 * - ?type=critical → triggers a CRITICAL alert (force send to admin)
 * - ?type=warning  → triggers a WARNING (logged but NO alert)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/errors/with-error-handler';
import { logError } from '@/lib/errors/logger';
import { generateErrorReference } from '@/lib/errors/types';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const type = req.nextUrl.searchParams.get('type') || 'server';

  if (type === 'db') {
    const result = await prisma.$queryRaw`SELECT * FROM nonexistent_table_${Date.now()}`;
    return NextResponse.json({ result });
  }

  if (type === 'critical') {
    // Force a CRITICAL alert (admin only)
    await logError({
      reference: generateErrorReference(),
      source: 'EXTERNAL',
      severity: 'CRITICAL',
      message: 'TEST: Critical admin alert from /api/test-error',
      stack: 'Test stack trace\n  at test() in route.ts',
      url: req.url,
      context: {
        action: 'test-critical',
        testRun: true,
      },
    });
    return NextResponse.json({ ok: true, message: 'CRITICAL alert sent to admin' });
  }

  if (type === 'warning') {
    // WARNING — logged to DB but NO email (admin policy: avoid noise)
    await logError({
      reference: generateErrorReference(),
      source: 'EXTERNAL',
      severity: 'WARNING',
      message: 'TEST: Warning from /api/test-error (no email, just DB log)',
      context: { action: 'test-warning' },
    });
    return NextResponse.json({ ok: true, message: 'Warning logged (no email)' });
  }

  if (type === 'unhandled' || type === 'server') {
    // Throws — caught by withErrorHandler
    throw new Error('TEST: Unhandled server error for error handling verification');
  }

  return NextResponse.json({
    ok: true,
    hint: 'Use ?type=db|critical|warning|unhandled',
  });
}, { action: 'test-error' });
