'use client';
import { useState, useTransition } from 'react';
import { Heart, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface FavoriteButtonProps {
  resourceId: string;
  initialFavorited?: boolean;
  initialCount?: number;
  variant?: 'icon' | 'icon-label';
  className?: string;
}

export default function FavoriteButton({
  resourceId,
  initialFavorited = false,
  initialCount = 0,
  variant = 'icon',
  className = '',
}: FavoriteButtonProps) {
  const [favorited, setFavorited] = useState(initialFavorited);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  async function handleClick(e: React.MouseEvent) {
    // Critical: stop the parent <Link> from navigating
    e.preventDefault();
    e.stopPropagation();

    if (loading) return;
    setLoading(true);

    // Optimistic update
    const prevFavorited = favorited;
    const prevCount = count;
    setFavorited(!prevFavorited);
    setCount(prevFavorited ? Math.max(0, prevCount - 1) : prevCount + 1);

    try {
      const res = await fetch(`/api/favorites/${resourceId}`, { method: 'POST' });
      if (res.status === 401) {
        toast.error('Connectez-vous pour ajouter aux favoris');
        // Revert
        setFavorited(prevFavorited);
        setCount(prevCount);
        // Optional: redirect to login after a moment
        setTimeout(() => {
          window.location.href = '/connexion';
        }, 800);
        return;
      }
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      // Sync with server response
      startTransition(() => {
        setFavorited(data.favorited);
      });
      if (data.favorited) {
        toast.success('Ajouté aux favoris ❤️');
      } else {
        toast.success('Retiré des favoris');
      }
    } catch {
      // Revert on error
      setFavorited(prevFavorited);
      setCount(prevCount);
      toast.error('Erreur — réessayez');
    } finally {
      setLoading(false);
    }
  }

  if (variant === 'icon-label') {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        aria-label={favorited ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        aria-pressed={favorited}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all disabled:opacity-50 ${
          favorited
            ? 'bg-red-50 text-red-600 hover:bg-red-100'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
        } ${className}`}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Heart
            className={`w-3.5 h-3.5 transition-all ${favorited ? 'fill-red-500 text-red-500 scale-110' : ''}`}
          />
        )}
        <span>{count}</span>
      </button>
    );
  }

  // Default icon variant — top-right corner button
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      aria-label={favorited ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      aria-pressed={favorited}
      title={favorited ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-full transition-all backdrop-blur disabled:opacity-50 ${
        favorited
          ? 'bg-red-50 text-red-500 hover:bg-red-100 hover:scale-110'
          : 'bg-white/80 text-slate-500 hover:bg-white hover:text-red-500 hover:scale-110'
      } shadow-sm ${className}`}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Heart
          className={`w-4 h-4 transition-all ${favorited ? 'fill-red-500 text-red-500' : ''}`}
        />
      )}
    </button>
  );
}
