'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface ResourceMain {
  numericId: number;
  slug: string;
  title: string;
  description: string | null;
  summary: string | null;
  type: string;
  language: string;
  schoolType: string | null;
  hasCorrection: number;
  fileKey: string | null;
  fileSize: number | null;
  viewsCount: number;
  downloadsCount: number;
  avgRating: number;
  ratingsCount: number;
  commentsCount: number;
  publishedAt: number | null;
  tags: string | null;
  subjectId: string;
  subjectSlug: string;
  subjectNameFr: string;
  subjectColor: string;
  classId: string;
  classSlug: string;
  classNameFr: string;
  levelId: string;
  levelSlug: string;
  levelNameFr: string;
  teacherId: string;
  teacherFirstName: string;
  teacherLastName: string;
  teacherNumericId: number;
  teacherAvatar: string | null;
  teacherSchool: string | null;
  teacherIsVerified: number;
}

interface RelatedItem {
  numericId: number;
  slug: string;
  title: string;
  type: string;
  hasCorrection?: number;
  viewsCount?: number;
  avgRating?: number;
  publishedAt?: number;
  classNameFr?: string;
  levelNameFr?: string;
}

interface RelatedTeacher {
  id: string;
  firstName: string;
  lastName: string;
  numericId: number;
  slug: string;
  avatarUrl: string | null;
  isVerifiedTeacher: number;
  schoolName: string | null;
  resourceCount: number;
}

interface RelatedSubject {
  id: string;
  slug: string;
  nameFr: string;
  color: string;
  count: number;
}

interface Payload {
  main: ResourceMain;
  sameTeacher: RelatedItem[];
  byTypeAndClass: RelatedItem[];
  newest: RelatedItem[];
  topInSubject: RelatedItem[];
  otherClassesSameLevel: RelatedItem[];
  otherTeachersSameSubj: RelatedTeacher[];
  sameSubjOtherClasses: RelatedItem[];
  corriges: RelatedItem[];
  otherSubjectsSameLevel: RelatedSubject[];
  tagList: string[];
  SITE_URL: string;
}

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

export default function NewDesign2027Client({ numericId }: { numericId: number }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/newdesign2027/${numericId}`)
      .then(r => r.json().then(j => ({ status: r.status, body: j })))
      .then(({ status, body }) => {
        if (status !== 200) {
          setError(body.error || 'Failed to load');
        } else {
          setData(body);
        }
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, [numericId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-slate-600">Chargement de la ressource…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Erreur</h1>
          <p className="text-slate-500">{error || 'Resource not found'}</p>
          <p className="text-xs text-slate-400 mt-2">Try /newdesign2027?id=2369 or /newdesign2027?id=454</p>
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
        ✨ NEW DESIGN 2027 — DEMO · /fr/ressources/{main.numericId}/{main.slug} · Switch: /newdesign2027?id=454 ou ?id=12173
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
        {/* TEACHER CTA */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-6 flex items-center gap-3">
          <Link href={`/fr/professeurs/${main.teacherNumericId || ''}`} className="flex items-center gap-3 flex-1 group">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold shadow-md">
              {teacherInitial}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Publié par</div>
              <div className="text-sm font-semibold text-slate-900 flex items-center gap-1 group-hover:text-amber-700">
                {teacherName}
                {main.teacherIsVerified ? (
                  <svg className="w-3.5 h-3.5 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L9.91 8.26 3 9.27l5.46 4.73L7 21l5-3 5 3-1.46-6.99L21 9.27l-6.91-1.01L12 2z"/>
                  </svg>
                ) : null}
              </div>
              {main.teacherSchool ? <div className="text-xs text-slate-500">{main.teacherSchool}</div> : null}
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
                {main.hasCorrection ? (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                    ✓ Corrigé
                  </span>
                ) : null}
                {main.language === 'ar' ? (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">AR</span>
                ) : null}
              </div>
              <h1 className="text-3xl lg:text-4xl font-extrabold text-slate-900 leading-tight mb-3">{main.title}</h1>
              {main.description && (
                <p className="text-base text-slate-600 leading-relaxed">
                  {main.description.slice(0, 300)}{main.description.length > 300 ? '…' : ''}
                </p>
              )}
            </div>

            {/* Action bar */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center gap-3">
              {pdfUrl ? (
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white text-sm font-bold rounded-xl shadow-lg shadow-primary-500/30 transition">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Télécharger ({fmtNum(main.fileSize ? main.fileSize / 1024 : null)} KB)
                </a>
              ) : null}
              <a href={pdfUrl || '#'} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition">
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
            {pdfUrl ? (
              <div className="bg-slate-900 rounded-2xl overflow-hidden shadow-2xl">
                <iframe
                  src={pdfUrl}
                  className="w-full"
                  style={{ height: '780px' }}
                  title={main.title}
                />
              </div>
            ) : null}

            {/* CORRIGES SIMILAIRES — moved up: first section right after PDF viewer */}
            {corriges.length > 0 ? (
              <div className="bg-gradient-to-br from-emerald-50 to-green-50 border-2 border-emerald-300 rounded-2xl p-6 shadow-lg shadow-emerald-500/10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-white text-lg font-bold">✅</div>
                  <div className="flex-1">
                    <div className="text-[11px] uppercase tracking-wider font-bold text-emerald-700">Vérifiez votre travail</div>
                    <h2 className="text-xl font-extrabold text-slate-900">Corrigés similaires ({main.subjectNameFr} {main.classNameFr})</h2>
                  </div>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full">{corriges.length} dispo</span>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {corriges.map((r: RelatedItem) => (
                    <a key={r.numericId} href={`/fr/ressources/${r.numericId}/${r.slug}`} className="group block bg-white border border-emerald-200 hover:border-emerald-500 hover:shadow-md rounded-xl p-3 transition">
                      <div className="flex items-start gap-2">
                        <div className="w-8 h-8 rounded-md flex-shrink-0 flex items-center justify-center text-white text-xs font-bold bg-gradient-to-br from-emerald-500 to-green-600">✓</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-slate-900 line-clamp-2 group-hover:text-emerald-700">{r.title}</div>
                          <div className="text-xs text-slate-500 mt-1">
                            {fmtNum(r.viewsCount)} vues{r.avgRating && r.avgRating > 0 ? ` · ⭐ ${r.avgRating.toFixed(1)}` : ''}
                          </div>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            {/* TABS: Cours / Devoirs / Exercices */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Cercle 1 — Topical Cluster</div>
                  <h2 className="text-xl font-extrabold text-slate-900">📚 {main.subjectNameFr} {main.classNameFr}</h2>
                  <p className="text-sm text-slate-500">Cours, devoirs, exercices et corrigés du même sujet et même classe</p>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {byTypeAndClass.slice(0, 9).map((r: RelatedItem) => (
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
                          {r.avgRating && r.avgRating > 0 ? <span>· ⭐ {r.avgRating.toFixed(1)}</span> : null}
                        </div>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>

            {/* SAME TEACHER expanded */}
            {sameTeacher.length > 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold">{teacherInitial}</div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Cercle 2 — E-E-A-T</div>
                    <h2 className="text-xl font-extrabold text-slate-900">👨‍🏫 Plus de ressources par {teacherName}</h2>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sameTeacher.slice(0, 9).map((r: RelatedItem) => (
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
            ) : null}

            {/* OTHER TEACHERS same subject+class */}
            {otherTeachersSameSubj.length > 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <div className="mb-4">
                  <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Cercle 2 — Link Diversity</div>
                  <h2 className="text-xl font-extrabold text-slate-900">👥 Autres profs qui enseignent {main.subjectNameFr} {main.classNameFr}</h2>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {otherTeachersSameSubj.map((t: RelatedTeacher) => {
                    const init = ((t.firstName?.[0] || '') + (t.lastName?.[0] || '')).toUpperCase();
                    return (
                      <a key={t.id} href={`/fr/professeurs/${t.numericId}`} className="group flex items-center gap-3 bg-slate-50 hover:bg-white border border-slate-200 hover:border-blue-300 rounded-xl p-3 transition">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-sm">
                          {init || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate group-hover:text-blue-700 flex items-center gap-1">
                            {t.firstName} {t.lastName}
                            {t.isVerifiedTeacher ? <span className="text-blue-500 text-xs">✓</span> : null}
                          </div>
                          <div className="text-xs text-slate-500">
                            {t.resourceCount} ressource{t.resourceCount > 1 ? 's' : ''}
                            {t.schoolName ? ` · ${t.schoolName}` : ''}
                          </div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* SAME SUBJECT OTHER CLASSES */}
            {sameSubjOtherClasses.length > 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <div className="mb-4">
                  <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Cercle 3 — Cross-class</div>
                  <h2 className="text-xl font-extrabold text-slate-900">📖 {main.subjectNameFr} dans les autres classes</h2>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sameSubjOtherClasses.slice(0, 6).map((r: RelatedItem) => (
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
            ) : null}

            {/* TAGS */}
            {tagList.length > 0 ? (
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
            ) : null}
          </div>

          {/* SIDEBAR (RIGHT) */}
          <div className="space-y-4 lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
            {/* Newest in same subject+class */}
            {newest.length > 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold">N</div>
                  <h3 className="text-sm font-extrabold text-slate-900">🆕 Nouveautés</h3>
                </div>
                <p className="text-xs text-slate-500 mb-3">Dernières ressources publiées en {main.subjectNameFr} {main.classNameFr}</p>
                <div className="space-y-2.5">
                  {newest.map((r: RelatedItem) => (
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
            ) : null}

            {/* Top viewed in same subject */}
            {topInSubject.length > 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white text-xs font-bold">🔥</div>
                  <h3 className="text-sm font-extrabold text-slate-900">Plus populaires en {main.subjectNameFr}</h3>
                </div>
                <div className="space-y-2.5">
                  {topInSubject.map((r: RelatedItem) => (
                    <a key={r.numericId} href={`/fr/ressources/${r.numericId}/${r.slug}`} className="group flex items-start gap-2">
                      <div className={`w-8 h-8 rounded-md flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold bg-gradient-to-br ${typeColor(r.type)}`}>
                        {typeLabel(r.type).slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-900 line-clamp-2 group-hover:text-amber-700">{r.title}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                          <span>{fmtNum(r.viewsCount)} vues</span>
                          {r.avgRating && r.avgRating > 0 ? <span>· ⭐ {r.avgRating.toFixed(1)}</span> : null}
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Other classes same level */}
            {otherClassesSameLevel.length > 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">↗</div>
                  <h3 className="text-sm font-extrabold text-slate-900">{main.subjectNameFr} dans d'autres classes</h3>
                </div>
                <div className="space-y-2">
                  {otherClassesSameLevel.slice(0, 5).map((r: RelatedItem) => (
                    <a key={r.numericId} href={`/fr/ressources/${r.numericId}/${r.slug}`} className="block group">
                      <div className="text-xs font-bold text-violet-700">{r.classNameFr}</div>
                      <div className="text-xs text-slate-700 truncate group-hover:text-violet-700">{r.title}</div>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Other subjects same level */}
            {otherSubjectsSameLevel.length > 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-white text-xs font-bold">↔</div>
                  <h3 className="text-sm font-extrabold text-slate-900">Autres matières en {main.levelNameFr || main.classNameFr}</h3>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {otherSubjectsSameLevel.slice(0, 6).map((s: RelatedSubject) => (
                    <a key={s.id} href={`/fr/matieres/${s.slug}`} className="block bg-slate-50 hover:bg-pink-50 rounded-lg p-2 transition text-center">
                      <div className="text-xs font-semibold text-slate-700">{s.nameFr}</div>
                      <div className="text-[10px] text-slate-400">{s.count} ress.</div>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

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
        {otherSubjectsSameLevel.length > 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6">
            <div className="mb-4">
              <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Pédagogie</div>
              <h2 className="text-xl font-extrabold text-slate-900">📖 Programme complet — {main.levelNameFr || main.classNameFr}</h2>
              <p className="text-sm text-slate-500">Explorez les autres matières de votre niveau</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {otherSubjectsSameLevel.map((s: RelatedSubject) => (
                <a key={s.id} href={`/fr/matieres/${s.slug}`} className="group bg-gradient-to-br from-slate-50 to-slate-100 hover:from-primary-50 hover:to-primary-100 border border-slate-200 hover:border-primary-300 rounded-xl p-3 text-center transition">
                  <div className="text-2xl mb-1">📚</div>
                  <div className="text-sm font-bold text-slate-900 group-hover:text-primary-700">{s.nameFr}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{s.count} ressources</div>
                </a>
              ))}
            </div>
          </div>
        ) : null}

        {/* FOOTER NOTE */}
        <div className="mt-8 text-center text-xs text-slate-400">
          <p>🎨 Cette page est un prototype de design pour le redesign 2027.</p>
          <p>Pour comparer avec l'ancien design : <Link href={`/fr/ressources/${main.numericId}/${main.slug}`} className="text-primary-600 hover:text-primary-700 underline">voir la version actuelle</Link></p>
        </div>
      </div>
    </div>
  );
}
