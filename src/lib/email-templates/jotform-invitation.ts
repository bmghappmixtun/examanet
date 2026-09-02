/**
 * Email template for inviting new profs (who already sent files via Jotform).
 *
 * Two variants based on the source site:
 *  - "devoirat"        → profs from devoirat.net (lycée focus)
 *  - "tunisiecollege"  → profs from tunisiecollege.net (collège focus)
 *
 * Variables:
 *  - firstName     : prénom du prof
 *  - site          : "devoirat" | "tunisiecollege"
 *  - siteName      : display name "devoirat.net" | "tunisiecollege.net"
 *  - acceptUrl     : lien d'activation
 *  - unsubscribeUrl: lien de désinscription
 *  - customMessage : message admin optionnel
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
const EMAIL_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif";

function htmlEscape(s: string): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export type SourceSite = 'devoirat' | 'tunisiecollege';

const SITE_CONFIG: Record<
  SourceSite,
  {
    displayName: string;
    greeting: string;
    subject: string;
    intro: string;
    hook: string;
    benefits: { emoji: string; title: string; text: string }[];
    studentsHook: string;
    contextLine: string;
    contextLine2: string;
    platformHook: string;
  }
> = {
  devoirat: {
    displayName: 'devoirat.net',
    greeting: 'Une plateforme 100% gratuite attend vos ressources — examanet.com',
    subject: 'Une plateforme 100% gratuite attend vos ressources — examanet.com',
    intro:
      "Je suis B.Mehdi, fondateur et administrateur de devoirat.net — la plateforme qui, grâce à des profs comme vous, a déjà accompagné des milliers d'élèves tunisiens.",
    hook:
      "Chaque devoir, chaque série, chaque cours que vous nous avez envoyés via Jotform a atterri dans les mains d'un élève qui en avait besoin.",
    contextLine:
      "Vous ne le savez peut-être pas, mais :\n  → Vos fichiers ont été téléchargés des milliers de fois\n  → Des profs dans d'autres régions les ont réutilisés\n  → Des élèves ont révisé grâce à vous la veille du BAC",
    platformHook:
      "J'ai le plaisir de vous présenter <strong>examanet.com</strong> : une toute nouvelle plateforme 100% gratuite, tunisienne, conçue PAR les profs POUR les profs (et leurs élèves).",
    benefits: [
      {
        emoji: '🏷️',
        title: 'Crédité automatiquement',
        text:
          'Votre nom est AUTOMATIQUEMENT crédité sur chaque ressource (fini le "prof inconnu")',
      },
      {
        emoji: '🔍',
        title: 'Recherchable en 2 clics',
        text:
          'Vos fichiers sont recherchables par classe, matière, type — les élèves vous trouvent en 2 clics',
      },
      {
        emoji: '📊',
        title: 'Dashboard prof',
        text:
          'Tableau de bord prof : stats de téléchargements, likes, feedback en temps réel',
      },
      {
        emoji: '🚀',
        title: 'Plus de Jotform',
        text: 'Plus de Jotform : tout se fait directement sur la plateforme',
      },
    ],
    studentsHook:
      "Apprendre d'un prof qu'ils connaissent, pas d'un \"auteur anonyme\"",
    contextLine2: "Ce que vous faites, ça compte. Et on voulait vous le dire enfin, en face (enfin, par écrit).",
  },
  tunisiecollege: {
    displayName: 'tunisiecollege.net',
    greeting: 'Vos ressources méritent d\'être vues — rejoignez examanet.com 🎓',
    subject: 'Vos ressources méritent d\'être vues — rejoignez examanet.com 🎓',
    intro:
      "Je suis B.Mehdi, fondateur et administrateur de tunisiecollege.net — la plateforme collège n°1 en Tunisie pour les profs et leurs élèves.",
    hook:
      "Vos contributions via Jotform ont fait de tunisiecollege ce qu'il est aujourd'hui. Vos contrôles, vos séries, vos cours ont accompagné des générations de collégiens à travers tout le pays.",
    contextLine:
      "Je ne sais pas si on vous l'a déjà dit, mais :\n  → Vos ressources ont été vues des centaines de milliers de fois par des élèves de 7ème, 8ème, 9ème\n  → Des profs d'autres écoles ont adapté vos contenus\n  → Vous avez contribué, sans le savoir, à réduire les inégalités d'accès à un bon niveau pédagogique",
    platformHook:
      "J'ai l'honneur de vous présenter <strong>examanet.com</strong> : une plateforme 100% gratuite, pensée par et pour les profs tunisiens.",
    benefits: [
      {
        emoji: '🏷️',
        title: 'Crédité automatiquement',
        text: 'Crédité automatiquement sur chaque ressource',
      },
      {
        emoji: '📊',
        title: 'Dashboard prof',
        text: 'Dashboard prof : téléchargements, likes, retours',
      },
      {
        emoji: '🚀',
        title: 'Upload direct',
        text: 'Upload direct, plus de Jotform',
      },
      {
        emoji: '🛡️',
        title: 'Contenus protégés',
        text: 'Contenus protégés, signés, organisés',
      },
    ],
    studentsHook: 'Favoris, commentaires, suivi de progression',
    contextLine2: 'Vous comptez. Et on voulait vous le dire.',
  },
};

export function renderJotformInvitationEmail(args: {
  firstName: string;
  site: SourceSite;
  acceptUrl: string;
  unsubscribeUrl?: string;
  customMessage?: string | null;
}): string {
  const { firstName, site, acceptUrl, unsubscribeUrl, customMessage } = args;
  const cfg = SITE_CONFIG[site];
  const safeFirst = htmlEscape(firstName);
  const safeSiteName = htmlEscape(cfg.displayName);
  const safeAcceptUrl = htmlEscape(acceptUrl);
  const safeUnsub = unsubscribeUrl ? htmlEscape(unsubscribeUrl) : `${SITE_URL}/desinscrire`;
  const safeCustom = customMessage ? htmlEscape(customMessage).replace(/\n/g, '<br>') : '';

  // Section "Où on en est" (stats)
  const statsBlock = `
    <div style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);border-radius:16px;padding:24px;margin:24px 0">
      <div style="font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px">📊 OÙ ON EN EST AUJOURD'HUI</div>
      <div style="color:white;font-size:15px;line-height:1.9">
        → 14 000+ ressources indexées<br>
        → Collège + Lycée, 11 matières<br>
        → Français, Arabe, Anglais, Sciences, Maths…<br>
        → Et ça continue, grâce à des profs comme vous.
      </div>
    </div>`;

  // Custom message box
  const customBlock = safeCustom
    ? `<div style="background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);border-left:4px solid #f59e0b;padding:16px 20px;border-radius:8px;margin-bottom:28px"><p style="margin:0;color:#78350f;font-size:14px;line-height:1.6;font-style:italic">${safeCustom}</p></div>`
    : '';

  // Benefits grid (2x2)
  const benefitsHTML = cfg.benefits
    .map(
      (b) => `
      <td style="width:50%;padding:6px;vertical-align:top">
        <div style="background:white;border:2px solid #e9d5ff;border-radius:12px;padding:14px;height:100%">
          <div style="font-size:24px;margin-bottom:6px">${b.emoji}</div>
          <div style="font-weight:800;color:#0f172a;font-size:14px;margin-bottom:4px">${htmlEscape(b.title)}</div>
          <div style="color:#475569;font-size:13px;line-height:1.4">${b.text}</div>
        </div>
      </td>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${htmlEscape(cfg.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:${EMAIL_FONT_STACK};color:#0f172a">
<div style="display:none;max-height:0;overflow:hidden">${safeFirst}, rejoignez gratuitement Examanet — la plateforme pédagogique #1 en Tunisie</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%">

  <!-- HERO HEADER -->
  <tr><td>
    <div style="background:linear-gradient(135deg,#7c3aed 0%,#a855f7 50%,#ec4899 100%);border-radius:20px 20px 0 0;padding:48px 32px;text-align:center;position:relative;overflow:hidden">
      <div style="position:absolute;top:20px;left:20px;font-size:32px;opacity:0.4">✨</div>
      <div style="position:absolute;top:32px;right:24px;font-size:28px;opacity:0.4">🎓</div>
      <div style="position:absolute;bottom:24px;left:32px;font-size:24px;opacity:0.4">📚</div>
      <div style="position:absolute;bottom:32px;right:20px;font-size:28px;opacity:0.4">⭐</div>

      <div style="display:inline-block;background:rgba(255,255,255,0.18);padding:6px 14px;border-radius:999px;color:white;font-size:12px;font-weight:700;letter-spacing:1px;backdrop-filter:blur(8px)">EXAMANET × ${safeSiteName.toUpperCase()}</div>

      <h1 style="margin:20px 0 0;color:white;font-size:30px;line-height:1.2;font-weight:800;letter-spacing:-0.5px">
        On a quelque chose à vous dire.
      </h1>
      <p style="margin:14px auto 0;color:rgba(255,255,255,0.95);font-size:16px;line-height:1.5;max-width:480px">
        ${site === 'devoirat'
          ? 'Vous êtes déjà prof ici. Devenez prof là-bas aussi.'
          : 'Une plateforme pensée par et pour les profs tunisiens.'}
      </p>
    </div>
  </td></tr>

  <!-- BODY -->
  <tr><td style="background:white;padding:40px 32px 32px">

    ${customBlock}

    <p style="margin:0 0 16px 0;font-size:17px;line-height:1.6;color:#0f172a">Bonjour <strong style="color:#7c3aed">${safeFirst}</strong> 👋</p>

    <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:#334155">
      ${cfg.intro}
    </p>

    <!-- "D'ABORD MERCI" block -->
    <div style="background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);border-left:4px solid #f59e0b;border-radius:12px;padding:20px 24px;margin:24px 0">
      <div style="font-size:18px;font-weight:800;color:#78350f;margin-bottom:8px">🙏 D'ABORD : MERCI. VRAIMENT.</div>
      <p style="margin:0 0 8px 0;color:#78350f;font-size:15px;line-height:1.6">${cfg.hook}</p>
      <p style="margin:8px 0 0 0;color:#78350f;font-size:14px;line-height:1.8;white-space:pre-line">${cfg.contextLine}</p>
      <p style="margin:8px 0 0 0;color:#78350f;font-size:14px;font-weight:600;font-style:italic">${cfg.contextLine2}</p>
    </div>

    <!-- TODAY we go further -->
    <h2 style="margin:32px 0 16px;color:#0f172a;font-size:22px;font-weight:800;letter-spacing:-0.3px">
      🚀 Aujourd'hui, on passe à la suivante.
    </h2>
    <p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;color:#334155">
      ${cfg.platformHook}
    </p>

    <!-- GIFTS FOR YOU -->
    <div style="background:linear-gradient(135deg,#faf5ff 0%,#fef3c7 100%);border-radius:16px;padding:24px;margin:24px 0">
      <div style="font-size:12px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px">🎁 CE QUE ÇA CHANGE POUR VOUS</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>${benefitsHTML}</tr>
      </table>
    </div>

    <!-- FOR STUDENTS -->
    <div style="background:linear-gradient(135deg,#dbeafe 0%,#bfdbfe 100%);border-radius:16px;padding:24px;margin:24px 0">
      <div style="font-size:12px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px">🌍 CE QUE ÇA CHANGE POUR LES ÉLÈVES</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="width:50%;padding:6px;vertical-align:top">
            <div style="background:white;border-radius:12px;padding:14px;height:100%">
              <div style="font-size:24px;margin-bottom:6px">📚</div>
              <div style="font-weight:800;color:#0f172a;font-size:14px;margin-bottom:4px">100% gratuit</div>
              <div style="color:#475569;font-size:13px;line-height:1.4">Accès gratuit à TOUTES les ressources</div>
            </div>
          </td>
          <td style="width:50%;padding:6px;vertical-align:top">
            <div style="background:white;border-radius:12px;padding:14px;height:100%">
              <div style="font-size:24px;margin-bottom:6px">⚡</div>
              <div style="font-weight:800;color:#0f172a;font-size:14px;margin-bottom:4px">Recherche rapide</div>
              <div style="color:#475569;font-size:13px;line-height:1.4">matière × niveau × type en 2 clics</div>
            </div>
          </td>
        </tr>
        <tr>
          <td style="width:50%;padding:6px;vertical-align:top">
            <div style="background:white;border-radius:12px;padding:14px;height:100%">
              <div style="font-size:24px;margin-bottom:6px">📱</div>
              <div style="font-weight:800;color:#0f172a;font-size:14px;margin-bottom:4px">Optimisé mobile</div>
              <div style="color:#475569;font-size:13px;line-height:1.4">90% des élèves sont sur téléphone</div>
            </div>
          </td>
          <td style="width:50%;padding:6px;vertical-align:top">
            <div style="background:white;border-radius:12px;padding:14px;height:100%">
              <div style="font-size:24px;margin-bottom:6px">⭐</div>
              <div style="font-weight:800;color:#0f172a;font-size:14px;margin-bottom:4px">Favoris + suivi</div>
              <div style="color:#475569;font-size:13px;line-height:1.4">${cfg.studentsHook}</div>
            </div>
          </td>
        </tr>
      </table>
    </div>

    ${statsBlock}

    <!-- CTA -->
    <div style="text-align:center;margin:32px 0 12px">
      <a href="${safeAcceptUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed 0%,#ec4899 100%);color:white;text-decoration:none;padding:20px 48px;border-radius:14px;font-size:18px;font-weight:800;letter-spacing:0.3px;box-shadow:0 12px 28px rgba(124,58,237,0.35);text-transform:uppercase">Rejoindre Examanet →</a>
      <div style="margin-top:12px;font-size:13px;color:#64748b">Gratuit · 2 minutes · Aucun engagement</div>
    </div>

    <!-- Secondary CTA: discover all benefits -->
    <div style="text-align:center;margin:16px 0 0">
      <a href="${SITE_URL}/enseignants/rejoindre" style="display:inline-block;background:transparent;color:#7c3aed;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:700;border:2px solid #e9d5ff">
        Découvrir tous les avantages pour les enseignants →
      </a>
    </div>

    <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#64748b;text-align:center;font-style:italic">
      Vous gardez votre historique ${safeSiteName}.<br>
      Vous choisissez ce que vous voulez rendre public. Et c'est tout.
    </p>

  </td></tr>

  <!-- FOOTER -->
  <tr><td>
    <div style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);border-radius:0 0 20px 20px;padding:28px 32px;text-align:center">
      <p style="margin:0 0 8px;color:white;font-size:15px;font-weight:600">B.Mehdi</p>
      <p style="margin:0 0 4px;color:rgba(255,255,255,0.7);font-size:13px">Administrateur · ${safeSiteName}</p>
      <p style="margin:0 0 16px;color:rgba(255,255,255,0.7);font-size:13px">Co-fondateur · Examanet</p>
      <div style="border-top:1px solid rgba(255,255,255,0.15);padding-top:14px;margin-top:8px">
        <p style="margin:0;color:rgba(255,255,255,0.5);font-size:11px;line-height:1.5">
          Vous recevez cet email car vous nous avez déjà transmis des ressources via Jotform.<br>
          <a href="${safeUnsub}" style="color:rgba(255,255,255,0.7);text-decoration:underline">Se désinscrire</a> · <a href="${SITE_URL}" style="color:rgba(255,255,255,0.7);text-decoration:underline">${SITE_URL}</a>
        </p>
      </div>
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
