// @ts-nocheck
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { Users, FileText, TrendingUp, Activity, Download, Award, BookOpen, GraduationCap } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { cachedD1Query } from '@/lib/kv-cache';
import { getVisitors, padVisitorsData } from '@/lib/analytics/ga-api';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Analytics — Admin',
};

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

// Format ms timestamp to YYYY-MM-DD in UTC
function fmtDay(ts: number): string {
  const d = new Date(ts);
  return d.toISOString().slice(0, 10);
}

// Format ms timestamp to MM-DD
function fmtShort(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
}

export default async function AdminAnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');
  if (user.role !== 'ADMIN') redirect('/');

  const db = await getD1();
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 86400 * 1000;
  const fourteenDaysAgo = now - 14 * 86400 * 1000;
  const thirtyDaysAgo = now - 30 * 86400 * 1000;

  // 1. HERO STATS — single combined query, KV-cached 5min.
  const stats: any = await cachedD1Query({
    key: 'analytics-stats-v2',
    ttl: 300,
    query: () =>
      db
        .prepare(
          [
            'SELECT',
            '  (SELECT COUNT(*) FROM User) AS totalUsers,',
            '  (SELECT COUNT(*) FROM User WHERE createdAt > ?) AS newUsers7,',
            '  (SELECT COUNT(*) FROM User WHERE createdAt > ? AND createdAt <= ?) AS newUsersPrev7,',
            '  (SELECT COUNT(*) FROM Resource WHERE status = \'PUBLISHED\' AND isHidden = 0) AS published,',
            '  (SELECT COUNT(*) FROM Resource) AS totalResources,',
            '  (SELECT COUNT(*) FROM Resource WHERE status = \'PUBLISHED\' AND isHidden = 0 AND createdAt > ?) AS newResources7,',
            '  (SELECT COUNT(*) FROM Resource WHERE status = \'PUBLISHED\' AND isHidden = 0 AND createdAt > ? AND createdAt <= ?) AS newResourcesPrev7,',
            '  (SELECT COALESCE(SUM(downloadsCount), 0) FROM Resource WHERE status = \'PUBLISHED\' AND isHidden = 0) AS totalDownloads,',
            '  (SELECT COUNT(*) FROM Download WHERE createdAt > ?) AS downloads7,',
            '  (SELECT COUNT(*) FROM Download WHERE createdAt > ? AND createdAt <= ?) AS downloadsPrev7,',
            '  (SELECT COUNT(*) FROM User WHERE role = \'TEACHER\' AND status = \'ACTIVE\') AS activeTeachers,',
            '  (SELECT COUNT(*) FROM User WHERE role = \'STUDENT\') AS students,',
            '  (SELECT COUNT(*) FROM Resource WHERE status = \'PENDING_APPROVAL\') AS pendingResources',
          ].join('\n'),
        )
        .bind(
          sevenDaysAgo, fourteenDaysAgo, sevenDaysAgo,
          sevenDaysAgo, fourteenDaysAgo, sevenDaysAgo,
          sevenDaysAgo, fourteenDaysAgo, sevenDaysAgo,
        )
        .first(),
  });

  const num = (v: any) => (v == null ? 0 : Number(v) || 0);
  const totalUsers = num(stats?.totalUsers);
  const newUsers7 = num(stats?.newUsers7);
  const newUsersPrev7 = num(stats?.newUsersPrev7);
  const totalResources = num(stats?.totalResources);
  const published = num(stats?.published);
  const newResources7 = num(stats?.newResources7);
  const newResourcesPrev7 = num(stats?.newResourcesPrev7);
  const totalDownloads = num(stats?.totalDownloads);
  const downloads7 = num(stats?.downloads7);
  const downloadsPrev7 = num(stats?.downloadsPrev7);
  const activeTeachers = num(stats?.activeTeachers);
  const students = num(stats?.students);
  const pendingResources = num(stats?.pendingResources);

  const userDelta = newUsersPrev7 > 0 ? Math.round(((newUsers7 - newUsersPrev7) / newUsersPrev7) * 100) : 0;
  const resourceDelta = newResourcesPrev7 > 0 ? Math.round(((newResources7 - newResourcesPrev7) / newResourcesPrev7) * 100) : 0;
  const downloadDelta = downloadsPrev7 > 0 ? Math.round(((downloads7 - downloadsPrev7) / downloadsPrev7) * 100) : 0;

  // 2. DAILY ACTIVITY 7d (3 series) — single query, cached 5min
  const daily: any = await cachedD1Query({
    key: 'analytics-daily-v1',
    ttl: 300,
    query: () =>
      db
        .prepare(
          `SELECT day, users, resources, downloads FROM (
            SELECT
              (s.createdAt / 86400000) * 86400000 AS day,
              SUM(s.isUser) AS users,
              SUM(s.isResource) AS resources,
              SUM(s.isDownload) AS downloads
            FROM (
              SELECT createdAt, 1 AS isUser, 0 AS isResource, 0 AS isDownload FROM User WHERE createdAt > ?
              UNION ALL
              SELECT createdAt, 0, 1, 0 FROM Resource WHERE createdAt > ? AND status = 'PUBLISHED' AND isHidden = 0
              UNION ALL
              SELECT createdAt, 0, 0, 1 FROM Download WHERE createdAt > ?
            ) s
            GROUP BY day
          )
          ORDER BY day ASC`,
        )
        .bind(sevenDaysAgo, sevenDaysAgo, sevenDaysAgo)
        .all(),
  });
  const dailyRows = Array.isArray(daily) ? daily : (daily?.results || []);

  // Build last 7 days with 0 defaults
  const days: {
    ts: number;
    users: number;        // NEW users (registered this day)
    resources: number;    // NEW resources published this day
    downloads: number;    // Downloads this day
    visitors: number;     // GA visitors (unique users) this day
    totalStudents: number;// CUMULATIVE total students up to this day
  }[] = [];
  for (let i = 6; i >= 0; i--) {
    const ts = (Math.floor(now / 86400000) - i) * 86400000;
    days.push({ ts, users: 0, resources: 0, downloads: 0, visitors: 0, totalStudents: 0 });
  }
  for (const r of dailyRows) {
    const ts = Number(r.day);
    const idx = days.findIndex((d) => d.ts === ts);
    if (idx >= 0) {
      days[idx].users = num(r.users);
      days[idx].resources = num(r.resources);
      days[idx].downloads = num(r.downloads);
    }
  }

  // 2b. CUMULATIVE students: count all students created before each day
  const totalStudentsRow: any = await cachedD1Query({
    key: 'analytics-total-students-v1',
    ttl: 300,
    query: () =>
      db
        .prepare("SELECT COUNT(*) AS n FROM User WHERE role = 'STUDENT'")
        .first(),
  });
  const totalStudentsEver = num(totalStudentsRow?.n);

  // Get the count of students who joined BEFORE the 7-day window start
  // so we can compute cumulative for each of the 7 days
  const studentsBeforeWindow: any = await cachedD1Query({
    key: 'analytics-students-before-7d-v1',
    ttl: 300,
    query: () =>
      db
        .prepare("SELECT COUNT(*) AS n FROM User WHERE role = 'STUDENT' AND createdAt <= ?")
        .bind(sevenDaysAgo)
        .first(),
  });
  let cumulative = num(studentsBeforeWindow?.n);
  for (const d of days) {
    cumulative += d.users; // 'users' here is new user registrations on that day (any role, but mostly students)
    d.totalStudents = cumulative;
  }

  // 2c. GA visitors per day (real visitors, not just registrations)
  const rawVisitors = await getVisitors(7);
  const visitors = padVisitorsData(rawVisitors, 7);
  for (let i = 0; i < days.length; i++) {
    days[i].visitors = visitors[i]?.visitors || 0;
  }

  const maxSeries = Math.max(
    1,
    ...days.flatMap((d) => [d.users, d.resources, d.downloads, d.visitors])
  );
  const maxStudents = Math.max(1, ...days.map((d) => d.totalStudents));

  // 3. RESOURCES BY TYPE
  const byType: any = await cachedD1Query({
    key: 'analytics-bytype-v1',
    ttl: 300,
    query: () =>
      db
        .prepare(
          `SELECT type, COUNT(*) AS n, COALESCE(SUM(downloadsCount), 0) AS downloads
           FROM Resource WHERE status = 'PUBLISHED' AND isHidden = 0
           GROUP BY type ORDER BY n DESC LIMIT 8`,
        )
        .all(),
  });
  const typeRows = Array.isArray(byType) ? byType : (byType?.results || []);
  const maxType = Math.max(1, ...typeRows.map((r: any) => num(r.n)));

  // 4. RESOURCES BY LANGUAGE
  const byLang: any = await cachedD1Query({
    key: 'analytics-bylang-v1',
    ttl: 300,
    query: () =>
      db
        .prepare(
          `SELECT language, COUNT(*) AS n FROM Resource
           WHERE status = 'PUBLISHED' AND isHidden = 0
           GROUP BY language ORDER BY n DESC`,
        )
        .all(),
  });
  const langRows = Array.isArray(byLang) ? byLang : (byLang?.results || []);

  // 5. TOP 5 TEACHERS (by actual published resources count)
  const topTeachers: any = await cachedD1Query({
    key: 'analytics-topteachers-v1',
    ttl: 300,
    query: () =>
      db
        .prepare(
          `SELECT u.id, u.firstName, u.lastName, u.schoolName,
                  u.uploadsCount, u.followersCount,
                  (SELECT COUNT(*) FROM Resource WHERE teacherId = u.id AND status = 'PUBLISHED' AND isHidden = 0) AS actualCount
           FROM User u
           WHERE u.role = 'TEACHER' AND u.status = 'ACTIVE'
           ORDER BY actualCount DESC LIMIT 5`,
        )
        .all(),
  });
  const teacherRows = Array.isArray(topTeachers) ? topTeachers : (topTeachers?.results || []);

  // 6. TOP 5 RESOURCES by downloads
  const topResources: any = await cachedD1Query({
    key: 'analytics-topresources-v1',
    ttl: 300,
    query: () =>
      db
        .prepare(
          `SELECT r.id, r.title, r.type, r.language, r.downloadsCount, r.viewsCount, r.avgRating,
                  u.firstName, u.lastName
           FROM Resource r LEFT JOIN User u ON r.teacherId = u.id
           WHERE r.status = 'PUBLISHED' AND r.isHidden = 0
           ORDER BY r.downloadsCount DESC LIMIT 5`,
        )
        .all(),
  });
  const topResourceRows = Array.isArray(topResources) ? topResources : (topResources?.results || []);

  // 7. RESOURCES BY CLASS LEVEL
  const byLevel: any = await cachedD1Query({
    key: 'analytics-bylevel-v1',
    ttl: 300,
    query: () =>
      db
        .prepare(
          `SELECT l.nameFr AS levelName, c.nameFr AS className, COUNT(r.id) AS n
           FROM Class c
           LEFT JOIN Level l ON c.levelId = l.id
           LEFT JOIN Resource r ON r.classId = c.id AND r.status = 'PUBLISHED' AND r.isHidden = 0
           GROUP BY c.id ORDER BY n DESC LIMIT 8`,
        )
        .all(),
  });
  const levelRows = Array.isArray(byLevel) ? byLevel : (byLevel?.results || []);
  const maxLevel = Math.max(1, ...levelRows.map((r: any) => num(r.n)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold flex items-center gap-2">
          <Activity className="w-7 h-7 text-primary-500" />
          Analytics
        </h1>
        <p className="text-slate-500 mt-1">Vue d'ensemble de l'activité de la plateforme (D1 direct)</p>
      </div>

      {/* HERO STATS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Utilisateurs', value: totalUsers, sub: `+${newUsers7} cette semaine`, delta: userDelta, icon: Users, color: 'blue' },
          { label: 'Ressources', value: published, sub: `${newResources7} nouvelles (7j)`, delta: resourceDelta, icon: FileText, color: 'emerald' },
          { label: 'Téléchargements', value: totalDownloads, sub: `+${downloads7} cette semaine`, delta: downloadDelta, icon: Download, color: 'amber' },
          { label: 'Enseignants actifs', value: activeTeachers, sub: `${students} étudiants`, icon: Award, color: 'purple' },
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

      {/* DAILY ACTIVITY 7d — SVG line chart */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <h2 className="font-bold text-lg mb-1">📈 Activité des 7 derniers jours</h2>
        <p className="text-xs text-slate-400 mb-4">Nouveaux utilisateurs, ressources, téléchargements et visiteurs uniques par jour</p>
        <div className="flex items-center gap-4 text-xs text-slate-600 mb-3 flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-500" /> Utilisateurs inscrits</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500" /> Ressources</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-500" /> Téléchargements</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-purple-500" style={{ background: '#A855F7' }} /> Visiteurs (GA)</span>
        </div>
        <Chart days={days} maxSeries={maxSeries} showVisitors />
      </div>

      {/* ÉLÈVES — cumul + nouveaux par jour */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-bold text-lg mb-1">👨‍🎓 Évolution des élèves inscrits</h2>
            <p className="text-xs text-slate-400">Total cumulé et nouveaux inscrits par jour (7 derniers jours)</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-extrabold text-primary-600">{formatNumber(totalStudentsEver)}</div>
            <div className="text-xs text-slate-400">élèves au total</div>
          </div>
        </div>
        <StudentsChart days={days} maxStudents={maxStudents} />
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="text-xs text-slate-500">Aujourd'hui</div>
            <div className="text-lg font-bold text-emerald-600">+{formatNumber(days[6]?.users || 0)}</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="text-xs text-slate-500">Cette semaine</div>
            <div className="text-lg font-bold text-emerald-600">+{formatNumber(days.reduce((s, d) => s + d.users, 0))}</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="text-xs text-slate-500">Visiteurs (7j)</div>
            <div className="text-lg font-bold text-purple-600">{formatNumber(days.reduce((s, d) => s + d.visitors, 0))}</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="text-xs text-slate-500">Visiteurs aujourd'hui</div>
            <div className="text-lg font-bold text-purple-600">{formatNumber(days[6]?.visitors || 0)}</div>
          </div>
        </div>
      </div>

      {/* TWO-COLUMN: BY TYPE + BY LANGUAGE */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h2 className="font-bold text-lg mb-1">📚 Ressources par type</h2>
          <p className="text-xs text-slate-400 mb-4">Top 8 types de contenus publiés</p>
          {typeRows.length === 0 ? (
            <p className="text-sm text-slate-400 italic">Aucune donnée</p>
          ) : (
            <div className="space-y-2.5">
              {typeRows.map((r: any) => (
                <div key={r.type} className="flex items-center gap-2 text-sm">
                  <span className="w-24 text-slate-600 font-medium truncate">{r.type}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${(num(r.n) / maxType) * 100}%` }}
                    />
                  </div>
                  <span className="w-12 text-right font-bold tabular-nums">{formatNumber(num(r.n))}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h2 className="font-bold text-lg mb-1">🌍 Par langue</h2>
          <p className="text-xs text-slate-400 mb-4">Répartition des ressources publiées</p>
          {langRows.length === 0 ? (
            <p className="text-sm text-slate-400 italic">Aucune donnée</p>
          ) : (
            <div className="space-y-2.5">
              {langRows.map((r: any) => {
                const pct = published > 0 ? (num(r.n) / published) * 100 : 0;
                return (
                  <div key={r.language} className="flex items-center gap-2 text-sm">
                    <span className="w-12 text-slate-600 font-medium uppercase">{r.language || '—'}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-16 text-right text-slate-500 tabular-nums">{formatNumber(num(r.n))} <span className="text-xs text-slate-400">({pct.toFixed(1)}%)</span></span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* TOP 5 RESOURCES + TOP 5 TEACHERS */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h2 className="font-bold text-lg mb-1">🏆 Top 5 ressources</h2>
          <p className="text-xs text-slate-400 mb-4">Les plus téléchargées</p>
          {topResourceRows.length === 0 ? (
            <p className="text-sm text-slate-400 italic">Aucun téléchargement enregistré</p>
          ) : (
            <ol className="space-y-2.5 text-sm">
              {topResourceRows.map((r: any, i: number) => (
                <li key={r.id} className="flex items-start gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-800 line-clamp-1">{r.title}</div>
                    <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{r.type}</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 uppercase">{r.language}</span>
                      <span>👤 {[r.firstName, r.lastName].filter(Boolean).join(' ') || '—'}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-amber-600">⬇ {formatNumber(num(r.downloadsCount))}</div>
                    <div className="text-xs text-slate-400">👁 {formatNumber(num(r.viewsCount))}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h2 className="font-bold text-lg mb-1">👨‍🏫 Top 5 enseignants</h2>
          <p className="text-xs text-slate-400 mb-4">Par nombre de ressources publiées</p>
          {teacherRows.length === 0 ? (
            <p className="text-sm text-slate-400 italic">Aucun enseignant actif</p>
          ) : (
            <ol className="space-y-2.5 text-sm">
              {teacherRows.map((r: any, i: number) => (
                <li key={r.id} className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i === 0 ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-800 truncate">
                      {[r.firstName, r.lastName].filter(Boolean).join(' ') || '—'}
                    </div>
                    <div className="text-xs text-slate-400 truncate">
                      {r.schoolName || 'École non renseignée'}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-purple-600">📄 {formatNumber(num(r.actualCount))}</div>
                    <div className="text-xs text-slate-400">⬇ {formatNumber(num(r.followersCount))} abonnés</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* RESOURCES BY LEVEL */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <h2 className="font-bold text-lg mb-1">🎓 Répartition par classe</h2>
        <p className="text-xs text-slate-400 mb-4">Top 8 classes par nombre de ressources</p>
        {levelRows.length === 0 ? (
          <p className="text-sm text-slate-400 italic">Aucune donnée</p>
        ) : (
          <div className="space-y-2.5">
            {levelRows.map((r: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="w-32 text-slate-500 text-xs truncate" title={r.levelName}>{r.levelName || '—'}</span>
                <span className="w-48 text-slate-700 font-medium truncate" title={r.className}>{r.className}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full"
                    style={{ width: `${(num(r.n) / maxLevel) * 100}%` }}
                  />
                </div>
                <span className="w-12 text-right font-bold tabular-nums">{formatNumber(num(r.n))}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PENDING + TRENDS */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h2 className="font-bold text-lg mb-3">📋 Modération</h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-sm">En attente d'approbation</span>
              <span className={`font-bold ${pendingResources > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{pendingResources}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-sm">Nouveaux cette semaine</span>
              <span className="font-bold">+{newUsers7} users / +{newResources7} ressources</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm">Taux d'approbation</span>
              <span className="font-bold">{totalResources > 0 ? Math.round((published / totalResources) * 100) : 0}%</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h2 className="font-bold text-lg mb-3">📊 Tendances</h2>
          <div className="space-y-2 text-sm text-slate-600">
            <p>• Téléchargements par ressource: <strong>{published > 0 ? (totalDownloads / published).toFixed(1) : '0'}</strong></p>
            <p>• Étudiants par enseignant: <strong>{activeTeachers > 0 ? (students / activeTeachers).toFixed(1) : '0'}:1</strong></p>
            <p>• Croissance hebdo: <strong className={userDelta > 0 ? 'text-emerald-600' : userDelta < 0 ? 'text-red-600' : ''}>{userDelta > 0 ? '+' : ''}{userDelta}%</strong> users / <strong className={resourceDelta > 0 ? 'text-emerald-600' : resourceDelta < 0 ? 'text-red-600' : ''}>{resourceDelta > 0 ? '+' : ''}{resourceDelta}%</strong> ressources</p>
            <p>• DL cette semaine: <strong className={downloadDelta > 0 ? 'text-emerald-600' : downloadDelta < 0 ? 'text-red-600' : ''}>{downloadDelta > 0 ? '+' : ''}{downloadDelta}%</strong></p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Inline SVG line chart — keeps bundle small (no recharts/visx)
function Chart({
  days,
  maxSeries,
  showVisitors = false,
}: {
  days: { ts: number; users: number; resources: number; downloads: number; visitors: number }[];
  maxSeries: number;
  showVisitors?: boolean;
}) {
  if (days.every((d) => d.users + d.resources + d.downloads + (showVisitors ? d.visitors : 0) === 0)) {
    return <p className="text-sm text-slate-400 italic py-6 text-center">Aucune activité sur les 7 derniers jours</p>;
  }

  const W = 800;
  const H = 200;
  const PAD = 30;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;
  const xStep = innerW / Math.max(1, days.length - 1);

  const point = (i: number, val: number) => {
    const x = PAD + i * xStep;
    const y = PAD + innerH - (val / maxSeries) * innerH;
    return [x, y];
  };

  const buildPath = (key: 'users' | 'resources' | 'downloads' | 'visitors') => {
    return days
      .map((d, i) => {
        const [x, y] = point(i, d[key]);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const colors = {
    users: '#3B82F6',
    resources: '#10B981',
    downloads: '#F59E0B',
    visitors: '#A855F7', // purple for visitors
  };

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet" style={{ minWidth: 480 }}>
        {/* Y axis grid lines (4 ticks) */}
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
          const y = PAD + innerH * (1 - p);
          return (
            <g key={i}>
              <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="#F1F5F9" strokeWidth={1} />
              <text x={PAD - 6} y={y + 3} textAnchor="end" className="text-[10px] fill-slate-400">
                {Math.round(maxSeries * p)}
              </text>
            </g>
          );
        })}

        {/* X axis labels (days) */}
        {days.map((d, i) => {
          const x = PAD + i * xStep;
          return (
            <text
              key={i}
              x={x}
              y={H - 8}
              textAnchor="middle"
              className="text-[10px] fill-slate-500"
            >
              {fmtShort(d.ts)}
            </text>
          );
        })}

        {/* Lines */}
        <path d={buildPath('downloads')} fill="none" stroke={colors.downloads} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        <path d={buildPath('resources')} fill="none" stroke={colors.resources} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        <path d={buildPath('users')} fill="none" stroke={colors.users} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {showVisitors && <path d={buildPath('visitors')} fill="none" stroke={colors.visitors} strokeWidth={2.5} strokeDasharray="4 3" strokeLinejoin="round" strokeLinecap="round" />}

        {/* Dots */}
        {days.map((d, i) => {
          const [xu, yu] = point(i, d.users);
          const [xr, yr] = point(i, d.resources);
          const [xd, yd] = point(i, d.downloads);
          const [xv, yv] = point(i, d.visitors);
          return (
            <g key={i}>
              {d.users > 0 && <circle cx={xu} cy={yu} r={3} fill={colors.users} />}
              {d.resources > 0 && <circle cx={xr} cy={yr} r={3} fill={colors.resources} />}
              {d.downloads > 0 && <circle cx={xd} cy={yd} r={3} fill={colors.downloads} />}
              {showVisitors && d.visitors > 0 && <circle cx={xv} cy={yv} r={3} fill={colors.visitors} />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Students chart: shows cumulative total students as a line
 * + new students per day as bars.
 */
function StudentsChart({
  days,
  maxStudents,
}: {
  days: { ts: number; users: number; totalStudents: number }[];
  maxStudents: number;
}) {
  if (days.every((d) => d.users === 0 && d.totalStudents === 0)) {
    return <p className="text-sm text-slate-400 italic py-6 text-center">Aucune inscription sur les 7 derniers jours</p>;
  }

  const W = 800;
  const H = 220;
  const PAD = 40;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;
  const xStep = innerW / Math.max(1, days.length - 1);
  const maxNew = Math.max(1, ...days.map((d) => d.users));

  const point = (i: number, val: number, max: number) => {
    const x = PAD + i * xStep;
    const y = PAD + innerH - (val / max) * innerH;
    return [x, y];
  };

  const buildPath = (key: 'users' | 'totalStudents') => {
    return days
      .map((d, i) => {
        const max = key === 'users' ? maxNew : maxStudents;
        const [x, y] = point(i, d[key], max);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  };

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet" style={{ minWidth: 480 }}>
        {/* Y axis grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
          const y = PAD + innerH * (1 - p);
          return (
            <g key={i}>
              <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="#F1F5F9" strokeWidth={1} />
              <text x={PAD - 6} y={y + 3} textAnchor="end" className="text-[10px] fill-slate-400">
                {formatNumber(Math.round(maxStudents * p))}
              </text>
            </g>
          );
        })}

        {/* X axis labels (days) */}
        {days.map((d, i) => {
          const x = PAD + i * xStep;
          return (
            <text
              key={i}
              x={x}
              y={H - 8}
              textAnchor="middle"
              className="text-[10px] fill-slate-500"
            >
              {fmtShort(d.ts)}
            </text>
          );
        })}

        {/* Bars for new users */}
        {days.map((d, i) => {
          const x = PAD + i * xStep;
          const barW = Math.min(30, xStep * 0.4);
          const [_, yTop] = point(i, d.users, maxNew);
          return (
            <rect
              key={`bar-${i}`}
              x={x - barW / 2}
              y={yTop}
              width={barW}
              height={H - PAD - yTop}
              fill="#10B981"
              opacity={d.users > 0 ? 0.3 : 0}
              rx={2}
            />
          );
        })}

        {/* Line for cumulative students */}
        <path
          d={buildPath('totalStudents')}
          fill="none"
          stroke="#0EA5E9"
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Area under cumulative line */}
        <path
          d={`${buildPath('totalStudents')} L ${PAD + (days.length - 1) * xStep} ${PAD + innerH} L ${PAD} ${PAD + innerH} Z`}
          fill="#0EA5E9"
          opacity={0.1}
        />

        {/* Dots for cumulative */}
        {days.map((d, i) => {
          const [x, y] = point(i, d.totalStudents, maxStudents);
          return (
            <g key={`dot-${i}`}>
              <circle cx={x} cy={y} r={4} fill="#0EA5E9" />
              <text x={x} y={y - 8} textAnchor="middle" className="text-[10px] fill-sky-700 font-bold">
                {d.totalStudents > 0 ? formatNumber(d.totalStudents) : ''}
              </text>
            </g>
          );
        })}

        {/* Legend */}
        <g transform={`translate(${PAD}, ${H - 4})`}>
          <rect x="0" y="-10" width="12" height="6" fill="#10B981" opacity={0.5} />
          <text x="16" y="-5" className="text-[10px] fill-slate-600">Nouveaux</text>
          <line x1="80" y1="-7" x2="92" y2="-7" stroke="#0EA5E9" strokeWidth={2} />
          <text x="96" y="-5" className="text-[10px] fill-slate-600">Total cumulé</text>
        </g>
      </svg>
    </div>
  );
}
