// @ts-nocheck
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { d1All } from '@/lib/db-d1';
import MesCommentairesClient from '@/components/account/MesCommentairesClient';
import { MessageSquare, Star } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mes commentaires & avis — Espace enseignant | Examanet' };

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.DB;
}

export default async function MesCommentairesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');

  const db = await getD1();
  if (!db) {
    return (
      <div>
        <h1 className="text-2xl font-extrabold mb-4">Mes commentaires et avis</h1>
        <p className="text-slate-500">Base de données indisponible.</p>
      </div>
    );
  }

  // 1. Get all comments by this user (including soft-deleted so they can see their history)
  const comments: any[] = await d1All(
    `SELECT c.id, c.content, c.isHidden, c.createdAt, c.updatedAt,
            c.resourceId, r.title, r.slug, r.numericId, r.type
     FROM Comment c
     LEFT JOIN Resource r ON c.resourceId = r.id
     WHERE c.userId = ?
     ORDER BY c.createdAt DESC
     LIMIT 100`,
    user.id,
  );

  // 2. Get all ratings by this user
  const ratings: any[] = await d1All(
    `SELECT rt.id, rt.value, rt.createdAt,
            rt.resourceId, r.title, r.slug, r.numericId, r.type,
            r.avgRating as resourceAvgRating, r.ratingsCount as resourceRatingsCount
     FROM Rating rt
     LEFT JOIN Resource r ON rt.resourceId = r.id
     WHERE rt.userId = ?
     ORDER BY rt.createdAt DESC
     LIMIT 100`,
    user.id,
  );

  // Stats
  const visibleComments = comments.filter((c) => !c.isHidden);
  const hiddenComments = comments.filter((c) => c.isHidden);
  const avgRating = ratings.length > 0
    ? ratings.reduce((s, r) => s + (r.value || 0), 0) / ratings.length
    : 0;

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-2">Mes commentaires et avis</h1>
      <p className="text-slate-500 mb-6">
        Gère les commentaires que tu as laissés et les notes que tu as données aux ressources.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-extrabold">{visibleComments.length}</div>
              <div className="text-xs text-slate-500">Commentaire(s) publié(s)</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <Star className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <div className="text-2xl font-extrabold">{ratings.length}</div>
              <div className="text-xs text-slate-500">Avis laissé(s)</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
              <Star className="w-5 h-5 text-yellow-600 fill-yellow-400" />
            </div>
            <div>
              <div className="text-2xl font-extrabold">{avgRating.toFixed(1)}/5</div>
              <div className="text-xs text-slate-500">Note moyenne donnée</div>
            </div>
          </div>
        </div>
      </div>

      <MesCommentairesClient
        initialComments={comments.map((c) => ({
          id: c.id,
          content: c.content,
          isHidden: c.isHidden,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          resourceId: c.resourceId,
          resourceTitle: c.title || '(ressource supprimée)',
          resourceSlug: c.slug,
          resourceNumericId: c.numericId,
          resourceType: c.type,
        }))}
        initialRatings={ratings.map((r) => ({
          id: r.id,
          value: r.value,
          createdAt: r.createdAt,
          resourceId: r.resourceId,
          resourceTitle: r.title || '(ressource supprimée)',
          resourceSlug: r.slug,
          resourceNumericId: r.numericId,
          resourceType: r.type,
          resourceAvgRating: r.resourceAvgRating,
          resourceRatingsCount: r.resourceRatingsCount,
        }))}
        hiddenCount={hiddenComments.length}
      />
    </div>
  );
}
