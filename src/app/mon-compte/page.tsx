// @ts-nocheck
import { redirect } from 'next/navigation';
// 2026-09-03: Migrated from prisma-compat to D1 direct
async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.DB;
}
import { getCurrentUser } from '@/lib/auth';
import { isArabic } from '@/lib/text-utils';
import { FileText, Heart, MessageCircle, Star } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Mon compte',
  description: 'Mon espace personnel Examanet — favoris, commentaires et historique.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default async function AccountDashboard() {
  const user = await getCurrentUser();
  if (!user) return null;

  // For teachers, the unified profile page lives at /enseignant/profil
  if (user.role === 'TEACHER' || user.role === 'ADMIN') {
    redirect('/enseignant/profil');
  }

  const db = await getD1();
  if (!db) {
    return (
      <div>
        <h1 className="text-2xl font-extrabold mb-6">Bienvenue, {user.firstName} !</h1>
        <p>Chargement...</p>
      </div>
    );
  }
  const [favCount, comCount, ratCount, viewCount] = await Promise.all([
    db.prepare("SELECT COUNT(*) as c FROM Favorite WHERE userId = ?").bind(user.id).first(),
    db.prepare("SELECT COUNT(*) as c FROM Comment WHERE userId = ?").bind(user.id).first(),
    db.prepare("SELECT COUNT(*) as c FROM Rating WHERE userId = ?").bind(user.id).first(),
    db.prepare("SELECT COUNT(*) as c FROM View WHERE userId = ?").bind(user.id).first(),
  ]);
  const favoritesCount = (favCount as any)?.c || 0;
  const commentsCount = (comCount as any)?.c || 0;
  const ratingsCount = (ratCount as any)?.c || 0;
  const recentActivity = (viewCount as any)?.c || 0;

  const recentFavsRes: any = await db.prepare([
    "SELECT f.id, f.createdAt, r.id as r_id, r.numericId, r.slug, r.title, r.thumbnailUrl, r.thumbnailKey,",
    "s.id as s_id, s.slug as s_slug, s.nameFr as s_nameFr, s.color as s_color,",
    "c.id as c_id, c.slug as c_slug, c.nameFr as c_nameFr",
    "FROM Favorite f",
    "INNER JOIN Resource r ON r.id = f.resourceId",
    "LEFT JOIN `Subject` s ON s.id = r.subjectId",
    "LEFT JOIN Class c ON c.id = r.classId",
    "WHERE f.userId = ?",
    "ORDER BY f.createdAt DESC LIMIT 4",
  ].join(' ')).bind(user.id).all();
  const recentFavorites = ((recentFavsRes?.results || []) as any[]).map((f: any) => ({
    id: f.id,
    createdAt: f.createdAt,
    resource: f.r_id ? {
      id: f.r_id,
      numericId: f.numericId,
      slug: f.slug,
      title: f.title,
      thumbnailUrl: f.thumbnailUrl,
      thumbnailKey: f.thumbnailKey,
      subject: f.s_id ? { id: f.s_id, slug: f.s_slug, nameFr: f.s_nameFr, color: f.s_color } : null,
      class: f.c_id ? { id: f.c_id, slug: f.c_slug, nameFr: f.c_nameFr } : null,
    } : null,
  }));

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-6">Bienvenue, {user.firstName} ! 👋</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          {
            icon: FileText,
            value: recentActivity,
            label: 'Ressources consultées',
            color: 'from-primary-500 to-primary-700',
            bg: 'bg-primary-100',
            text: 'text-primary-600',
          },
          {
            icon: Heart,
            value: favoritesCount,
            label: 'Favoris',
            color: 'from-red-500 to-red-600',
            bg: 'bg-red-100',
            text: 'text-red-600',
          },
          {
            icon: MessageCircle,
            value: commentsCount,
            label: 'Commentaires',
            color: 'from-emerald-500 to-emerald-600',
            bg: 'bg-emerald-100',
            text: 'text-emerald-600',
          },
          {
            icon: Star,
            value: ratingsCount,
            label: 'Avis laissés',
            color: 'from-amber-500 to-amber-600',
            bg: 'bg-amber-100',
            text: 'text-amber-600',
          },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-xl p-5 border border-slate-100">
            <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center mb-3`}>
              <s.icon className={`w-5 h-5 ${s.text}`} />
            </div>
            <div className="text-2xl font-extrabold">{s.value}</div>
            <div className="text-sm text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Favoris */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
          <Heart className="w-5 h-5 text-red-500" /> Mes favoris
        </h2>
        {recentFavorites.length === 0 ? (
          <p className="text-slate-500 text-sm">
            Aucun favori pour le moment. Parcourez les ressources et ajoutez-les !
          </p>
        ) : (
          <div className="space-y-3">
            {recentFavorites.map((f) => (
              <a
                key={f.id}
                href={`/ressources/${f.resource.numericId}/${f.resource.slug}`}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition"
              >
                <div className="w-10 h-12 bg-slate-100 rounded flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className={`font-semibold text-sm truncate ${isArabic(f.resource.title) ? 'text-right' : 'text-left'}`}
                    dir={isArabic(f.resource.title) ? 'rtl' : 'ltr'}
                    lang={isArabic(f.resource.title) ? 'ar' : 'fr'}
                  >
                    {f.resource.title}
                  </div>
                  <div className="text-xs text-slate-500">
                    {f.resource.subject.nameFr} · {f.resource.class?.nameFr}
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
