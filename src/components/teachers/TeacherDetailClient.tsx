'use client';
// @ts-nocheck
import { useEffect, useState, use } from 'react';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import {
  GraduationCap, MapPin, BookOpen, FileText, Star, Award, Calendar,
  Download, Eye, MessageSquare, CheckCircle2, Heart,
  Users, Sparkles,
} from 'lucide-react';
import FollowButton from '@/components/social/FollowButton';
import MessageTeacherButton from '@/components/social/MessageTeacherButton';
import ShareButton from '@/components/share/ShareButton';

const TYPE_LABELS: Record<string, string> = {
  COURS: 'Cours', EXERCICES: 'Exercices', EXAMEN: 'Examen', DEVOIR: 'Devoir',
  FICHE: 'Fiche', BAC: 'Bac', CONCOURS: 'Concours', RESUME: 'Résumé', OTHER: 'Autre',
};
const TYPE_COLORS: Record<string, string> = {
  COURS: 'from-blue-400 to-blue-600', EXERCICES: 'from-emerald-400 to-emerald-600',
  EXAMEN: 'from-rose-400 to-rose-600', DEVOIR: 'from-amber-400 to-amber-600',
  FICHE: 'from-purple-400 to-purple-600', BAC: 'from-red-500 to-rose-700',
  CONCOURS: 'from-indigo-400 to-indigo-600', RESUME: 'from-cyan-400 to-cyan-600',
  OTHER: 'from-slate-400 to-slate-600',
};
const SITE_URL = 'https://examanet.com';
function isArabic(text: string): boolean { return text ? /[\u0600-\u06FF]/.test(text) : false; }
function getInitials(firstName: string, lastName: string): string {
  return [firstName, lastName].filter(Boolean).map(p => p[0]?.toUpperCase() || '').slice(0, 2).join('');
}

export default function TeacherDetailClient({ params }: { params: Promise<{ numericId: string; slug: string }> }) {
  const { numericId, slug } = use(params);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFoundState, setNotFoundState] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const res = await fetch(`/api/professeurs/${numericId}/${slug}/data`, { cache: 'no-store' });
        if (cancelled) return;
        if (!res.ok) { if (res.status === 404) setNotFoundState(true); setLoading(false); return; }
        const json = await res.json();
        if (cancelled) return;
        if (json.error) { if (json.error === 'Not found') setNotFoundState(true); }
        else setData(json);
        setLoading(false);
      } catch { if (!cancelled) setLoading(false); }
    }
    fetchData();
    return () => { cancelled = true; };
  }, [numericId, slug]);

  if (loading) return <LoadingView />;
  if (notFoundState) { notFound(); return null; }
  if (!data) return <LoadingView />;
  return <DetailView data={data} />;
}

function LoadingView() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <div className="flex-1 pt-20">
        <div className="h-48 bg-slate-200 animate-pulse" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="h-96 bg-slate-100 rounded-2xl animate-pulse" />
            <div className="lg:col-span-2 space-y-3">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-slate-100 rounded-2xl animate-pulse" />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailView({ data }: { data: any }) {
  const { teacher, resources, resourceCount, totalFavorites, teachingSubjects, teachingClasses } = data;
  const fullName = [teacher.firstName, teacher.lastName].filter(Boolean).join(' ') || 'Professeur';
  const initials = getInitials(teacher.firstName || '', teacher.lastName || '');
  const latestResources = resources.slice(0, 6);
  const showToutVoir = resources.length > 6;
  const joinDate = teacher.approvedAt || teacher.createdAt;
  
  const personLd = {
    '@context': 'https://schema.org', '@type': 'Person', name: fullName, jobTitle: 'Professeur',
    url: `${SITE_URL}/professeurs/${teacher.numericId}`,
    ...(teacher.avatarUrl ? { image: teacher.avatarUrl } : {}),
    ...(teacher.bio ? { description: teacher.bio } : {}),
    ...(teacher.schoolName ? { affiliation: { '@type': 'Organization', name: teacher.schoolName } } : {}),
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Accueil', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Professeurs', item: `${SITE_URL}/professeurs` },
      { '@type': 'ListItem', position: 3, name: fullName, item: `${SITE_URL}/professeurs/${teacher.numericId}` },
    ],
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 pt-20">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(personLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
        
        <section className="bg-gradient-to-br from-primary-50 via-amber-50 to-rose-50 border-b border-amber-100">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
            <nav className="text-sm text-slate-500 mb-4 flex items-center gap-1.5">
              <Link href="/fr" className="hover:text-primary-600">Accueil</Link>
              <span>›</span>
              <Link href="/fr/professeurs" className="hover:text-primary-600">Professeurs</Link>
              <span>›</span>
              <span className="text-slate-700 font-medium">{fullName}</span>
            </nav>
            <div className="flex flex-col sm:flex-row items-start gap-6">
              {teacher.avatarUrl ? (
                <img src={teacher.avatarUrl} alt={fullName} className="w-24 h-24 lg:w-32 lg:h-32 rounded-2xl object-cover border-4 border-white shadow-lg flex-shrink-0" />
              ) : (
                <div className="w-24 h-24 lg:w-32 lg:h-32 rounded-2xl bg-gradient-to-br from-primary-500 to-rose-500 flex items-center justify-center text-white text-3xl font-extrabold border-4 border-white shadow-lg flex-shrink-0">
                  {initials}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-2xl lg:text-4xl font-extrabold text-slate-900 truncate">{fullName}</h1>
                  {teacher.isVerifiedTeacher && <CheckCircle2 className="w-6 h-6 text-emerald-500 flex-shrink-0" />}
                </div>
                {teacher.firstNameAr && teacher.lastNameAr && (
                  <p className="text-lg text-slate-600 mb-3" dir="rtl" lang="ar">{teacher.firstNameAr} {teacher.lastNameAr}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 mb-4 text-sm">
                  {teacher.schoolName && (
                    <span className="inline-flex items-center gap-1 bg-white/70 backdrop-blur border border-amber-200 px-2.5 py-1 rounded-lg text-slate-700">
                      <GraduationCap className="w-3.5 h-3.5 text-amber-600" />{teacher.schoolName}
                    </span>
                  )}
                  {teacher.governorate && (
                    <span className="inline-flex items-center gap-1 bg-white/70 backdrop-blur border border-amber-200 px-2.5 py-1 rounded-lg text-slate-700">
                      <MapPin className="w-3.5 h-3.5 text-rose-500" />{teacher.governorate}
                    </span>
                  )}
                  {joinDate && (
                    <span className="inline-flex items-center gap-1 bg-white/70 backdrop-blur border border-amber-200 px-2.5 py-1 rounded-lg text-slate-700">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />Membre depuis {new Date(joinDate).getFullYear()}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <FollowButton teacherId={teacher.id} teacherName={fullName} />
                  <MessageTeacherButton teacherId={teacher.id} teacherName={fullName} />
                  <ShareButton title={`${fullName} sur Examanet`} url={`${SITE_URL}/professeurs/${teacher.numericId}/${teacher.slug}`} />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid lg:grid-cols-3 gap-8">
            <aside className="lg:sticky lg:top-24 lg:self-start space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Statistiques</h2>
                <div className="space-y-3">
                  <StatItem icon={FileText} value={resourceCount} label="Ressources" color="text-primary-600 bg-primary-50" />
                  <StatItem icon={Users} value={teacher.followersCount} label="Abonnés" color="text-rose-600 bg-rose-50" />
                  <StatItem icon={Heart} value={totalFavorites} label="Favoris" color="text-amber-600 bg-amber-50" />
                  <StatItem icon={Download} value={resources.reduce((a: number, r: any) => a + (r.downloadsCount ?? 0), 0)} label="Téléchargements" color="text-emerald-600 bg-emerald-50" />
                </div>
              </div>
              {teachingSubjects.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Matières enseignées</h2>
                  <div className="flex flex-wrap gap-2">
                    {teachingSubjects.map((s: any) => (
                      <Link key={s.slug} href={{ pathname: '/fr/matieres/[subject]', params: { subject: s.slug } }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium hover:scale-105 transition" style={{ backgroundColor: s.color ? `${s.color}15` : '#f1f5f9', color: s.color || '#475569' }}>
                        {s.icon && <span>{s.icon}</span>}{s.nameFr}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {teachingClasses.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Niveaux</h2>
                  <div className="flex flex-wrap gap-2">
                    {teachingClasses.map((c: any) => (
                      <span key={c.slug} className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium">📚 {c.nameFr}</span>
                    ))}
                  </div>
                </div>
              )}
              {teacher.bio && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">À propos</h2>
                  <p className="text-sm text-slate-700 leading-relaxed">{teacher.bio}</p>
                </div>
              )}
            </aside>
            <div className="lg:col-span-2 space-y-6">
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-extrabold flex items-center gap-2">
                    <BookOpen className="w-6 h-6 text-primary-500" />Ressources ({resourceCount})
                  </h2>
                  <Link href={`/fr/ressources?teacherId=${teacher.numericId}` as any} className={`text-sm text-primary-600 hover:text-primary-700 font-semibold ${showToutVoir ? '' : 'hidden'}`} aria-hidden={!showToutVoir} tabIndex={showToutVoir ? 0 : -1}>
                    Tout voir →
                  </Link>
                </div>
                <div className={`space-y-3 ${resources.length === 0 ? 'hidden' : ''}`}>
                  {latestResources.map((r: any) => (
                    <Link key={r.id} href={{ pathname: '/fr/ressources/[id]/[slug]', params: { id: String(r.numericId), slug: r.slug } }} className="block bg-white rounded-2xl border border-slate-200 hover:border-primary-300 hover:shadow-md transition p-4 group">
                      <div className="flex items-start gap-3">
                        <div className={`w-12 h-14 rounded-lg bg-gradient-to-br ${TYPE_COLORS[r.type] || TYPE_COLORS.OTHER} flex items-center justify-center flex-shrink-0`}>
                          <FileText className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className={`font-bold text-slate-900 group-hover:text-primary-600 transition line-clamp-1 ${isArabic(r.title) ? 'text-right' : 'text-left'}`} dir={isArabic(r.title) ? 'rtl' : 'ltr'} lang={isArabic(r.title) ? 'ar' : 'fr'}>
                              {r.title}
                            </h3>
                            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-semibold flex-shrink-0">{TYPE_LABELS[r.type] || r.type}</span>
                          </div>
                          {r.description && <p className="text-sm text-slate-500 mt-1 line-clamp-2" dangerouslySetInnerHTML={{ __html: r.description }} />}
                          <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 flex-wrap">
                            {r.subject && <span className="flex items-center gap-1">{r.subject.icon && <span>{r.subject.icon}</span>}{r.subject.nameFr}</span>}
                            {r.class && <span>📚 {r.class.nameFr}</span>}
                            {r.section && <span>🎓 {r.section.nameFr}</span>}
                            <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{(r.viewsCount ?? 0).toLocaleString('fr-FR')}</span>
                            <span className="flex items-center gap-1"><Download className="w-3 h-3" />{(r.downloadsCount ?? 0).toLocaleString('fr-FR')}</span>
                            {r.avgRating > 0 && <span className="flex items-center gap-0.5 text-amber-500 font-semibold"><Star className="w-3 h-3 fill-current" />{r.avgRating.toFixed(1)}</span>}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
                <div className={`bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center ${resources.length === 0 ? '' : 'hidden'}`}>
                  <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p className="font-semibold text-slate-600">Aucune ressource publiée pour l'instant</p>
                  <p className="text-sm text-slate-500 mt-1">Ce professeur n'a pas encore partagé de contenu.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatItem({ icon: Icon, value, label, color }: any) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-xl font-extrabold text-slate-900">{(value ?? 0).toLocaleString('fr-FR')}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
}
