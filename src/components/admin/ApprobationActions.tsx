'use client';
import { useState } from 'react';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ApprobationActions({
  type,
  targetId,
}: {
  type: 'teacher' | 'resource';
  targetId: string;
}) {
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);

  async function handle(action: 'approve' | 'reject') {
    setLoading(action);
    try {
      const res = await fetch(`/api/admin/${type}/${targetId}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error);
        return;
      }
      toast.success(action === 'approve' ? 'Approuvé ! ✅' : 'Rejeté ❌');
      window.location.reload();
    } catch {
      toast.error('Erreur');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => handle('approve')}
        disabled={loading !== null}
        className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl transition disabled:opacity-50"
      >
        {loading === 'approve' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <CheckCircle className="w-4 h-4" />
        )}
        Approuver
      </button>
      <button
        onClick={() => handle('reject')}
        disabled={loading !== null}
        className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl transition disabled:opacity-50"
      >
        {loading === 'reject' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <XCircle className="w-4 h-4" />
        )}
        Rejeter
      </button>
    </div>
  );
}
