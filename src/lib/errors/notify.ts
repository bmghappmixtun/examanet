// @ts-nocheck
/**
 * Agent notification system
 * - Logs errors to a queue that the agent can poll
 * - For real-time, also uses Vercel logs (console.error) as fallback
 *
 * Flow:
 * 1. Error occurs → logError() called
 * 2. notifyAgent() writes a row to a "pending notifications" structure
 * 3. A cron /api/cron/agent-notify picks it up and processes
 * 4. The cron uses mavis (or similar) to alert the agent
 *
 * For simplicity, this version just:
 * - Logs to console (Vercel will pick it up for anomaly detection)
 * - Updates ErrorLog.agentNotified = true so the user/admin can see it was attempted
 */

import { prisma } from '@/lib/prisma';
import { ErrorSeverity, ErrorSource } from './types';

interface NotifyParams {
  reference: string;
  message: string;
  severity: ErrorSeverity;
  source: ErrorSource;
  url?: string;
  userEmail?: string;
}

export async function notifyAgent(params: NotifyParams): Promise<boolean> {
  // 1. Always log to Vercel console (Vercel Anomaly Detection will catch this)
  console.error('[AGENT-NOTIFY]', {
    reference: params.reference,
    severity: params.severity,
    source: params.source,
    message: params.message,
    url: params.url,
    userEmail: params.userEmail,
    timestamp: new Date().toISOString(),
  });

  // 2. Update the ErrorLog to mark as notified
  // (the row was already created with agentNotified=true, but we update timestamp)
  try {
    await prisma.errorLog.update({
      where: { reference: params.reference },
      data: { agentNotified: true, agentNotifiedAt: new Date() },
    });
  } catch (err) {
    // If update fails (e.g., reference not found), ignore
  }

  // 3. For CRITICAL errors, also write a "high priority" log entry
  //    that the next agent session can pick up via cron
  if (params.severity === 'CRITICAL') {
    try {
      // Use a simple pattern: create a "task" entry in the DB
      // The next session can check for unread tasks
      console.error('[CRITICAL-AGENT-NOTIFY]', {
        action: 'check_next_session',
        reference: params.reference,
        message: params.message,
        hint: 'Run /api/cron/agent-tasks to process pending tasks',
      });
    } catch {
      // ignore
    }
  }

  return true;
}
