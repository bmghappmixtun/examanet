// @ts-nocheck
/**
 * Server-side error logger
 * Logs errors to the database + sends AGENT alert email
 * NEVER sends email to end users (admin-only policy)

Flow:
- Always: save to DB
- Always (ERROR/CRITICAL): send agent alert email (technical, to AGENT_EMAIL)
- Always: console.error to Vercel logs (for Vercel Anomaly Detection)
- Never: send email to end users (admin policy: internal only)
 */

import { prisma } from '@/lib/prisma';
import { sendAgentAlert } from './email';
import { notifyAgent } from './notify';
import {
  ErrorReport,
  ErrorSource,
  ErrorSeverity,
  generateErrorReference,
} from './types';

interface LogResult {
  reference: string;
  errorId: string;
  agentAlertSent: boolean;
  agentNotified: boolean;
}

export async function logError(report: ErrorReport): Promise<LogResult> {
  const reference = report.reference || generateErrorReference();
  const severity = report.severity || 'ERROR';
  const source: ErrorSource = report.source;
  // Agent alert: sent for ERROR/CRITICAL, or if explicitly forced via context.alertAgent
  const shouldAlertAgent = severity === 'ERROR' || severity === 'CRITICAL' || report.context?.alertAgent === true;

  let errorId = '';
  let userEmail: string | undefined;
  let userId: string | undefined;
  let agentAlertSent = false;
  let agentNotified = false;

  // Extract user info from context (for DB tracking, NOT for emailing)
  userEmail = (report.context?.userEmail as string) || undefined;
  userId = (report.context?.userId as string) || undefined;

  // 1. Save to database
  try {
    const errorLog = await prisma.errorLog.create({
      data: {
        reference,
        source,
        severity,
        message: report.message.slice(0, 1000),
        stack: report.stack?.slice(0, 5000),
        url: report.url,
        method: report.method,
        userAgent: report.userAgent,
        userId,
        userEmail, // tracked in DB, not used for email
        requestId: report.requestId,
        region: report.region,
        context: (report.context || {}) as any,
        emailSent: false, // never email users
        agentNotified: shouldAlertAgent,
        agentNotifiedAt: shouldAlertAgent ? new Date() : null,
      },
    });
    errorId = errorLog.id;
  } catch (dbErr) {
    console.error('[error-logger] Failed to save error to DB:', dbErr);
    console.error('[error-logger] Original error:', {
      reference, source, severity, message: report.message, url: report.url,
    });
  }

  // 2. Send AGENT alert (admin only — never to end users)
  if (shouldAlertAgent) {
    try {
      await sendAgentAlert({
        reference,
        message: report.message,
        stack: report.stack,
        url: report.url,
        method: report.method,
        userAgent: report.userAgent,
        userId,
        userEmail, // included in admin alert for context (which user hit it)
        severity,
        source,
        context: report.context,
        region: report.context?.region as string | undefined,
        requestId: report.context?.requestId as string | undefined,
      });
      agentAlertSent = true;
    } catch (alertErr) {
      console.error('[error-logger] Failed to send agent alert:', alertErr);
    }
  }

  // 3. Always log to console (Vercel will pick this up)
  console.error('[ERROR]', {
    reference,
    severity,
    source,
    message: report.message,
    url: report.url,
    userId,
    userEmail,
    agentAlertSent,
  });

  // 4. Notify via mavis (future: poll queue)
  if (shouldAlertAgent) {
    try {
      await notifyAgent({
        reference,
        message: report.message,
        severity,
        source,
        url: report.url,
        userEmail,
      });
      agentNotified = true;
    } catch (notifyErr) {
      console.error('[error-logger] Failed to notify agent:', notifyErr);
    }
  }

  return { reference, errorId, agentAlertSent, agentNotified };
}

// withErrorHandler wrapper
export async function withErrorHandler<T>(
  fn: () => Promise<T>,
  context: {
    req?: Request;
    userId?: string;
    userEmail?: string;
    action?: string;
  } = {}
): Promise<{ ok: true; data: T } | { ok: false; error: string; reference: string }> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err: any) {
    const reference = generateErrorReference();
    console.error(`[${reference}] ${context.action || 'API error'}:`, err);

    await logError({
      reference,
      source: 'SERVER',
      severity: 'ERROR',
      message: err?.message || 'Unknown error',
      stack: err?.stack,
      url: context.req?.url,
      method: context.req?.method,
      userAgent: context.req?.headers.get('user-agent') || undefined,
      context: {
        userId: context.userId,
        userEmail: context.userEmail,
        action: context.action,
      },
    });

    return {
      ok: false,
      error: 'Une erreur est survenue. Réessayez ou contactez le support si le problème persiste.',
      reference,
    };
  }
}
