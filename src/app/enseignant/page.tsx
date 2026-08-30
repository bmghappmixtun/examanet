// @ts-nocheck
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import {
  FileText,
  Eye,
  Download,
  Star,
  Clock,
  TrendingUp,
  Upload,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { formatNumber, timeAgo } from '@/lib/utils';
import { isArabic } from '@/lib/text-utils';
import VerificationFilesUploader from '@/components/teacher/VerificationFilesUploader';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Espace enseignant',
  description: 'Espace enseignant Examanet — publiez et gérez vos ressources pédagogiques.',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
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

export default async function TeacherDashboard(props: {
  searchParams: Promise<any>;
}) {
  const sp = await props.searchParams;
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');
  const showWelcome = sp?.welcome === '1';

  const db = await getD1();

  // User status
  const fullUser = await db
    .prepare(
      `SELECT status, verificationFilesRequestedAt, verificationFilesCount,
              verificationFilesNote, verificationFilesReceivedAt
       FROM User WHERE id = ?`,
    )
    .bind(user.id)
    .first()
    .catch(() => null);

  const needsVerification = fullUser?.status === 'PENDING_FILE_VERIFICATION';

  // Verification files (if needed)
  const verificationFiles = needsVerification
    ? await db
        .prepare(
          `SELECT id, type, fileKey, fileUrl, mimeType, fileSize, status, createdAt
           FROM TeacherVerificationFile
           WHERE userId = ?
           ORDER BY createdAt DESC`,
        )
        .bind(user.id)
        .all()
        .catch(() => ({ results: [] }))
    : { results: [] };
  const verificationRemaining = Math.max(0, 5 - (verificationFiles?.results?.length || 0));

  // Counts + recent resources (in parallel)
  const [totalR, publishedR, pendingR, rejectedR, recentR, allPublishedR, pendingListR, subjectsR] =
    await Promise.all([
      db.prepare('SELECT COUNT(*) as c FROM Resource WHERE teacherId = ?').bind(user.id).first().catch(() => ({ c: 0 })),
      db.prepare("SELECT COUNT(*) as c FROM Resource WHERE teacherId = ? AND status = 'PUBLISHED'").bind(user.id).first().catch(() => ({ c: 0 })),
      db.prepare("SELECT COUNT(*) as c FROM Resource WHERE teacherId = ? AND status = 'PENDING_APPROVAL'").bind(user.id).first().catch(() => ({ c: 0 })),
      db.prepare("SELECT COUNT(*) as c FROM Resource WHERE teacherId = ? AND status = 'REJECTED'").bind(user.id).first().catch(() => ({ c: 0 })),
      db.prepare(
        `SELECT r.id, r.numericId, r.slug, r.title, r.status, r.createdAt, r.type,
                s.nameFr as subjectNameFr, s.color as subjectColor, s.icon as subjectIcon
         FROM Resource r
         LEFT JOIN Subject s ON r.subjectId = s.id
         WHERE r.teacherId = ?
         ORDER BY r.createdAt DESC
         LIMIT 5`,
      ).bind(user.id).all().catch(() => ({ results: [] })),
      db.prepare(
        "SELECT viewsCount, downloadsCount, avgRating FROM Resource WHERE teacherId = ? AND status = 'PUBLISHED'",
      ).bind(user.id).all().catch(() => ({ results: [] })),
      db.prepare(
        `SELECT r.id, r.numericId, r.slug, r.title, r.createdAt,
                s.nameFr as subjectNameFr, s.color as subjectColor
         FROM Resource r
         LEFT JOIN Subject s ON r.subjectId = s.id
         WHERE r.teacherId = ? AND r.status = 'PENDING_APPROVAL'
         ORDER BY r.createdAt DESC`,
      ).bind(user.id).all().catch(() => ({ results: [] })),
      db.prepare('SELECT id, slug, nameFr, color, icon FROM Subject ORDER BY nameFr ASC').all().catch(() => ({ results: [] })),
    ]);

  const totalResources = num(totalR?.c);
  const published = num(publishedR?.c);
  const pending = num(pendingR?.c);
  const rejected = num(rejectedR?.c);
  const recentResources = recentR?.results || [];
  const pendingResources = pendingListR?.results || [];
  const allPublished = allPublishedR?.results || [];
  const subjects = subjectsR?.results || [];

  // Compute aggregates from all published resources
  let totalViews = 0;
  let totalDownloads = 0;
  let ratingSum = 0;
  for (const r of allPublished) {
    totalViews += num(r.viewsCount);
    totalDownloads += num(r.downloadsCount);
    ratingSum += Number(r.avgRating) || 0;
  }
  const avgRating = allPublished.length ? ratingSum / allPublished.length : 0;

  return (
    <div>
      {/* PENDING_FILE_VERIFICATION banner + uploader */}
      {needsVerification && (
        <div className="mb-6 bg-gradient-to-br from-violet-50 via-white to-amber-50 border-2 border-violet-300 rounded-2xl p-5 lg:p-6">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center text-2xl flex-shrink-0 shadow-md">
              📁
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-extrabold text-slate-900 mb-1">
                Action requise : envoyez vos fichiers de vérification
              </h2>
              <p className="text-slate-600 text-sm">
                Pour finaliser la vérification de votre compte enseignant, merci d'envoyer
                {' '}{5} fichiers Word/PDF d'exemple (cours, séries, devoirs, etc.) avec votre nom et prénom.
                {' '}<span className="font-bold">({5 - verificationRemaining} restant{5 - verificationRemaining > 1 ? 's' : ''})</span>
              </p>
              {fullUser?.verificationFilesNote && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  <strong>Note de l'admin :</strong> {fullUser.verificationFilesNote}
                </div>
              )}
            </div>
          </div>
          <VerificationFilesUploader
            teacherId={user.id}
            existingFiles={verificationFiles?.results || []}
            remaining={verificationRemaining}
          />
        </div>
      )}

      {showWelcome && (
        <div className="mb-6 bg-gradient-to-br from-emerald-50 via-white to-teal-50 border-2 border-emerald-300 rounded-2xl p-5 lg:p-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center text-2xl flex-shrink-0 shadow-md">
              🎉
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-emerald-900 mb-1">Bienvenue !</h2>
              <p className="text-emerald-800">Votre compte enseignant a été approuvé. Vous pouvez maintenant publier des ressources.</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold">👋 Bonjour {user.firstName || 'cher enseignant'}</h1>
        <Link
          href="/enseignant/ressources/ajouter"
          className="btn-primary inline-flex items-center gap-2"
        >
          <Upload className="w-4 h-4" />
          Nouvelle ressource
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl p-5 border border-slate-100">
          <FileText className="w-5 h-5 text-blue-500 mb-2" />
          <div className="text-2xl font-extrabold">{formatNumber(totalResources)}</div>
          <div className="text-sm text-slate-600">Ressources</div>
          <div className="text-xs text-slate-400 mt-0.5">{published} publiées</div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-100">
          <Eye className="w-5 h-5 text-emerald-500 mb-2" />
          <div className="text-2xl font-extrabold">{formatNumber(totalViews)}</div>
          <div className="text-sm text-slate-600">Vues</div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-100">
          <Download className="w-5 h-5 text-amber-500 mb-2" />
          <div className="text-2xl font-extrabold">{formatNumber(totalDownloads)}</div>
          <div className="text-sm text-slate-600">Téléchargements</div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-100">
          <Star className="w-5 h-5 text-purple-500 mb-2" />
          <div className="text-2xl font-extrabold">{avgRating.toFixed(1)}</div>
          <div className="text-sm text-slate-600">Note moyenne</div>
        </div>
      </div>

      {/* Alerts */}
      {(pending > 0 || rejected > 0) && (
        <div className="grid sm:grid-cols-2 gap-4 mb-8">
          {pending > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="font-bold text-amber-800 flex items-center gap-2">
                <Clock className="w-4 h-4" /> {pending} en attente d'approbation
              </div>
              <div className="text-sm text-amber-700">Vos ressources sont en cours de validation.</div>
            </div>
          )}
          {rejected > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="font-bold text-red-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> {rejected} rejetée{rejected > 1 ? 's' : ''}
              </div>
              <div className="text-sm text-red-700">
                <Link href="/enseignant/ressources" className="underline">Voir les ressources rejetées</Link>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent resources */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-400" />
              Mes ressources récentes
            </h2>
            <Link href="/enseignant/ressources" className="text-sm text-primary-600 font-semibold hover:underline">
              Tout voir →
            </Link>
          </div>
          <div className="space-y-3">
            {recentResources.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Upload className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p>Vous n'avez pas encore de ressources.</p>
                <Link
                  href="/enseignant/ressources/ajouter"
                  className="btn-primary mt-3 inline-flex"
                >
                  Publier ma première ressource
                </Link>
              </div>
            ) : (
              recentResources.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                      className="w-10 h-12 rounded-lg flex items-center justify-center flex-shrink-0 text-xl"
                      style={{ background: r.subjectColor ? `${r.subjectColor}20` : '#F1F5F9' }}
                    >
                      {r.subjectIcon || '📄'}
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
                        {r.subjectNameFr} · {timeAgo(r.createdAt)}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-bold rounded flex-shrink-0 ${
                      r.status === 'PUBLISHED'
                        ? 'bg-emerald-100 text-emerald-700'
                        : r.status === 'PENDING_APPROVAL'
                          ? 'bg-amber-100 text-amber-700'
                          : r.status === 'REJECTED'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {r.status === 'PUBLISHED' ? '✓' : r.status === 'PENDING_APPROVAL' ? '⏳' : r.status === 'REJECTED' ? '✕' : '📝'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Pending resources */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              En attente d'approbation
            </h2>
          </div>
          <div className="space-y-3">
            {pendingResources.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <CheckCircle className="w-10 h-10 mx-auto mb-2 text-emerald-300" />
                <p>Aucune ressource en attente</p>
              </div>
            ) : (
              pendingResources.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                      className="w-10 h-12 rounded-lg flex items-center justify-center flex-shrink-0 text-xl"
                      style={{ background: r.subjectColor ? `${r.subjectColor}20` : '#F1F5F9' }}
                    >
                      📄
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
                        {r.subjectNameFr} · {timeAgo(r.createdAt)}
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-1 text-xs font-bold rounded bg-amber-100 text-amber-700 flex-shrink-0">
                    ⏳
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
