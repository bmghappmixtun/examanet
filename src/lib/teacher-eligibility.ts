/**
 * Centralized teacher resource-upload eligibility check.
 *
 * 2026-09-15: extracted from src/app/api/teacher/resources/route.ts because the
 * same status check is needed in 3+ endpoints (resources, files, upload). Having
 * one source of truth prevents the bug we just fixed: forgetting a status
 * (PENDING_REVIEW) in one of the endpoints while having it in others.
 */

export type TeacherUploadStatus =
  | 'ACTIVE'
  | 'PENDING_APPROVAL'
  | 'PENDING_FILE_VERIFICATION'
  | 'PENDING_REVIEW';

const NON_PUBLISHING_STATUSES: TeacherUploadStatus[] = [
  'PENDING_APPROVAL',
  'PENDING_FILE_VERIFICATION',
  'PENDING_REVIEW',
];

/**
 * Returns a discriminated union:
 *  - { ok: true } if the teacher is allowed to publish resources
 *  - { ok: false, error, code, status } if not
 */
export function checkTeacherCanPublish(user: {
  role?: string | null;
  status?: string | null;
}): { ok: true } | { ok: false; error: string; code: string; status: string } {
  if (user.role !== 'TEACHER') {
    return { ok: true }; // ADMIN/others — not our concern
  }

  const status = (user.status || '').toUpperCase();

  if (status === 'ACTIVE') {
    return { ok: true };
  }

  if (status === 'PENDING_FILE_VERIFICATION') {
    return {
      ok: false,
      error:
        "Vous devez d'abord soumettre vos 5 fichiers de vérification avant de pouvoir publier des ressources.",
      code: 'PENDING_FILE_VERIFICATION',
      status,
    };
  }

  if (status === 'PENDING_REVIEW') {
    return {
      ok: false,
      error:
        "Vos fichiers de vérification sont en cours d'examen par l'administrateur. Vous pourrez publier dès qu'ils seront approuvés.",
      code: 'PENDING_REVIEW',
      status,
    };
  }

  if (status === 'PENDING_APPROVAL') {
    return {
      ok: false,
      error: "Votre compte est en attente d'approbation par l'administrateur.",
      code: 'PENDING_APPROVAL',
      status,
    };
  }

  // SUSPENDED, BANNED, REJECTED, or anything else = block
  return {
    ok: false,
    error: `Votre compte (${status}) ne peut pas publier de ressources.`,
    code: status || 'UNKNOWN_STATUS',
    status,
  };
}
