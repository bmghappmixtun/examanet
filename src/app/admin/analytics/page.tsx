// @ts-nocheck
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { Users, FileText, TrendingUp, Activity } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Analytics — Admin',
};

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

export default async function AdminAnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');
  if (user.role !== 'ADMIN') redirect('/');

  const db = await getD1();
  const sevenDaysAgo = Date.now() - 7 * 86400 * 1000;
  const thirtyDaysAgo = Date.now() - 30 * 86400 * 1000;
  const fourteenDaysAgo = Date.now() - 14 * 86400 * 1000;

  // Aggregate counts (D1 has no View/Download/Comment/Rating/Favorite/Follow tables)
  const [
    totalUsersR,
    newUsers7R,
    newUsersPrev7R,
    totalResourcesR,
    publishedR,
    newResources7R,
    newResourcesPrev7R,
    totalDownloadsR,
    activeTeachersR,
    pendingResourcesR,
  ] = await Promise.all([
    db.prepare('SELECT COUNT(*) as c FROM User').first(),
    db.prepare('SELECT COUNT(*) as c FROM User WHERE createdAt > ?').bind(sevenDaysAgo).first(),
    db.prepare('SELECT COUNT(*) as c FROM User WHERE createdAt > ? AND createdAt <= ?').bind(fourteenDaysAgo, sevenDaysAgo).first(),
    db.prepare('SELECT COUNT(*) as c FROM Resource').first(),
    db.prepare("SELECT COUNT(*) as c FROM Resource WHERE status = 'PUBLISHED'").first(),
    db.prepare('SELECT COUNT(*) as c FROM Resource WHERE createdAt > ?').bind(sevenDaysAgo).first(),
    db.prepare('SELECT COUNT(*) as c FROM Resource WHERE createdAt > ? AND createdAt <= ?').bind(fourteenDaysAgo, sevenDaysAgo).first(),
    db.prepare("SELECT SUM(downloadsCount) as s FROM Resource WHERE status = 'PUBLISHED'").first(),
    db.prepare("SELECT COUNT(*) as c FROM User WHERE role = 'TEACHER' AND status = 'ACTIVE'").first(),
    db.prepare("SELECT COUNT(*) as c FROM Resource WHERE status = 'PENDING_APPROVAL'").first(),
  ]);

  const num = (v: any) => (v == null ? 0 : Number(v) || 0);
  const totalUsers = num(totalUsersR?.c);
  const newUsers7 = num(newUsers7R?.c);
  const newUsersPrev7 = num(newUsersPrev7R?.c);
  const totalResources = num(totalResourcesR?.c);
  const published = num(publishedR?.c);
  const newResources7 = num(newResources7R?.c);
  const newResourcesPrev7 = num(newResourcesPrev7R?.c);
  const totalDownloads = num(totalDownloadsR?.s);
  const activeTeachers = num(activeTeachersR?.c);
  const pendingResources = num(pendingResourcesR?.c);

  const userDelta = newUsersPrev7 > 0 ? Math.round(((newUsers7 - newUsersPrev7) / newUsersPrev7) * 100) : 0;
  const resourceDelta = newResourcesPrev7 > 0 ? Math.round(((newResources7 - newResourcesPrev7) / newResourcesPrev7) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold flex items-center gap-2">
          <Activity className="w-7 h-7 text-primary-500" />
          Analytics
        </h1>
        <p className="text-slate-500 mt-1">Vue d'ensemble de l'activité de la plateforme (D1 direct)</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Utilisateurs', value: totalUsers, sub: `+${newUsers7} cette semaine`, delta: userDelta, icon: Users, color: 'blue' },
          { label: 'Ressources', value: totalResources, sub: `${published} publiées`, icon: FileText, color: 'emerald' },
          { label: 'Téléchargements', value: totalDownloads, sub: 'cumul', icon: TrendingUp, color: 'amber' },
          { label: 'Enseignants actifs', value: activeTeachers, sub: 'statut ACTIVE', icon: Users, color: 'purple' },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-xl p-5 border border-slate-100">
            <div className={`w-10 h-10 rounded-lg bg-${s.color}-100 flex items-center justify-center mb-3`}>
              <s.icon className={`w-5 h-5 text-${s.color}-600`} />
            </div>
            <div className="text-2xl font-extrabold">{formatNumber(s.value)}</div>
            <div className="text-sm font-semibold text-slate-700">{s.label}</div>
            <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
              {s.sub}
              {s.delta !== undefined && s.delta !== 0 && (
                <span className={s.delta > 0 ? 'text-emerald-600' : 'text-red-600'}>
                  ({s.delta > 0 ? '+' : ''}{s.delta}%)
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        ℹ️ <strong>Note:</strong> Les graphiques détaillés (vues journalières, top resources, top teachers)
        ne sont pas encore disponibles en D1. Les compteurs ci-dessus sont mis à jour depuis les tables
        Resource et User directement.
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h2 className="font-bold text-lg mb-3">📊 Activité 7 derniers jours</h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-sm">Nouveaux utilisateurs</span>
              <span className="font-bold">+{newUsers7}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-sm">Nouvelles ressources</span>
              <span className="font-bold">+{newResources7}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-sm">Ressources en attente d'approbation</span>
              <span className="font-bold text-amber-600">{pendingResources}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h2 className="font-bold text-lg mb-3">🏆 Tendances</h2>
          <div className="space-y-2 text-sm text-slate-600">
            <p>• Taux d'approbation: {published > 0 ? Math.round((published / totalResources) * 100) : 0}%</p>
            <p>• Ratio étudiants/profs: {totalUsers > 0 ? Math.round((totalUsers - activeTeachers) / Math.max(1, activeTeachers)) : 0}:1</p>
            <p>• Téléchargements par ressource: {published > 0 ? Math.round(totalDownloads / published) : 0}</p>
            <p>• Croissance hebdo: {userDelta > 0 ? '+' : ''}{userDelta}% (users) / {resourceDelta > 0 ? '+' : ''}{resourceDelta}% (resources)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
