'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function MessageTeacherButton({ teacherId }: { teacherId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function startConversation() {
    setLoading(true);
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          toast.error('Connectez-vous pour envoyer un message');
          router.push('/connexion');
          return;
        }
        toast.error(data.error || 'Erreur');
        return;
      }
      router.push(`/messages/${data.conversation.id}`);
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={startConversation}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 transition shadow-sm disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <MessageCircle className="w-4 h-4" />
      )}
      Message
    </button>
  );
}
