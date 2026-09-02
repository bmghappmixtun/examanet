// @ts-nocheck
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { CheckCircle2, FileText } from 'lucide-react';

export const dynamic = 'force-dynamic';

const TYPE_LABELS: Record<string, string> = {
  COURSE: '📖 Cours',
  DEVOIR: '📝 Devoir',
  EXERCISE: '✏️ Exercice',
  SERIES: '📚 Série',
  BAC_SUBJECT: '🎓 Sujet Bac',
  CORRECTION: '✅ Corrigé',
  SUMMARY: '📄 Résumé',
  CARD: '🗂️ Fiche',
};

export default async function PendingEditsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');
  if (user.role !== 'ADMIN') redirect('/');

  // TODO: the edit workflow is not yet migrated to D1.
  // For now, show a friendly empty state so the admin doesn't see a 500.
  // The other tabs (Approbations, Modération) cover the equivalent workflow
  // through the existing PENDING_APPROVAL status.
  const pendingEdits: any[] = [];
  const recentlyRejected: any[] = [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold">✏️ Modifications en attente</h1>
          <p className="text-slate-500 mt-1">
            Approuvez ou refusez les modifications proposées par les enseignants.
          </p>
        </div>
        <div className="text-right">
          <div className="text-4xl font-extrabold text-blue-600">{pendingEdits.length}</div>
          <div className="text-xs text-slate-500">en attente</div>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        ⚠️ <strong>Fonctionnalité en cours de migration.</strong> Le système d'approbation
        des modifications d'enseignants est temporairement désactivé. Les autres flux
        (Approbations, Modération) restent opérationnels.
      </div>

      {pendingEdits.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-emerald-300" />
          <h3 className="font-bold text-xl mb-2">Tout est à jour !</h3>
          <p className="text-slate-500">Aucune modification en attente d'approbation.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingEdits.map((r: any) => (
            <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-4">
              <h3 className="font-bold">{r.title}</h3>
            </div>
          ))}
        </div>
      )}

      {recentlyRejected.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold">🕒 Rejetés récemment</h2>
          {recentlyRejected.map((r: any) => (
            <div key={r.id} className="bg-slate-50 rounded-xl border border-slate-200 p-4">
              <h3 className="font-bold text-sm">{r.title}</h3>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
