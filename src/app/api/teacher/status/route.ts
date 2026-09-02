export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

/**
 * GET /api/teacher/status
 * Returns the current teacher's status + whether they can publish resources.
 * Used by the FloatingUploadButton and other client components to disable
 * upload features for teachers who haven't completed file verification.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return NextResponse.json(
      { canUpload: false, message: 'Réservé aux enseignants' },
      { status: 403 },
    );
  }

  if (user.role === 'ADMIN') {
    return NextResponse.json({
      canUpload: true,
      status: 'ADMIN',
      isAdmin: true,
    });
  }

  const status = user.status;
  const canUpload = status === 'ACTIVE';

  let message = '';
  if (status === 'PENDING_FILE_VERIFICATION') {
    message = '🔒 Soumettez vos 5 fichiers de vérification pour pouvoir publier des ressources.';
  } else if (status === 'PENDING_APPROVAL') {
    message = "⏳ Votre compte est en attente d'approbation par l'administrateur.";
  } else if (status === 'PENDING_OTP') {
    message = '⏳ Vérifiez votre email avec le code OTP pour activer votre compte.';
  } else if (status === 'SUSPENDED' || status === 'BANNED') {
    message = '⛔ Votre compte a été suspendu.';
  }

  return NextResponse.json({
    canUpload,
    status,
    message,
  });
}
