/**
 * Shared email shell — Gmail/Outlook/Apple Mail compatible HTML wrapper.
 *
 * Why a shared shell?
 * - One source of truth for the font stack (Gmail-recommended)
 * - One place to update meta tags, smoothing, footer
 * - Forces every email to look the same
 *
 * Usage:
 *   return renderEmailShell({
 *     accent: 'green',           // green | red | blue | amber | gray
 *     icon: '✅',
 *     title: 'Ressource approuvée !',
 *     subtitle: 'Votre ressource est maintenant en ligne',
 *     preheader: 'Approuvée le 15 juillet',
 *     body: '<p>Votre contenu</p>',
 *   });
 */

export const EMAIL_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif";

export type EmailAccent = 'green' | 'red' | 'blue' | 'amber' | 'violet' | 'gray';

const ACCENT_BADGE: Record<EmailAccent, string> = {
  green: '#10B981',
  red: '#EF4444',
  blue: '#3B82F6',
  amber: '#F59E0B',
  violet: '#8B5CF6',
  gray: '#64748B',
};

const ACCENT_BG: Record<EmailAccent, string> = {
  green: 'linear-gradient(135deg,#D1FAE5,#A7F3D0)',
  red: 'linear-gradient(135deg,#FEE2E2,#FECACA)',
  blue: 'linear-gradient(135deg,#DBEAFE,#BFDBFE)',
  amber: 'linear-gradient(135deg,#FEF3C7,#FDE68A)',
  violet: 'linear-gradient(135deg,#EDE9FE,#DDD6FE)',
  gray: 'linear-gradient(135deg,#F1F5F9,#E2E8F0)',
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';

export interface EmailShellOpts {
  /** Accent color theme */
  accent: EmailAccent;
  /** Big emoji displayed in the circle (e.g. '✅', '❌', '🔐') */
  icon: string;
  /** Main title in the white header */
  title: string;
  /** Subtitle below the title */
  subtitle?: string;
  /** Hidden preheader text (shows in inbox preview, 0 visible in body) */
  preheader?: string;
  /** Main body HTML (already escaped if needed) */
  body: string;
  /** Optional footer override */
  footer?: string;
  /** Card max-width in px (default 540) */
  maxWidth?: number;
}

/**
 * Wraps body HTML with the standard Examanet email chrome:
 * - Meta tags (charset, viewport)
 * - Gmail-safe font stack with smoothing
 * - White header with logo + icon + title
 * - Body content
 * - Light footer with branding
 */
export function renderEmailShell(opts: EmailShellOpts): string {
  const accentColor = ACCENT_BADGE[opts.accent];
  const accentBg = ACCENT_BG[opts.accent];
  const maxWidth = opts.maxWidth ?? 540;
  const F = EMAIL_FONT_STACK;

  const footer =
    opts.footer ??
    `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${F};">
      <tr>
        <td style="font-family:${F};">
          <div style="font-weight:700;color:#0F172A;font-size:14px;letter-spacing:-0.2px;font-family:${F};">Examanet</div>
          <div style="color:#94A3B8;font-size:12px;margin-top:2px;font-family:${F};">Plateforme pédagogique #1 en Tunisie</div>
        </td>
        <td align="right" style="color:#94A3B8;font-size:11px;font-family:${F};">
          Conçu avec ❤️<br>pour les élèves tunisiens
        </td>
      </tr>
    </table>
  `;

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${opts.preheader ? `<span style="display:none;font-size:1px;color:#F1F5F9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${opts.preheader}</span>` : ''}
</head><body style="margin:0;font-family:${F};background:#F1F5F9;padding:0;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:40px 20px;">
<tr><td align="center">
<table role="presentation" width="${maxWidth}" cellpadding="0" cellspacing="0" style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);font-family:${F};">
  <!-- Brand bar (logo in a gray pill) -->
  <tr><td style="background:#FFFFFF;padding:24px 32px 16px;text-align:center;font-family:${F};">
    <div style="display:inline-block;background:#F8FAFC;padding:10px 16px;border-radius:8px;">
      <img src="${SITE_URL}/logo-transparent.png" alt="Examanet" width="80" height="22" style="display:block;border:0;outline:none;text-decoration:none;vertical-align:middle;" />
    </div>
  </td></tr>
  <!-- Content area (icon + title + subtitle) -->
  <tr><td style="background:#FFFFFF;padding:36px 32px 28px;font-family:${F};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px 0;">
      <tr><td align="center">
        <div style="width:32px;height:32px;background:${accentBg};border-radius:50%;line-height:32px;text-align:center;font-size:16px;">${opts.icon}</div>
      </td></tr>
    </table>
    <h1 style="margin:0;color:#0F172A;font-size:22px;font-weight:700;letter-spacing:-0.4px;font-family:${F};text-align:center;">${opts.title}</h1>
    ${opts.subtitle ? `<p style="margin:6px 0 0;color:#64748B;font-size:13px;font-weight:400;font-family:${F};text-align:center;">${opts.subtitle}</p>` : ''}
  </td></tr>
  <tr><td style="padding:32px;font-family:${F};">
    ${opts.body}
  </td></tr>
  <tr><td style="background:#F8FAFC;padding:20px 32px;border-top:1px solid #E2E8F0;font-family:${F};">
    ${footer}
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

/** Convenience: bold a string in a way that's safe for emails (no <strong> styling issues) */
export function bold(text: string): string {
  return `<strong style="color:#0F172A;">${text}</strong>`;
}

/** Convenience: muted paragraph style */
export function muted(text: string): string {
  return `<p style="margin:0 0 8px;color:#475569;font-size:14px;line-height:1.65;font-family:${EMAIL_FONT_STACK};">${text}</p>`;
}

/** Convenience: primary paragraph style */
export function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.65;font-family:${EMAIL_FONT_STACK};">${text}</p>`;
}

/** Convenience: primary CTA button */
export function ctaButton(href: string, label: string, accent: EmailAccent = 'green'): string {
  const color = ACCENT_BADGE[accent];
  return `<div style="text-align:center;margin:0 0 8px;font-family:${EMAIL_FONT_STACK};">
  <a href="${href}" style="display:inline-block;background:${color};color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;font-family:${EMAIL_FONT_STACK};line-height:1.2;">${label}</a>
</div>`;
}

/** Convenience: info card with title + content */
export function infoCard(badge: string, content: string, accent: EmailAccent = 'green'): string {
  const color = ACCENT_BADGE[accent];
  return `<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:18px 20px;margin:0 0 24px;font-family:${EMAIL_FONT_STACK};">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:${color};margin-bottom:6px;font-family:${EMAIL_FONT_STACK};">${badge}</div>
  <div style="font-weight:600;color:#0F172A;font-size:15px;line-height:1.5;word-break:break-word;font-family:${EMAIL_FONT_STACK};">${content}</div>
</div>`;
}
