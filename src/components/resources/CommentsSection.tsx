'use client';
import { useEffect, useState } from 'react';
import { getInitials } from '@/lib/text-utils';
import { MessageCircle, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { timeAgo } from '@/lib/utils';

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  /**
   * Server-computed `timeAgo(createdAt)` baked into the SSR HTML. Used for the
   * initial render so the client text matches the server byte-for-byte and we
   * avoid React #425/#422/#418/#419 hydration mismatches (the function uses
   * `Date.now()` which is non-deterministic across the SSR/hydration boundary).
   * Recomputed in `useEffect` after mount with the live client clock.
   */
  createdAtLabel?: string;
  user: { firstName: string | null; lastName: string | null; avatarUrl: string | null };
}

export default function CommentsSection({
  resourceId,
  initialComments,
}: {
  resourceId: string;
  initialComments: Comment[];
}) {
  const [comments, setComments] = useState(initialComments);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // After mount, refresh the `createdAtLabel` for every comment with the live
  // client clock so the relative time ticks forward (e.g. "il y a 2 minutes"
  // → "il y a 3 minutes"). The first render uses the server-baked label so
  // hydration is identical to SSR.
  useEffect(() => {
    setComments((prev) =>
      prev.map((c) =>
        c.createdAtLabel ? { ...c, createdAtLabel: timeAgo(c.createdAt) } : c,
      ),
    );
  }, []);

  async function submit() {
    if (!content.trim()) {
      toast.error('Écrivez un commentaire');
      return;
    }
    if (content.length < 3) {
      toast.error('Commentaire trop court');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/resources/${resourceId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (res.status === 401) {
        toast.error('Connectez-vous pour commenter');
        return;
      }
      if (res.ok) {
        const data = await res.json();
        const createdAt = new Date().toISOString();
        setComments([
          { ...data.comment, createdAt, createdAtLabel: timeAgo(createdAt) },
          ...comments,
        ]);
        setContent('');
        toast.success('Commentaire publié 💬');
      }
    } catch {
      toast.error('Erreur');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6 lg:p-8 mb-4">
      <h2 className="font-bold text-xl mb-4 flex items-center gap-2">
        <MessageCircle className="w-5 h-5 text-primary-600" /> Commentaires ({comments.length})
      </h2>

      <div className="flex gap-3 mb-6 pb-6 border-b border-slate-100">
        <div className="w-10 h-10 flex-shrink-0 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-white font-bold flex items-center justify-center">
          👤
        </div>
        <div className="flex-1">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Partagez votre avis, posez une question..."
            className="input min-h-[80px] resize-none"
            maxLength={1000}
          />
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-slate-400">{content.length}/1000</span>
            <button onClick={submit} disabled={submitting} className="btn-primary text-sm">
              <Send className="w-4 h-4" /> {submitting ? 'Envoi...' : 'Publier'}
            </button>
          </div>
        </div>
      </div>

      {comments.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <MessageCircle className="w-12 h-12 mx-auto mb-2 text-slate-300" />
          <p>Aucun commentaire. Soyez le premier à commenter !</p>
        </div>
      ) : (
        <div className="space-y-4">
          {comments.map((c) => {
            const initials = getInitials(c.user.firstName, c.user.lastName);
            return (
              <div key={c.id} className="flex gap-3">
                <div className="w-10 h-10 flex-shrink-0 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-white font-bold text-sm flex items-center justify-center">
                  {initials}
                </div>
                <div className="flex-1 bg-slate-50 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-semibold text-sm">
                      {c.user.firstName} {c.user.lastName}
                    </div>
                    <div className="text-xs text-slate-400" suppressHydrationWarning>
                      {c.createdAtLabel ?? timeAgo(c.createdAt)}
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.content}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
