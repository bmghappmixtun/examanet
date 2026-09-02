// @ts-nocheck
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { ChevronLeft, AlertCircle } from 'lucide-react';
import EditResourceForm from '@/components/teacher/EditResourceForm';

export const dynamic = 'force-dynamic';

export default async function EditResourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') redirect('/');

  const [resource, subjects, classes, sections] = await Promise.all([
    prisma.resource.findUnique({
      where: { id },
      include: { subject: true, class: true, section: true },
    }),
    prisma.subject.findMany({ orderBy: { order: 'asc' } }),
    prisma.class.findMany({ orderBy: { order: 'asc' } }),
    prisma.section.findMany(),
  ]);

  if (!resource) notFound();

  // Only owner or admin
  if (user.role !== 'ADMIN' && resource.teacherId !== user.id) {
    redirect('/enseignant/ressources');
  }

  const pending = (resource.pendingEdit as any) || {};
  const hasPending = resource.editStatus === 'PENDING_EDIT_APPROVAL';
  const wasRejected = resource.editStatus === 'EDIT_REJECTED';

  return (
    <div className="space-y-4">
      <Link
        href="/enseignant/ressources"
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ChevronLeft className="w-4 h-4" /> Retour à mes ressources
      </Link>

      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Modifier la ressource</h1>
        <p className="text-slate-500 text-sm mt-1">
          Les modifications seront publiées après approbation par un administrateur.
        </p>
      </div>

      {/* Status alerts */}
      {hasPending && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-bold text-blue-900">Modification déjà en attente</h3>
            <p className="text-sm text-blue-700 mt-1">
              Vous avez déjà soumis des modifications. Attendez qu'un administrateur les approuve ou
              les refuse avant d'en proposer de nouvelles.
            </p>
            {resource.editSummary && (
              <p className="text-xs text-blue-600 mt-2 font-mono">Résumé: {resource.editSummary}</p>
            )}
          </div>
        </div>
      )}

      {wasRejected && (
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-bold text-red-900">Modification précédente refusée</h3>
            {resource.editRejectionReason && (
              <p className="text-sm text-red-700 mt-1">
                <strong>Raison :</strong> {resource.editRejectionReason}
              </p>
            )}
            <p className="text-xs text-red-600 mt-2">
              Vous pouvez maintenant proposer une nouvelle modification.
            </p>
          </div>
        </div>
      )}

      <EditResourceForm
        resource={{
          id: resource.id,
          slug: resource.slug,
          title: resource.title,
          description: resource.description,
          type: resource.type,
          subjectId: resource.subjectId,
          classId: resource.classId,
          sectionId: resource.sectionId,
          trimester: resource.trimester,
          year: resource.year,
          tags: resource.tags,
          language: resource.language,
          fileKey: resource.fileKey,
          fileSize: resource.fileSize,
          status: resource.status,
          editStatus: resource.editStatus,
          // Homework & school metadata (NEW)
          homeworkSubtype: resource.homeworkSubtype,
          homeworkNumber: resource.homeworkNumber,
          schoolType: resource.schoolType,
          product: resource.product,
          hasCorrection: resource.hasCorrection,
          correctionSummary: resource.correctionSummary,
        }}
        pending={pending}
        subjects={subjects.map((s) => ({
          id: s.id,
          slug: s.slug,
          nameFr: s.nameFr,
          icon: s.icon || undefined,
        }))}
        classes={classes.map((c) => ({ id: c.id, slug: c.slug, nameFr: c.nameFr }))}
        sections={sections.map((s) => ({ id: s.id, nameFr: s.nameFr, classId: s.classId }))}
        readOnly={hasPending}
      />
    </div>
  );
}
