/**
 * AGENT alert — Discord-only (no email to save Resend costs)
 * Sends technical error notifications to the admin's Discord channel via webhook.
 * NEVER sends to end users (admin policy: internal only).
 *
 * Mavis (the agent) reads errors at session start via /api/agent/digest
 * — no need to email the agent, they have no inbox.
 */

import { ErrorSeverity, ErrorSource } from './types';

const AGENT_EMAIL = process.env.AGENT_EMAIL || process.env.OWNER_EMAIL || 'contact@examanet.com';
const FROM_ADDRESS = process.env.EMAIL_FROM || 'Examanet Alerts <alerts@examanet.com>';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

interface AgentAlertParams {
  reference: string;
  message: string;
  stack?: string;
  url?: string;
  method?: string;
  userAgent?: string;
  userId?: string;
  userEmail?: string; // The end user who triggered the error (for context, not recipient)
  severity: ErrorSeverity;
  source: ErrorSource;
  context?: Record<string, unknown>;
  region?: string;
  requestId?: string;
}

const SEVERITY_COLORS: Record<ErrorSeverity, { bg: string; text: string; label: string }> = {
  DEBUG: { bg: '#f1f5f9', text: '#475569', label: 'Debug' },
  INFO: { bg: '#dbeafe', text: '#1e40af', label: 'Info' },
  WARNING: { bg: '#fef3c7', text: '#a16207', label: 'Avertissement' },
  ERROR: { bg: '#fee2e2', text: '#b91c1c', label: 'Erreur' },
  CRITICAL: { bg: '#7f1d1d', text: '#ffffff', label: 'Critique' },
};

const SOURCE_LABELS: Record<ErrorSource, string> = {
  CLIENT: 'Navigateur',
  SERVER: 'Serveur',
  BUILD: 'Build',
  CRON: 'Tâche planifiée',
  EXTERNAL: 'Service externe',
};

/**
 * Send agent/operator alert (admin-only, Discord-only)
 * Internal policy: end users are NEVER notified automatically.
 * No email (to save Resend costs). Discord is the only push channel.
 * Mavis (the agent) reads errors at session start via /api/agent/digest.
 */
export async function sendAgentAlert(params: AgentAlertParams): Promise<boolean> {
  // Discord-only (no email). Mavis picks up via /api/agent/digest.
  return sendDiscordAlert(params);
}

/**
 * Discord webhook notification (real-time push to admin)
 * Uses embeds with severity color. Silent for DEBUG/INFO.
 */
async function sendDiscordAlert(params: AgentAlertParams): Promise<boolean> {
  if (!DISCORD_WEBHOOK_URL) return false;

  // Skip noise — only send WARNING+
  if (params.severity === 'DEBUG' || params.severity === 'INFO') return false;

  const sev = SEVERITY_COLORS[params.severity] || SEVERITY_COLORS.ERROR;
  // Convert hex bg color to int for Discord embed
  const colorInt = parseInt(sev.bg.replace('#', ''), 16);

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: 'Source', value: params.source, inline: true },
    { name: 'Method', value: params.method || '—', inline: true },
  ];
  if (params.url) fields.push({ name: 'URL', value: params.url.length > 200 ? params.url.slice(0, 200) + '…' : params.url, inline: false });
  if (params.userEmail) fields.push({ name: 'User', value: params.userEmail, inline: true });
  if (params.region) fields.push({ name: 'Region', value: params.region, inline: true });
  if (params.requestId) fields.push({ name: 'Req ID', value: params.requestId, inline: true });

  const stackPreview = params.stack
    ? params.stack.split('\n').slice(0, 3).join('\n').slice(0, 500)
    : null;

  const embed = {
    title: `${params.severity === 'CRITICAL' ? '🚨' : params.severity === 'ERROR' ? '⚠️' : '⚡'} ${params.reference}`,
    description: `\`\`\`${params.message.slice(0, 500)}\`\`\``,
    color: colorInt,
    fields,
    ...(stackPreview && { footer: { text: stackPreview } }),
    timestamp: new Date().toISOString(),
    author: { name: 'Examanet Alerts' },
  };

  const content = params.severity === 'CRITICAL' ? '🔴 **CRITICAL ERROR**' : params.severity === 'ERROR' ? '🟠 Error detected' : '🟡 Warning';

  try {
    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        embeds: [embed],
        // Suppress @everyone pings; admin only
        allowed_mentions: { parse: [] },
      }),
    });
    if (!res.ok) {
      console.error('[discord-alert] HTTP', res.status, await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[discord-alert] fetch error:', err);
    return false;
  }
}

// DEPRECATED: sendErrorEmail() was removed per admin policy
// End users are NEVER notified automatically
// If you need to email a user manually, use Resend directly
