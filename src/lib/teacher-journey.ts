// @ts-nocheck
/**
 * Teacher Journey Tracker — 2026-09-13
 *
 * Tracks the onboarding path for BOTH invited teachers and self-signup teachers.
 * Events are inserted into TeacherJourneyEvent and the User.currentJourneyStep
 * is updated for quick dashboard views.
 *
 * Events:
 *   - SELF_SIGNUP_STARTED        : User clicked "Devenir enseignant" (or signup form)
 *   - SELF_SIGNUP_OTP_SENT       : OTP code emailed
 *   - SELF_SIGNUP_OTP_VERIFIED   : User entered OTP, account now ACTIVE
 *   - INVITATION_CREATED         : Admin sent invitation email (5 files button)
 *   - INVITATION_OPENED          : User clicked activation link in email
 *   - ACTIVATION_SUBMITTED       : User set password, account created
 *   - FIRST_LOGIN                : First successful login
 *   - PROFILE_SAVED              : Profile fields updated
 *   - FILES_UPLOADED            : Uploaded a resource file
 *   - VERIFICATION_PAGE_VIEWED   : Visited /enseignant/verification
 *   - VERIFICATION_FILES_SUBMITTED : Uploaded ID/cert files
 *   - VERIFICATION_APPROVED      : Admin approved
 *   - VERIFICATION_REJECTED      : Admin rejected
 */

export type JourneyEventType =
  | 'SELF_SIGNUP_STARTED'
  | 'SELF_SIGNUP_OTP_SENT'
  | 'SELF_SIGNUP_OTP_VERIFIED'
  | 'INVITATION_CREATED'
  | 'INVITATION_OPENED'
  | 'ACTIVATION_SUBMITTED'
  | 'FIRST_LOGIN'
  | 'PROFILE_SAVED'
  | 'FILES_UPLOADED'
  | 'VERIFICATION_PAGE_VIEWED'
  | 'VERIFICATION_FILES_SUBMITTED'
  | 'VERIFICATION_APPROVED'
  | 'VERIFICATION_REJECTED';

const JOURNEY_ORDER: JourneyEventType[] = [
  'SELF_SIGNUP_STARTED',
  'SELF_SIGNUP_OTP_SENT',
  'SELF_SIGNUP_OTP_VERIFIED',
  'INVITATION_CREATED',
  'INVITATION_OPENED',
  'ACTIVATION_SUBMITTED',
  'FIRST_LOGIN',
  'PROFILE_SAVED',
  'FILES_UPLOADED',
  'VERIFICATION_PAGE_VIEWED',
  'VERIFICATION_FILES_SUBMITTED',
  'VERIFICATION_APPROVED',
  'VERIFICATION_REJECTED',
];

// Pretty labels for admin UI
export const JOURNEY_LABELS: Record<JourneyEventType, { fr: string; icon: string; color: string }> = {
  SELF_SIGNUP_STARTED:        { fr: 'Auto-inscription démarrée',       icon: '✍️', color: 'sky'    },
  SELF_SIGNUP_OTP_SENT:       { fr: 'Code OTP envoyé',                  icon: '📧', color: 'sky'    },
  SELF_SIGNUP_OTP_VERIFIED:   { fr: 'Email vérifié (OTP)',             icon: '✅', color: 'emerald'},
  INVITATION_CREATED:         { fr: 'Invitation créée par admin',      icon: '📨', color: 'violet' },
  INVITATION_OPENED:          { fr: 'Email d\'invitation ouvert',      icon: '📬', color: 'violet' },
  ACTIVATION_SUBMITTED:       { fr: 'Compte activé (password set)',   icon: '🔓', color: 'emerald'},
  FIRST_LOGIN:                { fr: 'Première connexion',              icon: '👋', color: 'emerald'},
  PROFILE_SAVED:              { fr: 'Profil mis à jour',               icon: '👤', color: 'sky'    },
  FILES_UPLOADED:             { fr: 'Fichier ressource uploadé',      icon: '📤', color: 'sky'    },
  VERIFICATION_PAGE_VIEWED:   { fr: 'Page vérification visitée',       icon: '🔍', color: 'amber'  },
  VERIFICATION_FILES_SUBMITTED:{ fr: 'Fichiers de vérification soumis', icon: '📋', color: 'amber'  },
  VERIFICATION_APPROVED:      { fr: 'Vérification approuvée',          icon: '🎉', color: 'emerald'},
  VERIFICATION_REJECTED:      { fr: 'Vérification rejetée',            icon: '❌', color: 'red'    },
};

interface TrackOpts {
  page?: string;
  metadata?: Record<string, any>;
  req?: Request | any; // NextRequest
  teacherId?: string; // override (used when tracking by invitation before user exists)
}

function genId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 25);
}

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.DB;
}

export async function trackJourney(
  teacherIdOrEmail: string,
  eventType: JourneyEventType,
  opts: TrackOpts = {}
): Promise<void> {
  try {
    const db = await getD1();
    if (!db) {
      console.warn('[journey] DB unavailable, skipping event', eventType);
      return;
    }

    // Resolve teacherId from email if needed (some events fire before we have teacherId)
    let teacherId = opts.teacherId || teacherIdOrEmail;
    if (!opts.teacherId && teacherIdOrEmail.includes('@')) {
      const u: any = await db
        .prepare('SELECT id FROM User WHERE email = ? LIMIT 1')
        .bind(teacherIdOrEmail.toLowerCase())
        .first();
      if (u?.id) teacherId = u.id;
      else {
        console.warn('[journey] cannot resolve teacherId from email', teacherIdOrEmail);
        return;
      }
    }

    const ip =
      opts.req?.headers?.get?.('x-forwarded-for')?.split(',')[0]?.trim() ||
      opts.req?.headers?.get?.('x-real-ip') ||
      null;
    const ua = opts.req?.headers?.get?.('user-agent') || null;
    const now = Date.now();

    // 1) Insert event row
    await db
      .prepare(
        `INSERT INTO TeacherJourneyEvent (id, teacherId, eventType, page, metadata, ipAddress, userAgent, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        genId(),
        teacherId,
        eventType,
        opts.page || null,
        opts.metadata ? JSON.stringify(opts.metadata) : null,
        ip,
        ua,
        now
      )
      .run();

    // 2) Update User.currentJourneyStep + lastJourneyAt (best-effort)
    await db
      .prepare('UPDATE User SET currentJourneyStep = ?, lastJourneyAt = ? WHERE id = ?')
      .bind(eventType, now, teacherId)
      .run()
      .catch(() => {
        // If the migration hasn't been applied yet, swallow the error
      });
  } catch (e: any) {
    // Journey tracking must NEVER break the parent flow
    console.warn('[journey] failed to track event', eventType, e?.message);
  }
}

/**
 * Fetch all events for a teacher, ordered chronologically.
 * Used by the admin UI to display the timeline.
 */
export async function getTeacherJourney(teacherId: string) {
  const db = await getD1();
  if (!db) return [];

  const r: any = await db
    .prepare(
      `SELECT id, eventType, page, metadata, ipAddress, userAgent, createdAt
       FROM TeacherJourneyEvent
       WHERE teacherId = ?
       ORDER BY createdAt ASC`
    )
    .bind(teacherId)
    .all();

  return (r?.results || []).map((e: any) => ({
    ...e,
    metadata: e.metadata ? safeParse(e.metadata) : null,
  }));
}

function safeParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * Determine the latest "happy path" step a teacher is on,
 * based on the events they've recorded.
 * Returns the next step they need to take.
 */
export function getNextRequiredStep(events: { eventType: JourneyEventType }[]): JourneyEventType | null {
  const completed = new Set(events.map((e) => e.eventType));
  for (const step of JOURNEY_ORDER) {
    if (!completed.has(step)) return step;
  }
  return null;
}

export const JOURNEY_FLOW = JOURNEY_ORDER;
