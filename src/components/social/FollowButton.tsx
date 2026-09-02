'use client';
import { useState } from 'react';
import { UserPlus, UserCheck, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

export default function FollowButton({
  teacherId,
  initialFollowing,
  initialCount,
}: {
  teacherId: string;
  initialFollowing: boolean;
  initialCount: number;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    try {
      const res = await fetch('/api/follows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          toast.error('Connectez-vous pour suivre ce professeur');
          router.push('/connexion');
          return;
        }
        toast.error(data.error || 'Erreur');
        return;
      }
      setFollowing(data.following);
      setCount(data.followersCount);
      toast.success(data.following ? 'Vous suivez ce professeur ✅' : 'Vous ne le suivez plus');
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-50 ${
        following
          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border border-emerald-200'
          : 'bg-primary-500 hover:bg-primary-600 text-white shadow-md'
      }`}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : following ? (
        <UserCheck className="w-4 h-4" />
      ) : (
        <UserPlus className="w-4 h-4" />
      )}
      {following ? 'Suivi' : 'Suivre'}
      <span className="hidden sm:inline text-xs opacity-75">({count})</span>
    </button>
  );
}
