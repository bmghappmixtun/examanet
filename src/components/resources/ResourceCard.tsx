import { Link } from '@/i18n/navigation';
import { Star, Eye, Download, CheckCircle2, GraduationCap, MessageCircle } from 'lucide-react';
import { RESOURCE_TYPE_LABELS, HOMEWORK_SUBTYPE_LABELS, teacherNameFr, teacherNameAr } from '@/lib/utils';
import { isArabic } from '@/lib/text-utils';
import FavoriteButton from './FavoriteButton';
import ResourceAge from './ResourceAge';

export interface ResourceCardData {
  id: string;
  numericId?: number | null;
  slug: string;
  title: string;
  type: string;
  summary?: string | null;
  viewsCount: number;
  downloadsCount: number;
  avgRating: number;
  ratingCount: number;
  commentsCount: number;
  favoritesCount?: number;
  isFavorited?: boolean;
  fileSize?: number;
  pageCount?: number | null;
  language?: string;
  year?: string | null;
  publishedAt?: Date | string | null;
  // Homework & school metadata
  homeworkSubtype?: string | null;
  homeworkNumber?: number | null;
  schoolType?: string | null;
  product?: string | null;
  hasCorrection?: boolean;
  subject: { slug: string; nameFr: string; color: string | null; icon?: string | null };
  class: { slug: string; nameFr: string } | null;
  teacher: {
    firstName: string | null;
    lastName: string | null;
    firstNameAr?: string | null;
    lastNameAr?: string | null;
  } | null;
}

function formatSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function timeAgo(date: Date | string | number | null | undefined): string {
  if (date == null || date === 0 || date === '') return '';
  let d: Date;
  if (typeof date === 'number') {
    d = new Date(date);
  } else if (typeof date === 'string' && /^\d+$/.test(date)) {
    d = new Date(Number(date));
  } else if (typeof date === 'string') {
    d = new Date(date);
  } else {
    d = date;
  }
  if (isNaN(d.getTime())) return '';
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 1) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days < 7) return `${days}j`;
  if (days < 30) return `${Math.floor(days / 7)}sem`;
  if (days < 365) return `${Math.floor(days / 30)}mois`;
  return `${Math.floor(days / 365)}an`;
}

function formatCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function langBadge(lang?: string): string {
  if (lang === 'ar') return '🇹🇳';
  if (lang === 'fr') return '🇫🇷';
  if (lang === 'en') return '🇬🇧';
  if (lang === 'it') return '🇮🇹';
  if (lang === 'de') return '🇩🇪';
  if (lang === 'es') return '🇪🇸';
  if (lang === 'fr+ar' || lang === 'ar+fr') return '🇫🇷+🇹🇳';
  return '🇫🇷';
}

export default function ResourceCard({ resource }: { resource: ResourceCardData }) {
  const typeLabel = RESOURCE_TYPE_LABELS[resource.type] || RESOURCE_TYPE_LABELS.OTHER;
  // 2026-09-10: Use shared helpers for FR+AR consistency across the app.
  // Note: empty fallback ('') preserves the original behavior of hiding the byline
  // when the teacher has no name (vs the homepage / list which DO want 'Professeur').
  // BUG FIX 2026-09-10: previous code used `const teacherNameAr = ... teacherNameAr(...)`
  // which shadowed the import with a self-reference (TDZ → 500 on /fr + /fr/college).
  const teacherName = resource.teacher
    ? teacherNameFr(resource.teacher, '') || null
    : null;
  const arName = resource.teacher
    ? teacherNameAr(resource.teacher) || null
    : null;
  const subjectColor = resource.subject.color || '#0EA5E9';
  const titleIsAr = isArabic(resource.title);
  const summaryIsAr = resource.summary ? isArabic(resource.summary) : false;
  const isAr = titleIsAr || summaryIsAr;

  return (
    <Link
      href={`/ressources/${resource.numericId}/${resource.slug}`}
      className="group block relative overflow-hidden rounded-2xl bg-white border border-slate-200 min-w-0 max-w-full w-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:border-slate-300"
    >
      {/* Accent bar top — subject color */}
      <div
        className="absolute top-0 start-0 end-0 h-1 opacity-90"
        style={{ background: subjectColor }}
      />

      {/* Favorite button — top right */}
      <div className="absolute top-2 end-2 z-10">
        <FavoriteButton
          resourceId={resource.id}
          initialFavorited={resource.isFavorited ?? false}
          initialCount={resource.favoritesCount ?? 0}
        />
      </div>

      <div className="p-5">
        {/* Pills row */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3 pe-10">
          <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider rounded-full">
            {typeLabel.fr}
          </span>
          {resource.class && (
            <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-[10px] font-bold uppercase tracking-wider rounded-full">
              {resource.class.nameFr}
            </span>
          )}
          <span
            className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full"
            style={{
              background: `${subjectColor}15`,
              color: subjectColor,
            }}
          >
            {resource.subject.icon || '📄'} {resource.subject.nameFr}
          </span>
          {resource.hasCorrection && (
            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wider rounded-full inline-flex items-center gap-1">
              <CheckCircle2 className="w-2.5 h-2.5" /> Corrigé
            </span>
          )}
        </div>

        {/* Homework subtype */}
        {resource.type === 'DEVOIR' &&
          resource.homeworkSubtype &&
          HOMEWORK_SUBTYPE_LABELS[resource.homeworkSubtype] && (
            <div className="mb-2">
              <span
                className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${HOMEWORK_SUBTYPE_LABELS[resource.homeworkSubtype].color}`}
              >
                {HOMEWORK_SUBTYPE_LABELS[resource.homeworkSubtype].fr}
                {resource.homeworkNumber ? ` N°${resource.homeworkNumber}` : ''}
              </span>
            </div>
          )}

        {/* Title */}
        <h3
          className={`text-base font-extrabold text-slate-900 leading-snug mb-2 group-hover:text-blue-600 transition-colors line-clamp-2 ${titleIsAr ? 'text-right' : 'text-left'}`}
          dir={titleIsAr ? 'rtl' : 'ltr'}
          lang={titleIsAr ? 'ar' : 'fr'}
        >
          {resource.title}
        </h3>

        {/* Summary */}
        {resource.summary ? (
          <p
            className={`text-sm text-slate-600 leading-relaxed mb-3 line-clamp-2 ${summaryIsAr ? 'text-right' : 'text-left'}`}
            dir={summaryIsAr ? 'rtl' : 'ltr'}
            lang={summaryIsAr ? 'ar' : 'fr'}
          >
            {resource.summary}
          </p>
        ) : (
          <p className="text-sm text-slate-400 italic mb-3 line-clamp-2">
            Pas de résumé disponible.
          </p>
        )}

        {/* Metadata chips */}
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          {resource.year && (
            <span className="text-[11px] text-slate-500 bg-slate-50 px-2 py-0.5 rounded">
              {`📅 ${resource.year}`}
            </span>
          )}
          {resource.pageCount != null && resource.pageCount > 0 && (
            <span className="text-[11px] text-slate-500 bg-slate-50 px-2 py-0.5 rounded">
              📄 {resource.pageCount} {isAr ? 'ص' : 'p'}
            </span>
          )}
          {resource.fileSize && (
            <span className="text-[11px] text-slate-500 bg-slate-50 px-2 py-0.5 rounded">
              {`💾 ${formatSize(resource.fileSize)}`}
            </span>
          )}
          <span className="text-[11px] text-slate-500 bg-slate-50 px-2 py-0.5 rounded">
            {langBadge(resource.language)}
          </span>
        </div>

        {/* Teacher */}
        {teacherName && (
          <div className="flex items-center gap-2 mb-4 flex-wrap text-xs">
            <span className="text-slate-500">{isAr ? 'الأستاذ' : 'Par'}</span>
            <span className="font-semibold text-slate-700">{teacherName}</span>
            {arName && !isAr && (
              <span className="text-slate-400" dir="rtl" lang="ar">
                {`· ${arName}`}
              </span>
            )}
            {resource.schoolType === 'PILOTE' && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded">
                <GraduationCap className="w-2.5 h-2.5" /> Pilote
              </span>
            )}
          </div>
        )}

        {/* Stats footer — ALWAYS show all 4 counters */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <div className="flex items-center gap-2.5 text-xs text-slate-500">
            <span className="flex items-center gap-1" title="Vues">
              <Eye className="w-3 h-3" />
              <span className="text-slate-900 font-bold">{formatCount(resource.viewsCount)}</span>
            </span>
            <span className="text-slate-300">·</span>
            <span className="flex items-center gap-1" title="Téléchargements">
              <Download className="w-3 h-3" />
              <span className="text-slate-900 font-bold">
                {formatCount(resource.downloadsCount)}
              </span>
            </span>
            <span className="text-slate-300">·</span>
            <span className="flex items-center gap-1" title={`${resource.ratingCount} avis`}>
              <Star
                className={`w-3 h-3 ${resource.ratingCount > 0 ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
              />
              <span
                className={resource.ratingCount > 0 ? 'text-slate-900 font-bold' : 'text-slate-400'}
              >
                {resource.ratingCount > 0 ? resource.avgRating.toFixed(1) : '—'}
              </span>
            </span>
            <span className="text-slate-300">·</span>
            <span
              className="flex items-center gap-1"
              title={`${resource.commentsCount} commentaires`}
            >
              <MessageCircle
                className={`w-3 h-3 ${resource.commentsCount > 0 ? 'text-slate-700' : 'text-slate-300'}`}
              />
              <span
                className={
                  resource.commentsCount > 0 ? 'text-slate-900 font-bold' : 'text-slate-400'
                }
              >
                {resource.commentsCount || 0}
              </span>
            </span>
          </div>
          <ResourceAge
            publishedAt={resource.publishedAt}
            initialLabel={timeAgo(resource.publishedAt)}
          />
        </div>
      </div>
    </Link>
  );
}
