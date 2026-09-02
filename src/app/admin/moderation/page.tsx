// @ts-nocheck
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { Flag, AlertTriangle, CheckCircle, FileText, Clock } from 'lucide-react';
import { timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const REASON_LABELS: Record<string, string> = {
  INAPPROPRIATE: 'Contenu inapproprié',
  COPYRIGHT: "Violation de droits d'auteur",
  SPAM: 'Spam / Publicité',
  WRONG_CONTENT: 'Contenu erroné',
  OTHER: 'Autre',
};

const REASON_COLORS: Record<string, string> = {
  INAPPROPRIATE: 'bg-red-100 text-red-700',
  COPYRIGHT: 'bg-purple-100 text-purple-700',
  SPAM: 'bg-orange-100 text-orange-700',
  WRONG_CONTENT: 'bg-amber-100 text-amber-700',
  OTHER: 'bg-slate-100 text-slate-700',
};

export default async function AdminModerationPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');

  const [pendingReports, resolvedReports, totalReports] = await Promise.all([
    prisma.report.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: {
        resource: { include: { subject: true } },
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    }),
    prisma.report.findMany({
      where: { status: { not: 'PENDING' } },
      take: 10,
      orderBy: { resolvedAt: 'desc' },
      include: {
        resource: { include: { subject: true } },
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    }),
    prisma.report.count(),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-6 flex items-center gap-2">
        <Flag className="w-6 h-6 text-red-500" /> Modération
      </h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl p-5 border border-slate-100">
          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center mb-3">
            <Clock className="w-5 h-5 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold">{pendingReports.length}</div>
          <div className="text-sm font-semibold text-slate-700">Signalements en attente</div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-100">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center mb-3">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold">{resolvedReports.length}+</div>
          <div className="text-sm font-semibold text-slate-700">Traités récemment</div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-100 col-span-2 lg:col-span-1">
          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center mb-3">
            <Flag className="w-5 h-5 text-slate-600" />
          </div>
          <div className="text-2xl font-extrabold">{totalReports}</div>
          <div className="text-sm font-semibold text-slate-700">Total historique</div>
        </div>
      </div>

      {/* Pending reports */}
      <div className="mb-10">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" /> En attente ({pendingReports.length})
        </h2>
        {pendingReports.length === 0 ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-8 text-center">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-500" />
            <h3 className="font-bold text-lg text-emerald-800 mb-1">Tout est propre !</h3>
            <p className="text-emerald-600 text-sm">Aucun signalement en attente.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingReports.map((rep) => (
              <div key={rep.id} className="bg-white rounded-2xl border border-amber-200 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`px-2 py-1 text-xs font-bold rounded ${REASON_COLORS[rep.reason] || 'bg-slate-100 text-slate-700'}`}
                      >
                        {REASON_LABELS[rep.reason] || rep.reason}
                      </span>
                      <span className="text-xs text-slate-500">{timeAgo(rep.createdAt)}</span>
                    </div>
                    {rep.resource && (
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-10 bg-slate-100 rounded flex items-center justify-center flex-shrink-0">
                          <FileText className="w-4 h-4 text-slate-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-sm truncate">{rep.resource.title}</div>
                          <div className="text-xs text-slate-500">
                            {rep.resource.subject?.nameFr}
                          </div>
                        </div>
                      </div>
                    )}
                    {rep.description && (
                      <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3 mb-2">
                        « {rep.description} »
                      </p>
                    )}
                    <div className="text-xs text-slate-500">
                      Signalé par{' '}
                      <span className="font-semibold">
                        {rep.user?.firstName} {rep.user?.lastName}
                      </span>{' '}
                      ({rep.user?.email})
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolved reports */}
      {resolvedReports.length > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-500" /> Traités récemment
          </h2>
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Raison</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Ressource</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden sm:table-cell">
                    Signalé par
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Statut</th>
                </tr>
              </thead>
              <tbody>
                {resolvedReports.map((rep) => (
                  <tr key={rep.id} className="border-t border-slate-50">
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 text-xs font-bold rounded ${REASON_COLORS[rep.reason] || 'bg-slate-100 text-slate-700'}`}
                      >
                        {REASON_LABELS[rep.reason] || rep.reason}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium truncate max-w-xs">
                      {rep.resource?.title || (
                        <span className="text-slate-400 italic">Ressource supprimée</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-xs text-slate-500">
                      {rep.user?.firstName} {rep.user?.lastName}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 text-xs font-bold rounded bg-emerald-100 text-emerald-700">
                        {rep.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
