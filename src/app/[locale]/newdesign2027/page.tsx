// @ts-nocheck
// 2026-09-12: NEW DESIGN 2027 — Sample/demo page for resource detail redesign.
// Shows the full layout with all 18 related-content sections powered by real D1 data.
// Access at /newdesign2027 (default resource) or /newdesign2027?id=XXXX

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.DB;
}

// Single mega-query: returns the resource + every related dataset we'll display.
// Saves 12+ round-trips to D1 (one of the few places where a fat query is correct).
async function fetchAllForResource(numericId: number) {
  const db = await getD1();
  if (!db) return null;

  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';

  try {
    // 1) Main resource + subject + class + level + teacher + cycle
    const main: any = await db.prepare(`
      SELECT
        r.id, r.numericId, r.slug, r.title, r.description, r.summary, r.type, r.language,
        r.schoolType, r.hasCorrection, r.fileKey, r.fileUrl, r.fileSize, r.pageCount,
        r.tags, r.viewsCount, r.downloadsCount, r.avgRating, r.ratingsCount,
        r.commentsCount, r.favoritesCount, r.publishedAt, r.createdAt, r.updatedAt,
        s.id as subjectId, s.slug as subjectSlug, s.nameFr as subjectNameFr, s.color as subjectColor,
        cl.id as classId, cl.slug as classSlug, cl.nameFr as classNameFr,
        lv.id as levelId, lv.slug as levelSlug, lv.nameFr as levelNameFr,
        u.id as teacherId, u.firstName as teacherFirstName, u.lastName as teacherLastName,
        u.firstNameAr as teacherFirstNameAr, u.lastNameAr as teacherLastNameAr,
        u.slug as teacherSlug, u.numericId as teacherNumericId, u.avatarUrl as teacherAvatar,
        u.schoolName as teacherSchool, u.isVerifiedTeacher as teacherIsVerified
      FROM Resource r
      LEFT JOIN Subject s ON r.subjectId = s.id
      LEFT JOIN "Class" cl ON r.classId = cl.id
      LEFT JOIN Level lv ON cl.levelId = lv.id
      LEFT JOIN User u ON r.teacherId = u.id
      WHERE r.numericId = ? AND r.status = 'PUBLISHED' AND r.isHidden = 0
      LIMIT 1
    `).bind(numericId).first();

    if (!main) return null;

    // 2) Same teacher — other resources by this prof
    const sameTeacher = await db.prepare(`
      SELECT numericId, slug, title, type, hasCorrection, viewsCount, avgRating, publishedAt
      FROM Resource
      WHERE teacherId = ? AND numericId != ? AND status = 'PUBLISHED' AND isHidden = 0
      ORDER BY viewsCount DESC, publishedAt DESC LIMIT 10
    `).bind(main.teacherId, numericId).all().then((r: any) => r.results || []);

    // 3) Same subject + same class, grouped by type (max 30)
    const byTypeAndClass = await db.prepare(`
      SELECT numericId, slug, title, type, hasCorrection, viewsCount, avgRating, publishedAt
      FROM Resource
      WHERE subjectId = ? AND classId = ? AND numericId != ?
            AND status = 'PUBLISHED' AND isHidden = 0
      ORDER BY
        CASE type WHEN 'COURSE' THEN 1 WHEN 'DEVOIR' THEN 2 WHEN 'EXERCISE' THEN 3 ELSE 4 END,
        viewsCount DESC
      LIMIT 30
    `).bind(main.subjectId, main.classId, numericId).all().then((r: any) => r.results || []);

    // 4) Newest in same subject + class (last 90 days)
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const newest = await db.prepare(`
      SELECT numericId, slug, title, type, hasCorrection, viewsCount, publishedAt
      FROM Resource
      WHERE subjectId = ? AND classId = ? AND numericId != ?
            AND status = 'PUBLISHED' AND isHidden = 0 AND publishedAt > ?
      ORDER BY publishedAt DESC LIMIT 8
    `).bind(main.subjectId, main.classId, numericId, ninetyDaysAgo).all().then((r: any) => r.results || []);

    // 5) Top viewed in same subject (across all classes)
    const topInSubject = await db.prepare(`
      SELECT r.numericId, r.slug, r.title, r.type, r.viewsCount, r.avgRating,
             cl.nameFr as classNameFr
      FROM Resource r
      LEFT JOIN "Class" cl ON r.classId = cl.id
      WHERE r.subjectId = ? AND r.numericId != ?
            AND r.status = 'PUBLISHED' AND r.isHidden = 0
      ORDER BY r.viewsCount DESC LIMIT 6
    `).bind(main.subjectId, numericId).all().then((r: any) => r.results || []);

    // 6) Other classes in the same level (e.g., other 9ème classes)
    const otherClassesSameLevel = await db.prepare(`
      SELECT r.numericId, r.slug, r.title, cl.nameFr as classNameFr, r.type, r.viewsCount
      FROM Resource r
      LEFT JOIN "Class" cl ON r.classId = cl.id
      WHERE r.levelId = ? AND r.classId != ? AND r.subjectId = ?
            AND r.status = 'PUBLISHED' AND r.isHidden = 0
      ORDER BY r.viewsCount DESC LIMIT 8
    `).bind(main.levelId, main.classId, main.subjectId, numericId).all().then((r: any) => r.results || []);

    // 7) Other teachers teaching same subject+class (E-E-A-T)
    const otherTeachersSameSubj = await db.prepare(`
      SELECT u.id, u.firstName, u.lastName, u.avatarUrl, u.numericId, u.slug,
             u.isVerifiedTeacher, u.schoolName,
             COUNT(r.numericId) as resourceCount
      FROM User u
      INNER JOIN Resource r ON r.teacherId = u.id
      WHERE r.subjectId = ? AND r.classId = ? AND u.id != ?
            AND r.status = 'PUBLISHED' AND r.isHidden = 0
            AND u.role = 'TEACHER' AND u.status = 'ACTIVE'
      GROUP BY u.id
      ORDER BY resourceCount DESC, u.avgRating DESC
      LIMIT 6
    `).bind(main.subjectId, main.classId, main.teacherId).all().then((r: any) => r.results || []);

    // 8) Same subject, OTHER classes (e.g., Math 7ème, 8ème, 1ère...)
    const sameSubjOtherClasses = await db.prepare(`
      SELECT r.numericId, r.slug, r.title, cl.nameFr as classNameFr,
             lv.nameFr as levelNameFr, r.type, r.viewsCount
      FROM Resource r
      LEFT JOIN "Class" cl ON r.classId = cl.id
      LEFT JOIN Level lv ON cl.levelId = lv.id
      WHERE r.subjectId = ? AND r.classId != ?
            AND r.status = 'PUBLISHED' AND r.isHidden = 0
      ORDER BY r.viewsCount DESC LIMIT 8
    `).bind(main.subjectId, main.classId).all().then((r: any) => r.results || []);

    // 9) Corrigés similaires (hasCorrection=1, same subject+class)
    const corriges = await db.prepare(`
      SELECT numericId, slug, title, type, viewsCount, avgRating, publishedAt
      FROM Resource
      WHERE subjectId = ? AND classId = ? AND numericId != ? AND hasCorrection = 1
            AND status = 'PUBLISHED' AND isHidden = 0
      ORDER BY avgRating DESC, viewsCount DESC LIMIT 6
    `).bind(main.subjectId, main.classId, numericId).all().then((r: any) => r.results || []);

    // 10) Other subjects in same level (cross-subject linking)
    const otherSubjectsSameLevel = await db.prepare(`
      SELECT s.id, s.slug, s.nameFr, s.color,
             (SELECT COUNT(*) FROM Resource r WHERE r.subjectId = s.id 
              AND r.levelId = ? AND r.status = 'PUBLISHED' AND r.isHidden = 0) as count
      FROM Subject s
      WHERE s.id != ?
      HAVING count > 0
      ORDER BY count DESC LIMIT 10
    `).bind(main.levelId, main.subjectId).all().then((r: any) => r.results || []);

    // 11) Tags parsing (for cloud)
    const tagList = (main.tags || '')
      .split(',')
      .map((t: string) => t.trim())
      .filter(Boolean);

    return {
      main,
      sameTeacher,
      byTypeAndClass,
      newest,
      topInSubject,
      otherClassesSameLevel,
      otherTeachersSameSubj,
      sameSubjOtherClasses,
      corriges,
      otherSubjectsSameLevel,
      tagList,
      SITE_URL,
    };
  } catch (e) {
    console.error('[newdesign2027] fetchAllForResource error:', e);
    return null;
  }
}

// Format helpers
function fmtDate(ms: number | null | undefined): string {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return ''; }
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '0';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function typeLabel(t: string): string {
  switch (t) {
    case 'COURSE': return 'Cours';
    case 'DEVOIR': return 'Devoir';
    case 'EXERCISE': return 'Exercice';
    case 'EXAMEN': return 'Examen';
    case 'FICHE': return 'Fiche';
    default: return t;
  }
}

function typeColor(t: string): string {
  switch (t) {
    case 'COURSE': return 'from-blue-500 to-cyan-500';
    case 'DEVOIR': return 'from-orange-500 to-red-500';
    case 'EXERCISE': return 'from-emerald-500 to-green-500';
    case 'EXAMEN': return 'from-violet-500 to-purple-500';
    default: return 'from-slate-500 to-slate-600';
  }
}

export default async function NewDesign2027Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const sp = await searchParams;
  const numericId = parseInt(sp.id || '2369', 10); // default to top resource

  if (!Number.isFinite(numericId) || numericId <= 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Invalid ID</h1>
          <p className="text-slate-500">Provide ?id=XXXX in the URL</p>
        </div>
      </div>
    );
  }

  const data = await fetchAllForResource(numericId);
  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Resource #{numericId} not found</h1>
          <p className="text-slate-500">Try ?id=2369 or ?id=454</p>
        </div>
      </div>
    );
  }

  const { main, sameTeacher, byTypeAndClass, newest, topInSubject, otherClassesSameLevel, otherTeachersSameSubj, sameSubjOtherClasses, corriges, otherSubjectsSameLevel, tagList, SITE_URL } = data;

  const pdfUrl = main.fileKey ? `${SITE_URL}/api/file/${main.fileKey}` : null;
  const resourceUrl = `${SITE_URL}/fr/ressources/${main.numericId}/${main.slug}`;
  const teacherName = `${main.teacherFirstName || ''} ${main.teacherLastName || ''}`.trim();
  const teacherInitial = ((main.teacherFirstName?.[0] || '') + (main.teacherLastName?.[0] || '')).toUpperCase() || '?';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50">
      {/* DEMO BANNER */}
      <div className="bg-gradient-to-r from-violet-600 to-purple-700 text-white text-center text-sm py-2 px-4 font-medium">
        ✨ NEW DESIGN 2027 — DEMO · {resourceUrl.replace(SITE_URL, '')}
      </div>

      {/* Breadcrumb */}
      <div className="bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-3">
          <nav className="flex items-center gap-1.5 text-xs text-slate-500 flex-wrap">
            <Link href="/" className="hover:text-slate-900">Accueil</Link>
            <span className="text-slate-300">›</span>
            <Link href="/fr/matieres" className="hover:text-slate-900">Matières</Link>
            <span className="text-slate-300">›</span>
            <Link href={`/fr/matieres/${main.subjectSlug || ''}`} className="hover:text-slate-900">{main.subjectNameFr || 'Matière'}</Link>
            <span className="text-slate-300">›</span>
            <Link href={`/fr/niveaux/${main.levelSlug || ''}`} className="hover:text-slate-900">{main.levelNameFr || main.classNameFr}</Link>
            <span className="text-slate-300">›</span>
            <span className="text-slate-900 font-medium truncate max-w-xs">{main.title}</span>
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6">
        {/* TOP BANNER: Programme + Section + Profile CTA */}
        <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100 rounded-2xl p-4 mb-6 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/30">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.186 5.477 3 6.253v13C4.186 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.814 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-indigo-700 font-bold">Programme officiel Tunisie · {main.levelNameFr || main.classNameFr}</div>
              <Link href={`/fr/programme-officiel`} className="text-sm font-semibold text-slate-900 hover:text-indigo-700">
                Voir le programme officiel de {main.subjectNameFr} {main.levelNameFr || main.classNameFr} →
              </Link>
            </div>
          </div>
          <Link href={`/fr/professeurs/${main.teacherNumericId || ''}`} className="flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl transition">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm">
              {teacherInitial}
            </div>
            <div className="text-left">
              <div className="text-xs text-slate-500">Publié par</div>
              <div className="text-sm font-semibold text-slate-900 flex items-center gap-1">
                {teacherName}
                {main.teacherIsVerified && (
                  <svg className="w-3.5 h-3.5 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L9.91 8.26 3 9.27l5.46 4.73L7 21l5-3 5 3-1.46-6.99L21 9.27l-6.91-1.01L12 2z"/>
                  </svg>
                )}
              </div>
            </div>
          </Link>
        </div>

        <div className="grid lg:grid-cols-[1fr_360px] gap-6">
          {/* MAIN COLUMN */}
          <div className="min-w-0 space-y-6">
            {/* Title + meta */}
            <div>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold text-white bg-gradient-to-r ${typeColor(main.type)}`}>
                  {typeLabel(main.type)}
                </span>
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                  {main.subjectNameFr || 'Matière'}
                </span>
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                  {main.classNameFr || 'Classe'}
                </span>
                {main.hasCorrection && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                    ✓ Corrigé
                  </span>
                )}
                {main.language === 'ar' && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                    AR
                  </span>
                )}
              </div>
              <h1 className="text-3xl lg:text-4xl font-extrabold text-slate-900 leading-tight mb-3">{main.title}</h1>
              {main.description && (
                <p className="text-base text-slate-600 leading-relaxed">{main.description.slice(0, 300)}{main.description.length > 300 ? '…' : ''}</p>
              )}
            </div>

            {/* Action bar */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center gap-3">
              {pdfUrl && (
                <a href={pdfUrl} target="_blank" className="inline-flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white text-sm font-bold rounded-xl shadow-lg shadow-primary-500/30 transition">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Télécharger ({fmtNum(main.fileSize ? main.fileSize / 1024 : null)} KB)
                </a>
              )}
              <a href={pdfUrl || '#'} target="_blank" className="inline-flex items-center gap-2 px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Aperçu
              </a>
              <div className="flex items-center gap-3 ml-auto text-xs text-slate-500">
                <div className="flex items-center gap-1">
                  <svg className="w-4 h-4 text-amber-500" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L9.91 8.26 3 9.27l5.46 4.73L7 21l5-3 5 3-1.46-6.99L21 9.27l-6.91-1.01L12 2z"/></svg>
                  <strong className="text-slate-900">{(main.avgRating || 0).toFixed(1)}</strong>
                  <span>({main.ratingsCount || 0})</span>
                </div>
                <div className="flex items-center gap-1">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <strong className="text-slate-900">{fmtNum(main.viewsCount)}</strong>
                  <span>vues</span>
                </div>
                <div className="flex items-center gap-1">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  <strong className="text-slate-900">{fmtNum(main.downloadsCount)}</strong>
                  <span>téléch.</span>
                </div>
              </div>
            </div>

            {/* PDF Viewer */}
            {pdfUrl && (
              <div className="bg-slate-900 rounded-2xl overflow-hidden shadow-2xl">
                <iframe
                  src={pdfUrl}
                  className="w-full"
                  style={{ height: '780px' }}
                  title={main.title}
                />
              </div>
            )}

            {/* TABS: Cours / Devoirs / Exercices (same subject+class) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Cercle 1 — Topical Cluster</div>
                  <h2 className="text-xl font-extrabold text-slate-900">📚 {main.subjectNameFr} {main.classNameFr}</h2>
                  <p className="text-sm text-slate-500">Cours, devoirs, exercices et corrigés du même sujet et même classe</p>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {byTypeAndClass.slice(0, 9).map((r: any) => (
                  <a key={r.numericId} href={`/fr/ressources/${r.numericId}/${r.slug}`} className="group block bg-slate-50 hover:bg-white border border-slate-200 hover:border-primary-300 rounded-xl p-3 transition">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white text-xs font-bold bg-gradient-to-br ${typeColor(r.type)}`}>
                        {typeLabel(r.type).slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-1">
                          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{typeLabel(r.type)}</span>
                          {r.hasCorrection ? <span className="text-[10px] text-emerald-600 font-bold">✓</span> : null}
                        </div>
                        <div className="text-sm font-semibold text-slate-900 truncate group-hover:text-primary-700">{r.title}</div>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                          <span>{fmtNum(r.viewsCount)} vues</span>
                          {r.avgRating > 0 && <span>· ⭐ {r.avgRating.toFixed(1)}</span>}
                        </div>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>

            {/* SAME TEACHER expanded */}
            {sameTeacher.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold">{teacherInitial}</div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Cercle 2 — E-E-A-T</div>
                    <h2 className="text-xl font-extrabold text-slate-900">👨‍🏫 Plus de ressources par {teacherName}</h2>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sameTeacher.slice(0, 9).map((r: any) => (
                    <a key={r.numericId} href={`/fr/ressources/${r.numericId}/${r.slug}`} className="group block bg-slate-50 hover:bg-white border border-slate-200 hover:border-amber-300 rounded-xl p-3 transition">
                      <div className="text-sm font-semibold text-slate-900 truncate group-hover:text-amber-700">{r.title}</div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold text-white bg-gradient-to-r ${typeColor(r.type)}`}>{typeLabel(r.type)}</span>
                        <span>{fmtNum(r.viewsCount)} vues</span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* OTHER TEACHERS same subject+class */}
            {otherTeachersSameSubj.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <div className="mb-4">
                  <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Cercle 2 — Link Diversity</div>
                  <h2 className="text-xl font-extrabold text-slate-900">👥 Autres profs qui enseignent {main.subjectNameFr} {main.classNameFr}</h2>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {otherTeachersSameSubj.map((t: any) => {
                    const init = ((t.firstName?.[0] || '') + (t.lastName?.[0] || '')).toUpperCase();
                    return (
                      <a key={t.id} href={`/fr/professeurs/${t.numericId}`} className="group flex items-center gap-3 bg-slate-50 hover:bg-white border border-slate-200 hover:border-blue-300 rounded-xl p-3 transition">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-sm">
                          {init || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate group-hover:text-blue-700 flex items-center gap-1">
                            {t.firstName} {t.lastName}
                            {t.isVerifiedTeacher && <span className="text-blue-500 text-xs">✓</span>}
                          </div>
                          <div className="text-xs text-slate-500">
                            {t.resourceCount} ressource{t.resourceCount > 1 ? 's' : ''}
                            {t.schoolName && ` · ${t.schoolName}`}
                          </div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SAME SUBJECT OTHER CLASSES */}
            {sameSubjOtherClasses.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <div className="mb-4">
                  <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Cercle 3 — Cross-class</div>
                  <h2 className="text-xl font-extrabold text-slate-900">📖 {main.subjectNameFr} dans les autres classes</h2>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sameSubjOtherClasses.slice(0, 6).map((r: any) => (
                    <a key={r.numericId} href={`/fr/ressources/${r.numericId}/${r.slug}`} className="group block bg-slate-50 hover:bg-white border border-slate-200 hover:border-violet-300 rounded-xl p-3 transition">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-violet-700">{r.classNameFr}</span>
                        <span className="text-xs text-slate-400">{fmtNum(r.viewsCount)} v.</span>
                      </div>
                      <div className="text-sm font-semibold text-slate-900 truncate group-hover:text-violet-700">{r.title}</div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* CORRIGES SIMILAIRES */}
            {corriges.length > 0 && (
              <div className="bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200 rounded-2xl p-6">
                <div className="mb-4">
                  <div className="text-[11px] uppercase tracking-wider font-bold text-emerald-700">Conversion boost</div>
                  <h2 className="text-xl font-extrabold text-slate-900">✅ Corrigés similaires ({main.subjectNameFr} {main.classNameFr})</h2>
                  <p className="text-sm text-slate-600">Vous voulez vérifier votre travail ?</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {corriges.map((r: any) => (
                    <a key={r.numericId} href={`/fr/ressources/${r.numericId}/${r.slug}`} className="group block bg-white border border-emerald-200 hover:border-emerald-400 rounded-xl p-3 transition">
                      <div className="text-sm font-semibold text-slate-900 truncate group-hover:text-emerald-700">{r.title}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {fmtNum(r.viewsCount)} vues · ⭐ {r.avgRating.toFixed(1)}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* TAGS */}
            {tagList.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-sm font-bold text-slate-700 mb-3">🏷️ Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {tagList.map((tag: string) => (
                    <a key={tag} href={`/fr/ressources?q=${encodeURIComponent(tag)}`} className="inline-flex items-center px-3 py-1.5 bg-slate-100 hover:bg-primary-100 hover:text-primary-700 text-slate-700 text-xs font-medium rounded-full transition">
                      #{tag}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* SIDEBAR (RIGHT) */}
          <div className="space-y-4 lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
            {/* Newest in same subject+class */}
            {newest.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold">N</div>
                  <h3 className="text-sm font-extrabold text-slate-900">🆕 Nouveautés</h3>
                </div>
                <p className="text-xs text-slate-500 mb-3">Dernières ressources publiées en {main.subjectNameFr} {main.classNameFr}</p>
                <div className="space-y-2.5">
                  {newest.map((r: any) => (
                    <a key={r.numericId} href={`/fr/ressources/${r.numericId}/${r.slug}`} className="group flex items-start gap-2">
                      <div className={`w-8 h-8 rounded-md flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold bg-gradient-to-br ${typeColor(r.type)}`}>
                        {typeLabel(r.type).slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-900 line-clamp-2 group-hover:text-cyan-700">{r.title}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{fmtDate(r.publishedAt)}</div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Top viewed in same subject */}
            {topInSubject.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white text-xs font-bold">🔥</div>
                  <h3 className="text-sm font-extrabold text-slate-900">Plus populaires en {main.subjectNameFr}</h3>
                </div>
                <div className="space-y-2.5">
                  {topInSubject.map((r: any) => (
                    <a key={r.numericId} href={`/fr/ressources/${r.numericId}/${r.slug}`} className="group flex items-start gap-2">
                      <div className={`w-8 h-8 rounded-md flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold bg-gradient-to-br ${typeColor(r.type)}`}>
                        {typeLabel(r.type).slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-900 line-clamp-2 group-hover:text-amber-700">{r.title}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                          <span>{fmtNum(r.viewsCount)} vues</span>
                          {r.avgRating > 0 && <span>· ⭐ {r.avgRating.toFixed(1)}</span>}
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Other classes same level */}
            {otherClassesSameLevel.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">↗</div>
                  <h3 className="text-sm font-extrabold text-slate-900">{main.subjectNameFr} dans d'autres classes</h3>
                </div>
                <div className="space-y-2">
                  {otherClassesSameLevel.slice(0, 5).map((r: any) => (
                    <a key={r.numericId} href={`/fr/ressources/${r.numericId}/${r.slug}`} className="block group">
                      <div className="text-xs font-bold text-violet-700">{r.classNameFr}</div>
                      <div className="text-xs text-slate-700 truncate group-hover:text-violet-700">{r.title}</div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Other subjects same level */}
            {otherSubjectsSameLevel.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-white text-xs font-bold">↔</div>
                  <h3 className="text-sm font-extrabold text-slate-900">Autres matières en {main.levelNameFr || main.classNameFr}</h3>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {otherSubjectsSameLevel.slice(0, 6).map((s: any) => (
                    <a key={s.id} href={`/fr/matieres/${s.slug}`} className="block bg-slate-50 hover:bg-pink-50 rounded-lg p-2 transition text-center">
                      <div className="text-xs font-semibold text-slate-700">{s.nameFr}</div>
                      <div className="text-[10px] text-slate-400">{s.count} ress.</div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* CTA: Prof */}
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5">
              <h3 className="text-sm font-extrabold text-amber-900 mb-2">👨‍🏫 Vous êtes enseignant ?</h3>
              <p className="text-xs text-amber-800 mb-3">Partagez vos ressources avec 100 000+ élèves tunisiens</p>
              <Link href="/fr/enseignants/rejoindre" className="block w-full text-center px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition">
                Devenir prof sur Examanet
              </Link>
            </div>
          </div>
        </div>

        {/* BOTTOM: Pedagogical journey */}
        {otherSubjectsSameLevel.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6">
            <div className="mb-4">
              <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Pédagogie</div>
              <h2 className="text-xl font-extrabold text-slate-900">📖 Programme complet — {main.levelNameFr || main.classNameFr}</h2>
              <p className="text-sm text-slate-500">Explorez les autres matières de votre niveau</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {otherSubjectsSameLevel.map((s: any) => (
                <a key={s.id} href={`/fr/matieres/${s.slug}`} className="group bg-gradient-to-br from-slate-50 to-slate-100 hover:from-primary-50 hover:to-primary-100 border border-slate-200 hover:border-primary-300 rounded-xl p-3 text-center transition">
                  <div className="text-2xl mb-1">📚</div>
                  <div className="text-sm font-bold text-slate-900 group-hover:text-primary-700">{s.nameFr}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{s.count} ressources</div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* FOOTER NOTE */}
        <div className="mt-8 text-center text-xs text-slate-400">
          <p>🎨 Cette page est un prototype de design pour le redesign 2027.</p>
          <p>Pour comparer avec l'ancien design : <Link href={`/fr/ressources/${main.numericId}/${main.slug}`} className="text-primary-600 hover:text-primary-700 underline">voir la version actuelle</Link></p>
        </div>
      </div>
    </div>
  );
}
