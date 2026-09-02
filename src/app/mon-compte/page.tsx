// @ts-nocheck
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
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

  const [favoritesCount, commentsCount, ratingsCount, recentActivity] = await Promise.all([
    prisma.favorite.count({ where: { userId: user.id } }),
    prisma.comment.count({ where: { userId: user.id } }),
    prisma.rating.count({ where: { userId: user.id } }),
    prisma.view.count({ where: { userId: user.id } }),
  ]);

  const recentFavorites = await prisma.favorite.findMany({
    where: { userId: user.id },
    take: 4,
    orderBy: { createdAt: 'desc' },
    include: { resource: { include: { subject: true, class: true } } },
  });

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
