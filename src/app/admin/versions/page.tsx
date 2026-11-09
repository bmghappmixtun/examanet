// @ts-nocheck
/**
 * /admin/versions — Historique des versions déployées du site.
 *
 * Chaque déploiement de code incrémente la version de 0.01 (0.01, 0.02,
 * 0.03...) : le numéro est FIGÉ dans la table D1 `DeploymentVersion` au
 * moment du déploiement (scripts/register-deployment.mjs, appelé par la CI),
 * donc l'historique reste stable même si Cloudflare purge ses anciennes
 * versions.
 *
 * Source de vérité : Cloudflare Workers API (les versions du worker
 * `examanet-prod`), enrichie par les runs GitHub Actions (commit, auteur).
 * Les rotations de secrets sont journalisées à part : elles créent une
 * version Cloudflare mais ne consomment pas de numéro de version.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import {
  Rocket,
  GitCommitHorizontal,
  Shield,
  Search,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  KeyRound,
  CircleDot,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

const fmtDateTime = (ms: number) =>
  new Date(ms).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export default async function AdminVersionsPage(props: any) {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');
  if (user.role !== 'ADMIN') redirect('/');

  const sp = (await props.searchParams) || {};
  const type = (sp.type || 'all').toString();
  const q = (sp.q || '').toString().trim();
  const page = Math.max(1, parseInt((sp.page || '1').toString()) || 1);

  const db = await getD1();
  const env = 'prod';

  let rows = [];
  let stats = { total: 0, code: 0, secret: 0, current: null, first: null, last: null, week: 0 };
  let activity: { day: string; n: number }[] = [];
  let tableMissing = false;
  let filteredTotal = 0;
  let syncState: any = null;

  try {
    const where = ['env = ?'];
    const params: any[] = [env];
    if (type === 'code') where.push("type IN ('code','create')");
    else if (type === 'secret') where.push("type = 'secret'");
    if (q) {
      where.push('(version LIKE ? OR commitSha LIKE ? OR commitMessage LIKE ? OR cfVersionId LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    const whereSql = where.join(' AND ');

    const countR = await db
      .prepare(`SELECT COUNT(*) AS c FROM DeploymentVersion WHERE ${whereSql}`)
      .bind(...params)
      .first();

    const all = await db
      .prepare(
        `SELECT id, version, versionIndex, versionNum, cfNumber, cfVersionId, type,
                deployedAt, commitSha, commitMessage, author, isCurrent
           FROM DeploymentVersion
          WHERE ${whereSql}
          ORDER BY deployedAt DESC, cfNumber DESC
          LIMIT ? OFFSET ?`,
      )
      .bind(...params, PAGE_SIZE, (page - 1) * PAGE_SIZE)
      .all();

    rows = all?.results || [];
    filteredTotal = Number(countR?.c || 0);

    const s = await db
      .prepare(
        `SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN type IN ('code','create') THEN 1 ELSE 0 END) AS code,
            SUM(CASE WHEN type = 'secret' THEN 1 ELSE 0 END) AS secret,
            SUM(CASE WHEN deployedAt >= ? THEN 1 ELSE 0 END) AS week
           FROM DeploymentVersion WHERE env = ?`,
      )
      .bind(Date.now() - 7 * 86400 * 1000, env)
      .first();

    const currentR = await db
      .prepare(
        `SELECT version, cfNumber, cfVersionId, deployedAt, commitSha, commitMessage, author
           FROM DeploymentVersion WHERE env = ? AND isCurrent = 1 LIMIT 1`,
      )
      .bind(env)
      .first();

    const firstR = await db
      .prepare(
        `SELECT version, deployedAt, cfNumber FROM DeploymentVersion
          WHERE env = ? AND versionIndex = 1 LIMIT 1`,
      )
      .bind(env)
      .first();

    const lastR = await db
      .prepare(
        `SELECT version, deployedAt, cfNumber FROM DeploymentVersion
          WHERE env = ? AND versionIndex IS NOT NULL
          ORDER BY versionIndex DESC LIMIT 1`,
      )
      .bind(env)
      .first();

    // Activité des 30 derniers jours (déploiements de code par jour)
    const actR = await db
      .prepare(
        `SELECT CAST(deployedAt / 86400000 AS INTEGER) AS day, COUNT(*) AS n
           FROM DeploymentVersion
          WHERE env = ? AND type IN ('code','create') AND deployedAt >= ?
          GROUP BY day ORDER BY day ASC`,
      )
      .bind(env, Date.now() - 30 * 86400 * 1000)
      .all();

    const byDay = new Map((actR?.results || []).map((r) => [Number(r.day), Number(r.n)]));
    const today = Math.floor(Date.now() / 86400000);
    activity = Array.from({ length: 30 }, (_, i) => {
      const day = today - (29 - i);
      return { day: String(day), n: byDay.get(day) || 0 };
    });

    // etat de la synchronisation quotidienne (script sync-deployment-versions.mjs)
    const syncR = await db
      .prepare('SELECT * FROM DeploymentSyncState WHERE env = ? LIMIT 1')
      .bind(env)
      .first()
      .catch(() => null);
    syncState = syncR || null;

    stats = {
      total: Number(s?.total || 0),
      code: Number(s?.code || 0),
      secret: Number(s?.secret || 0),
      week: Number(s?.week || 0),
      current: currentR || null, // version CF reellement en ligne (100 %)
      first: firstR || null,
      last: lastR || null, // derniere version de CODE (le site)
    };
  } catch (e: any) {
    tableMissing = true;
    console.error('[admin/versions] lecture D1 impossible:', e?.message);
  }

  // quand un filtre est actif, le total affiché est celui du filtre (même à 0)
  const filtered = type !== 'all' || q ? true : false;
  const shownTotal = filtered ? filteredTotal : stats.total;
  const totalPages = Math.max(1, Math.ceil(shownTotal / PAGE_SIZE));
  const maxN = Math.max(1, ...activity.map((a) => a.n));
  const queryBase = (patch: Record<string, string | number>) => {
    const p = new URLSearchParams();
    if (type !== 'all') p.set('type', type);
    if (q) p.set('q', q);
    p.set('page', String(page));
    for (const [k, v] of Object.entries(patch)) p.set(k, String(v));
    return `/admin/versions?${p.toString()}`;
  };

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Rocket className="w-6 h-6 text-red-500" />
            Historique des versions
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Chaque déploiement incrémente la version de 0.01 — de 0.01 (création du site) à
            aujourd&apos;hui. Source : Cloudflare Workers + GitHub Actions.
          </p>
        </div>
        {stats.last && (
          <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 text-white px-5 py-3 shadow-lg min-w-[268px]">
            <div className="text-[11px] uppercase tracking-wide text-slate-300">Version du site</div>
            <div className="text-3xl font-black tracking-tight">{stats.last.version}</div>
            <div className="text-[11px] text-slate-300 mt-0.5">
              CF n°{stats.last.cfNumber} · {fmtDateTime(stats.last.deployedAt)}
            </div>
            {stats.current && stats.current.cfNumber !== stats.last.cfNumber && (
              <div className="text-[11px] text-slate-400 mt-1.5 pt-1.5 border-t border-white/15">
                Worker en ligne : CF n°{stats.current.cfNumber}
                {stats.current.type === 'secret' ? ' (rotation de secret)' : ''}
              </div>
            )}
            {syncState && (
              <div className="text-[11px] text-slate-400 mt-1">
                Synchronisé le {fmtDateTime(syncState.lastSyncAt)}
                {Number(syncState.missingCount) > 0
                  ? ` · ${syncState.missingCount} version(s) en retard`
                  : ''}
              </div>
            )}
          </div>
        )}
      </div>

      {syncState && syncState.status !== 'ok' && (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-red-900">
          <p className="font-semibold">La synchronisation quotidienne a échoué.</p>
          <p className="text-sm mt-0.5">
            Dernière tentative : {fmtDateTime(syncState.lastSyncAt)} — {syncState.message}
          </p>
        </div>
      )}
      {syncState && syncState.status === 'ok' && Number(syncState.missingCount) > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <p className="font-semibold">
            {syncState.missingCount} version(s) Cloudflare ne sont pas encore enregistrées.
          </p>
          <p className="text-sm mt-0.5">
            Dernière synchronisation : {fmtDateTime(syncState.lastSyncAt)}. La prochaine
            exécution du job quotidien les rattrapera.
          </p>
        </div>
      )}

      {tableMissing && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-900">
          <p className="font-semibold">Le registre n&apos;est pas encore en place.</p>
          <p className="text-sm mt-1">
            Applique la migration <code className="px-1 bg-amber-100 rounded">migrations/0015_deployment_versions.sql</code>{' '}
            puis lance <code className="px-1 bg-amber-100 rounded">node scripts/backfill-deployment-versions.mjs --env=prod</code>.
          </p>
        </div>
      )}

      {/* Statistiques */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<GitCommitHorizontal className="w-5 h-5" />}
          label="Déploiements de code"
          value={stats.code.toLocaleString('fr-FR')}
          hint={`${stats.secret.toLocaleString('fr-FR')} événements secret`}
          tone="red"
        />
        <StatCard
          icon={<CalendarDays className="w-5 h-5" />}
          label="Sur les 7 derniers jours"
          value={stats.week.toLocaleString('fr-FR')}
          hint="déploiements"
          tone="amber"
        />
        <StatCard
          icon={<Shield className="w-5 h-5" />}
          label="Première version"
          value={stats.first?.version || '—'}
          hint={stats.first ? `${fmtDate(stats.first.deployedAt)} · CF n°${stats.first.cfNumber}` : '—'}
          tone="slate"
        />
        <StatCard
          icon={<CircleDot className="w-5 h-5" />}
          label="Dernière version"
          value={stats.last?.version || '—'}
          hint={stats.last ? `${fmtDate(stats.last.deployedAt)} · CF n°${stats.last.cfNumber}` : '—'}
          tone="emerald"
        />
      </div>

      {/* Activité 30 jours */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-800">Déploiements — 30 derniers jours</h2>
          <span className="text-xs text-slate-400">
            {activity.reduce((s, a) => s + a.n, 0).toLocaleString('fr-FR')} au total
          </span>
        </div>
        <div className="flex items-end gap-[3px] h-24 mb-2">
          {activity.map((a, i) => {
            const h = Math.max(2, Math.round((a.n / maxN) * 88));
            return (
              <div key={i} className="flex-1 group relative" title={`${a.day} : ${a.n}`}>
                <div
                  className={`w-full rounded-t ${a.n > 0 ? 'bg-red-500 group-hover:bg-red-600' : 'bg-slate-100'}`}
                  style={{ height: `${h}px` }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 border-t border-slate-100 pt-1">
          <span>il y a 30 jours</span>
          <span>aujourd&apos;hui</span>
        </div>
      </div>

      {/* Filtres */}
      <form method="GET" className="flex flex-wrap items-center gap-2">
        {type !== 'all' && <input type="hidden" name="type" value={type} />}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Version, commit, message…"
            className="pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-400 w-64"
          />
        </div>
        <div className="flex rounded-xl border border-slate-300 bg-white overflow-hidden text-sm">
          {[
            { k: 'all', l: 'Tous', n: stats.total },
            { k: 'code', l: 'Code', n: stats.code },
            { k: 'secret', l: 'Secrets', n: stats.secret },
          ].map((f) => (
            <Link
              key={f.k}
              href={queryBase({ type: f.k, page: 1 })}
              className={`px-3 py-2 ${
                type === f.k ? 'bg-slate-900 text-white font-medium' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f.l}
              <span className={`ml-1.5 text-[11px] ${type === f.k ? 'text-slate-300' : 'text-slate-400'}`}>
                {f.n.toLocaleString('fr-FR')}
              </span>
            </Link>
          ))}
        </div>
        <button
          type="submit"
          className="px-3 py-2 text-sm rounded-xl bg-slate-900 text-white hover:bg-slate-800"
        >
          Filtrer
        </button>
        {q && (
          <Link href="/admin/versions" className="text-sm text-slate-500 hover:text-slate-800 underline">
            Réinitialiser
          </Link>
        )}
      </form>

      {/* Tableau */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">
            {shownTotal.toLocaleString('fr-FR')} version{shownTotal > 1 ? 's' : ''}
            {filtered ? ' (filtré)' : ''}
          </span>
          {filtered && (
            <Link
              href="/admin/versions"
              className="text-xs text-slate-500 hover:text-slate-800 underline"
            >
              Tout afficher
            </Link>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold">Version</th>
                <th className="px-4 py-3 font-semibold">Déployé le</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">CF n°</th>
                <th className="px-4 py-3 font-semibold">Commit</th>
                <th className="px-4 py-3 font-semibold">Auteur</th>
                <th className="px-4 py-3 font-semibold">État</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    Aucun déploiement trouvé.
                  </td>
                </tr>
              )}
              {rows.map((r: any) => (
                <tr key={r.id} className={r.isCurrent ? 'bg-emerald-50/60' : ''}>
                  <td className="px-4 py-3">
                    {r.version ? (
                      <span className="font-mono font-bold text-slate-900">v{r.version}</span>
                    ) : (
                      <span className="text-slate-300 font-mono">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {fmtDateTime(r.deployedAt)}
                  </td>
                  <td className="px-4 py-3">
                    {r.type === 'secret' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800">
                        <KeyRound className="w-3 h-3" /> secret
                      </span>
                    ) : r.type === 'create' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-200 text-slate-700">
                        <Shield className="w-3 h-3" /> création
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-100 text-red-700">
                        <Rocket className="w-3 h-3" /> code
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">#{r.cfNumber}</td>
                  <td className="px-4 py-3 max-w-md">
                    {r.commitSha ? (
                      <a
                        href={`https://github.com/bmghappmixtun/examanet/commit/${r.commitSha}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs text-blue-700 hover:underline"
                      >
                        {r.commitSha.slice(0, 8)}
                      </a>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                    {r.commitMessage && (
                      <div className="text-xs text-slate-500 truncate mt-0.5" title={r.commitMessage}>
                        {r.commitMessage}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.author || '—'}</td>
                  <td className="px-4 py-3">
                    {r.isCurrent && r.cfVersionId === stats.last?.cfVersionId ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        en ligne
                      </span>
                    ) : r.isCurrent ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        worker en ligne
                      </span>
                    ) : r.cfVersionId === stats.last?.cfVersionId ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700">
                        version du site
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">historique</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm">
            <span className="text-slate-500">
              Page {page} / {totalPages} — {shownTotal.toLocaleString('fr-FR')} entrées
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={queryBase({ page: page - 1 })}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50"
                >
                  <ChevronLeft className="w-4 h-4" /> Précédent
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={queryBase({ page: page + 1 })}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50"
                >
                  Suivant <ChevronRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400">
        Registre D1 <code>DeploymentVersion</code> — écrit par
        <code> scripts/register-deployment.mjs</code> après chaque déploiement CI.
        Les rotations de secrets créent une version Cloudflare mais ne consomment pas de numéro.
      </p>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone: 'red' | 'amber' | 'slate' | 'emerald';
}) {
  const tones: Record<string, string> = {
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600',
    slate: 'bg-slate-100 text-slate-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  };
  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${tones[tone]}`}>
          {icon}
        </span>
        {label}
      </div>
      <div className="text-2xl font-bold text-slate-900 mt-2 font-mono">{value}</div>
      {hint && <div className="text-xs text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}
