'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Star, Trash2, ExternalLink, Eye, EyeOff, MessageSquare } from 'lucide-react';

interface Comment {
  id: string;
  content: string;
  isHidden: boolean;
  createdAt: number;
  updatedAt: number;
  resourceId: string;
  resourceTitle: string;
  resourceSlug: string | null;
  resourceNumericId: number | null;
  resourceType: string | null;
}

interface Rating {
  id: string;
  value: number;
  createdAt: number;
  resourceId: string;
  resourceTitle: string;
  resourceSlug: string | null;
  resourceNumericId: number | null;
  resourceType: string | null;
  resourceAvgRating: number;
  resourceRatingsCount: number;
}

interface Props {
  initialComments: Comment[];
  initialRatings: Rating[];
  hiddenCount: number;
}

function formatDate(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function buildResourceUrl(c: { resourceSlug: string | null; resourceNumericId: number | null; resourceId: string }) {
  if (c.resourceSlug && c.resourceNumericId) {
    return `/ressources/${c.resourceNumericId}/${c.resourceSlug}`;
  }
  // Fallback: just go to the resource
  return `/ressources/${c.resourceId}`;
}

export default function MesCommentairesClient({ initialComments, initialRatings, hiddenCount }: Props) {
  const router = useRouter();
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [ratings, setRatings] = useState<Rating[]>(initialRatings);
  const [showHidden, setShowHidden] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [_, startTransition] = useTransition();

  const visibleComments = comments.filter((c) => showHidden || !c.isHidden);

  const handleDeleteComment = async (commentId: string, resourceId: string) => {
    if (!confirm('Supprimer ce commentaire ? Cette action peut être annulée par un admin.')) return;
    setDeletingId(commentId);
    setError(null);
    try {
      const res = await fetch(`/api/resources/${resourceId}/comments`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur');
      }
      // Soft-delete locally: mark as hidden
      setComments((cs) => cs.map((c) => (c.id === commentId ? { ...c, isHidden: true } : c)));
      startTransition(() => router.refresh());
    } catch (e: any) {
      setError(e.message || 'Erreur lors de la suppression');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteRating = async (ratingId: string, resourceId: string) => {
    if (!confirm('Supprimer ton avis sur cette ressource ?')) return;
    setDeletingId(ratingId);
    setError(null);
    try {
      const res = await fetch(`/api/resources/${resourceId}/rating`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur');
      }
      setRatings((rs) => rs.filter((r) => r.id !== ratingId));
      startTransition(() => router.refresh());
    } catch (e: any) {
      setError(e.message || 'Erreur lors de la suppression');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-8">
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Section: Commentaires */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-extrabold flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-600" />
            Commentaires ({visibleComments.length})
          </h2>
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowHidden(!showHidden)}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1"
            >
              {showHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {showHidden ? 'Masquer les supprimés' : `Voir les ${hiddenCount} supprimé(s)`}
            </button>
          )}
        </div>

        {visibleComments.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
            <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">Tu n'as pas encore laissé de commentaire.</p>
            <p className="text-slate-400 text-xs mt-1">
              Va sur la page d'une ressource et laisse ton premier commentaire !
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {visibleComments.map((c) => (
              <li
                key={c.id}
                className={`bg-white rounded-2xl border p-5 ${
                  c.isHidden ? 'border-slate-200 opacity-60' : 'border-slate-100'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 text-xs text-slate-500">
                      {c.resourceType && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
                          {c.resourceType}
                        </span>
                      )}
                      <span>sur</span>
                      <Link
                        href={buildResourceUrl(c)}
                        className="font-bold text-slate-700 hover:text-primary-600 truncate"
                      >
                        {c.resourceTitle}
                      </Link>
                      {c.isHidden && (
                        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">
                          Supprimé
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-800 whitespace-pre-wrap mb-2">{c.content}</p>
                    <div className="text-xs text-slate-400">
                      Posté {formatDate(c.createdAt)}
                      {c.updatedAt > c.createdAt && ` • Modifié ${formatDate(c.updatedAt)}`}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Link
                      href={buildResourceUrl(c)}
                      className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-primary-600"
                      title="Voir la ressource"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                    {!c.isHidden && (
                      <button
                        onClick={() => handleDeleteComment(c.id, c.resourceId)}
                        disabled={deletingId === c.id}
                        className="p-2 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600 disabled:opacity-50"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Section: Avis / Notes */}
      <section>
        <h2 className="text-lg font-extrabold flex items-center gap-2 mb-3">
          <Star className="w-5 h-5 text-amber-500" />
          Avis laissés ({ratings.length})
        </h2>

        {ratings.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
            <Star className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">Tu n'as pas encore noté de ressource.</p>
            <p className="text-slate-400 text-xs mt-1">
              Note les ressources que tu as consultées pour donner ton avis !
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {ratings.map((r) => (
              <li
                key={r.id}
                className="bg-white rounded-2xl border border-slate-100 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 text-xs text-slate-500">
                      {r.resourceType && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
                          {r.resourceType}
                        </span>
                      )}
                      <span>sur</span>
                      <Link
                        href={buildResourceUrl(r)}
                        className="font-bold text-slate-700 hover:text-primary-600 truncate"
                      >
                        {r.resourceTitle}
                      </Link>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Star
                            key={i}
                            className={`w-4 h-4 ${
                              i <= r.value
                                ? 'text-amber-500 fill-amber-500'
                                : 'text-slate-200'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-sm font-bold text-slate-700">{r.value}/5</span>
                      <span className="text-xs text-slate-400 ml-2">
                        (moyenne actuelle: {Number(r.resourceAvgRating).toFixed(1)}/5
                        {r.resourceRatingsCount > 0 && ` • ${r.resourceRatingsCount} avis`})
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Noté {formatDate(r.createdAt)}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Link
                      href={buildResourceUrl(r)}
                      className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-primary-600"
                      title="Voir la ressource"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                    <Link
                      href={`/ressources/${r.resourceNumericId || r.resourceId}/${r.resourceSlug || ''}#rate`}
                      className="p-2 rounded-lg hover:bg-amber-50 text-slate-500 hover:text-amber-600"
                      title="Modifier mon avis"
                    >
                      <Star className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => handleDeleteRating(r.id, r.resourceId)}
                      disabled={deletingId === r.id}
                      className="p-2 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600 disabled:opacity-50"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
