'use client';
import { useState } from 'react';
import { Star } from 'lucide-react';
import toast from 'react-hot-toast';

export default function RatingSection({
  resourceId,
  avgRating,
  ratingCount,
  distribution,
  maxCount,
}: {
  resourceId: string;
  avgRating: number;
  ratingCount: number;
  distribution: { star: number; count: number }[];
  maxCount: number;
}) {
  const [selected, setSelected] = useState(0);
  const [hover, setHover] = useState(0);
  const [review, setReview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [myRating, setMyRating] = useState<number | null>(null);

  async function submit() {
    if (selected === 0) {
      toast.error('Choisissez une note');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/resources/${resourceId}/rating`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stars: selected, review: review || null }),
      });
      if (res.status === 401) {
        toast.error('Connectez-vous pour noter');
        return;
      }
      if (res.ok) {
        toast.success('Merci pour votre avis ! ⭐');
        setMyRating(selected);
        setSelected(0);
        setReview('');
      }
    } catch {
      toast.error('Erreur');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6 lg:p-8 mb-4">
      <h2 className="font-bold text-xl mb-4 flex items-center gap-2">⭐ Avis et notation</h2>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Distribution */}
        <div>
          <div className="text-center mb-4">
            <div className="text-5xl font-extrabold text-slate-900">{avgRating.toFixed(1)}</div>
            <div className="flex justify-center my-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star
                  key={i}
                  className={`w-5 h-5 ${i <= Math.round(avgRating) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`}
                />
              ))}
            </div>
            <div className="text-sm text-slate-500">{ratingCount} avis</div>
          </div>
          <div className="space-y-1.5">
            {distribution.map((d) => (
              <div key={d.star} className="flex items-center gap-2 text-sm">
                <span className="w-8 text-slate-600 font-semibold">{d.star}★</span>
                <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-amber-400 h-full rounded-full"
                    style={{ width: `${(d.count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-slate-500 text-xs">{d.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Form */}
        <div className="bg-slate-50 rounded-xl p-4">
          {myRating ? (
            <div className="text-center py-4">
              <div className="text-3xl mb-2">🎉</div>
              <div className="font-bold">Merci pour votre avis !</div>
              <div className="text-sm text-slate-500 mt-1">Vous avez noté {myRating} étoiles</div>
            </div>
          ) : (
            <>
              <h3 className="font-bold mb-2">Donnez votre avis</h3>
              <div className="flex gap-1 mb-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <button
                    key={i}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(0)}
                    onClick={() => setSelected(i)}
                    className="transition-transform hover:scale-110"
                  >
                    <Star
                      className={`w-8 h-8 ${i <= (hover || selected) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
                    />
                  </button>
                ))}
              </div>
              <textarea
                value={review}
                onChange={(e) => setReview(e.target.value)}
                placeholder="Partagez votre avis (optionnel)..."
                className="input min-h-[80px] resize-none"
                maxLength={500}
              />
              <button onClick={submit} disabled={submitting} className="btn-primary w-full mt-3">
                {submitting ? 'Envoi...' : 'Publier mon avis'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
