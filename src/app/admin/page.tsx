// @ts-nocheck
/**
 * /admin dashboard
 *
 * 2026-08-30: Rewrote to use raw D1 SQL (prisma-compat points at Neon which
 * has no data). Same KPI numbers and layout, just D1 direct.
 */
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import Link from 'next/link';
import { Users, FileText, Star, Download, AlertCircle, Settings } from 'lucide-react';
import { formatNumber, timeAgo } from '@/lib/utils';
import { isArabic } from '@/lib/text-utils';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Administration',
  description: 'Espace administrateur Examanet — gestion de la plateforme pédagogique.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

function num(v: any): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default async function AdminDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');

  // ADMIN only
  if (user.role !== 'ADMIN') {
    if (user.role === 'TEACHER') redirect('/enseignant');
    redirect('/mon-compte');
  }

  const db = await getD1();

  const safeFirst = async (sql: string, ...params: any[]) => {
    try {
      const stmt = db.prepare(sql);
      const r = await (params.length ? stmt.bind(...params) : stmt).first();
      return r;
    } catch (e: any) {
      console.error('[admin/page] query failed:', sql.slice(0, 60), e.message);
      return null;
    }
  };
  const safeAll = async (sql: string, ...params: any[]) => {
    try {
      const stmt = db.prepare(sql);
      const r = await (params.length ? stmt.bind(...params) : stmt).all();
      return r?.results || [];
    } catch (e: any) {
      console.error('[admin/page] query failed:', sql.slice(0, 60), e.message);
      return [];
    }
  };

  const [
    totalUsersR,
    totalStudentsR,
    totalTeachersR,
    pendingTeachersR,
    pendingVerificationsR,
    totalResourcesR,
    publishedResourcesR,
    pendingResourcesR,
    totalDownloadsR,
    totalRatingsR,
    totalCommentsR,
    recentResources,
    recentUsers,
  ] = await Promise.all([
    safeFirst('SELECT COUNT(*) as c FROM User'),
    safeFirst("SELECT COUNT(*) as c FROM User WHERE role = 'STUDENT'"),
    safeFirst("SELECT COUNT(*) as c FROM User WHERE role = 'TEACHER'"),
    safeFirst("SELECT COUNT(*) as c FROM User WHERE role = 'TEACHER' AND status = 'PENDING_APPROVAL'"),
    safeFirst("SELECT COUNT(*) as c FROM User WHERE role = 'TEACHER' AND status = 'PENDING_REVIEW'"),
    safeFirst('SELECT COUNT(*) as c FROM Resource'),
    safeFirst("SELECT COUNT(*) as c FROM Resource WHERE status = 'PUBLISHED'"),
    safeFirst("SELECT COUNT(*) as c FROM Resource WHERE status = 'PENDING_APPROVAL'"),
    safeFirst("SELECT SUM(downloadsCount) as s FROM Resource WHERE status = 'PUBLISHED'"),
    safeFirst('SELECT COUNT(*) as c FROM Rating'),
    safeFirst('SELECT COUNT(*) as c FROM Comment'),
    safeAll(
      `SELECT r.id, r.title, r.status, r.createdAt,
              s.nameFr as subjectNameFr,
              t.firstName as teacherFirstName, t.lastName as teacherLastName
       FROM Resource r
       LEFT JOIN Subject s ON r.subjectId = s.id
       LEFT JOIN User t ON r.teacherId = t.id
       WHERE r.status IN ('PENDING_APPROVAL', 'PUBLISHED')
       ORDER BY r.createdAt DESC
       LIMIT 8`,
    ),
    safeAll(
      `SELECT id, firstName, lastName, email, role, status, createdAt
       FROM User
       ORDER BY createdAt DESC
       LIMIT 6`,
    ),
  ]);

  const totalUsers = num(totalUsersR?.c);
  const totalStudents = num(totalStudentsR?.c);
  const totalTeachers = num(totalTeachersR?.c);
  const pendingTeachers = num(pendingTeachersR?.c);
  const pendingVerifications = num(pendingVerificationsR?.c);
  const totalResources = num(totalResourcesR?.c);
  const publishedResources = num(publishedResourcesR?.c);
  const pendingResources = num(pendingResourcesR?.c);
  const totalDownloads = num(totalDownloadsR?.s);
  const totalRatings = num(totalRatingsR?.c);

  const recentResourcesList = (recentResources || []).map((r: any) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    createdAt: r.createdAt,
    subject: { nameFr: r.subjectNameFr },
    teacher: { firstName: r.teacherFirstName, lastName: r.teacherLastName },
  }));
  const recentUsersList = recentUsers || [];

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-6">🛡️ Dashboard Administrateur</h1>

      {/* Quick admin links */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/admin/parametres"
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl hover:border-primary-400 hover:bg-primary-50 transition text-sm font-semibold"
        >
          <Settings className="w-4 h-4" />
          Catalogue (matières, classes, sections, niveaux)
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          {
            icon: Users,
            value: totalUsers,
            label: 'Utilisateurs',
            sub: `${totalStudents} élèves · ${totalTeachers} enseignants`,
            color: 'from-blue-500 to-blue-600',
            bg: 'bg-blue-100',
            text: 'text-blue-600',
          },
          {
            icon: FileText,
            value: totalResources,
            label: 'Ressources',
            sub: `${publishedResources} publiées`,
            color: 'from-emerald-500 to-emerald-600',
            bg: 'bg-emerald-100',
            text: 'text-emerald-600',
          },
          {
            icon: Download,
            value: totalDownloads,
            label: 'Téléchargements',
            color: 'from-amber-500 to-amber-600',
            bg: 'bg-amber-100',
            text: 'text-amber-600',
          },
          {
            icon: Star,
            value: totalRatings,
            label: 'Avis déposés',
            color: 'from-purple-500 to-purple-600',
            bg: 'bg-purple-100',
            text: 'text-purple-600',
          },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-xl p-5 border border-slate-100">
            <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center mb-3`}>
              <s.icon className={`w-5 h-5 ${s.text}`} />
            </div>
            <div className="text-2xl font-extrabold">{formatNumber(s.value as number)}</div>
            <div className="text-sm font-semibold text-slate-700">{s.label}</div>
            {s.sub && <div className="text-xs text-slate-400 mt-0.5">{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Alerts */}
      {(pendingTeachers > 0 || pendingResources > 0) && (
        <div className="grid sm:grid-cols-2 gap-4 mb-8">
          {pendingTeachers > 0 && (
            <Link
              href="/admin/approbations"
              className="flex items-center justify-between p-5 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100 transition"
            >
              <div>
                <div className="font-bold text-amber-800">
                  ⏳ {pendingTeachers} enseignant{pendingTeachers > 1 ? 's' : ''} en attente
                </div>
                <div className="text-sm text-amber-600">Cliquez pour approuver ou rejeter</div>
              </div>
              <AlertCircle className="w-6 h-6 text-amber-500" />
            </Link>
          )}
          {pendingResources > 0 && (
            <Link
              href="/admin/approbations"
              className="flex items-center justify-between p-5 bg-orange-50 border border-orange-200 rounded-xl hover:bg-orange-100 transition"
            >
              <div>
                <div className="font-bold text-orange-800">
                  📄 {pendingResources} ressource{pendingResources > 0 ? 's' : ''} à valider
                </div>
                <div className="text-sm text-orange-600">Cliquez pour examiner</div>
              </div>
              <FileText className="w-6 h-6 text-orange-500" />
            </Link>
          )}
          {pendingVerifications > 0 && (
            <Link
              href="/admin/verifications"
              className="flex items-center justify-between p-5 bg-violet-50 border border-violet-200 rounded-xl hover:bg-violet-100 transition"
            >
              <div>
                <div className="font-bold text-violet-800">
                  🛡️ {pendingVerifications} vérification{pendingVerifications > 1 ? 's' : ''} en attente
                </div>
                <div className="text-sm text-violet-600">Cliquez pour examiner les fichiers</div>
              </div>
              <Shield className="w-6 h-6 text-violet-500" />
            </Link>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent resources */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg">📄 Dernières ressources</h2>
            <Link
              href="/admin/ressources"
              className="text-sm text-primary-600 font-semibold hover:underline"
            >
              Tout voir →
            </Link>
          </div>
          <div className="space-y-3">
            {recentResourcesList.map((r: any) => (
              <div
                key={r.id}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-8 h-10 bg-slate-100 rounded flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="min-w-0">
                    <div
                      className={`font-semibold text-sm truncate ${isArabic(r.title) ? 'text-right' : 'text-left'}`}
                      dir={isArabic(r.title) ? 'rtl' : 'ltr'}
                      lang={isArabic(r.title) ? 'ar' : 'fr'}
                    >
                      {r.title}
                    </div>
                    <div className="text-xs text-slate-500">
                      {r.teacher?.firstName} {r.teacher?.lastName} · {r.subject?.nameFr}
                    </div>
                  </div>
                </div>
                <span
                  className={`px-2 py-1 text-xs font-bold rounded flex-shrink-0 ${
                    r.status === 'PUBLISHED'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {r.status === 'PUBLISHED' ? '✓' : '⏳'}
                </span>
              </div>
            ))}
            {recentResourcesList.length === 0 && (
              <div className="text-sm text-slate-400 text-center py-6">Aucune ressource récente</div>
            )}
          </div>
        </div>

        {/* Recent users */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg">👥 Derniers inscrits</h2>
            <Link
              href="/admin/utilisateurs"
              className="text-sm text-primary-600 font-semibold hover:underline"
            >
              Tout voir →
            </Link>
          </div>
          <div className="space-y-3">
            {recentUsersList.map((u: any) => (
              <div
                key={u.id}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-white font-bold text-xs flex items-center justify-center">
                    {(u.firstName?.[0] || u.email?.[0] || '?').toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-sm">
                      {u.firstName} {u.lastName}
                    </div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`px-2 py-1 text-xs font-bold rounded ${
                      u.role === 'ADMIN'
                        ? 'bg-red-100 text-red-700'
                        : u.role === 'TEACHER'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {u.role === 'ADMIN' ? 'Admin' : u.role === 'TEACHER' ? 'Prof' : 'Élève'}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">{timeAgo(u.createdAt)}</div>
                </div>
              </div>
            ))}
            {recentUsersList.length === 0 && (
              <div className="text-sm text-slate-400 text-center py-6">Aucun utilisateur récent</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
