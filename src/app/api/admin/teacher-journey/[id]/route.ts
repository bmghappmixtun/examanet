// @ts-nocheck
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getTeacherJourney, JOURNEY_LABELS, JOURNEY_FLOW, getNextRequiredStep } from '@/lib/teacher-journey';
import { d1First } from '@/lib/db-d1';

/**
 * GET /api/admin/teacher-journey/[id]
 *
 * Returns the teacher's onboarding journey (timeline of events) for the admin UI.
 * Returns:
 *   - teacher: User profile (name, status, currentJourneyStep, lastJourneyAt, etc.)
 *   - events: ordered list of journey events
 *   - nextRequiredStep: the next step they need to take
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const { id } = await params;
  const teacher: any = await d1First(
    `SELECT id, email, firstName, lastName, firstNameAr, lastNameAr,
            role, status, currentJourneyStep, lastJourneyAt,
            isVerifiedTeacher, createdAt, lastLoginAt, lastInvitationId
     FROM User WHERE id = ? AND role = 'TEACHER'`,
    id,
  );
  if (!teacher) {
    return NextResponse.json({ error: 'Enseignant non trouvé' }, { status: 404 });
  }

  const events = await getTeacherJourney(id);
  const nextRequiredStep = getNextRequiredStep(events);

  return NextResponse.json({
    teacher,
    events,
    nextRequiredStep,
    flow: JOURNEY_FLOW.map((type) => ({
      type,
      label: JOURNEY_LABELS[type]?.fr || type,
      icon: JOURNEY_LABELS[type]?.icon || '',
      color: JOURNEY_LABELS[type]?.color || 'slate',
      completed: events.some((e: any) => e.eventType === type),
    })),
  });
}
