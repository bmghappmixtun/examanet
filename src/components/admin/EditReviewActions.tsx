'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function EditReviewActions({
  resourceId,
  resourceTitle,
}: {
  resourceId: string;
  resourceTitle: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [reason, setReason] = useState('');

  async function approve() {
    if (!confirm(`Approuver la modification de "${resourceTitle}" et la publier ?`)) return;
    setLoading('approve');
    try {
      const res = await fetch(`/api/admin/resource/${resourceId}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      toast.success('Modification approuvée et publiée !');
      router.refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(null);
    }
  }

  async function reject() {
    if (!reason.trim()) {
      toast.error('Indiquez une raison');
      return;
    }
    setLoading('reject');
    try {
      const res = await fetch(`/api/admin/resource/${resourceId}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      toast.success('Modification refusée');
      setShowRejectForm(false);
      setReason('');
      router.refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-2">
      {!showRejectForm ? (
        <div className="flex gap-2">
          <button
            onClick={approve}
            disabled={!!loading}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading === 'approve' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            Approuver et publier
          </button>
          <button
            onClick={() => setShowRejectForm(true)}
            disabled={!!loading}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border-2 border-red-300 text-red-700 rounded-lg font-semibold hover:bg-red-50 disabled:opacity-50"
          >
            <XCircle className="w-4 h-4" />
            Refuser
          </button>
        </div>
      ) : (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-2">
          <label htmlFor="reason" className="text-sm font-semibold text-red-900">Raison du refus :</label>
          <textarea id="reason" value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Expliquez pourquoi la modification est refusée..."
            className="w-full px-3 py-2 border border-red-200 rounded-lg focus:border-red-500 outline-none"
            rows={3}
          />
          <div className="flex gap-2">
            <button
              onClick={reject}
              disabled={!!loading}
              className="px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {loading === 'reject' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              Confirmer le refus
            </button>
            <button
              onClick={() => {
                setShowRejectForm(false);
                setReason('');
              }}
              className="px-4 py-2 border border-slate-200 rounded-lg font-semibold text-slate-700 hover:bg-white"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
