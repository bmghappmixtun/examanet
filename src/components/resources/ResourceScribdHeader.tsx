'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from '@/i18n/navigation';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  FileText,
  Download,
  Star,
  MessageCircle,
  ListChecks,
  Target,
  Clock,
  BookOpen,
} from 'lucide-react';
import { formatNumber } from '@/lib/utils';

export interface ResourceScribdHeaderProps {
  resourceId: string;
  title: string;
  titleAr?: string | null;
  description?: string | null;
  pageCount?: number | null;
  fileSize?: string | null;
  viewsCount: number;
  downloadsCount: number;
  avgRating: number;
  commentsCount: number;
  downloadUrl: string;
  teacherName?: string | null;
  /** 2026-08-20: prof name in AR, used when isArDoc=true and AR version exists */
  teacherNameAr?: string | null;
  teacherProfileUrl?: string | null;
  aiInsights?: string[] | null;
  aiKeyPoints?: string[] | null;
  aiShortKeyPoints?: string[] | null;
  isArDoc?: boolean;
  /** 2026-08-18: subject name (e.g. "base de données", "algorithmique et
   *  programmation") — used to label the exercise insights accordion
   *  with the format `{N} exercices {matière}`. */
  subjectName?: string | null;
  /** Subject slug — currently unused but reserved for future palette
   *  lookups (e.g. color the chip per subject). */
  subjectSlug?: string | null;
}

const TRUNCATE_AT = 220;

export default function ResourceScribdHeader({
  resourceId,
  title,
  titleAr,
  description,
  pageCount,
  fileSize,
  viewsCount,
  downloadsCount,
  avgRating,
  commentsCount,
  downloadUrl,
  teacherName,
  teacherNameAr,
  teacherProfileUrl,
  aiInsights = null,
  aiKeyPoints = null,
  aiShortKeyPoints = null,
  isArDoc = false,
  subjectName = null,
  subjectSlug = null,
}: ResourceScribdHeaderProps) {
  const [expanded, setExpanded] = useState(false);
  // 2026-08-17 (Niveau 1.2): auto-collapse AI accordions when the user
  // scrolls into the PDF viewer. They stay closed until the user clicks
  // them again.
  // 2026-08-19 fix: each accordion now has its own state so clicking
  // one doesn't toggle the other. (Previous bug: both shared `aiOpen`.)
  const [aiInsightsOpen, setAiInsightsOpen] = useState(false);
  const [aiKeyPointsOpen, setAiKeyPointsOpen] = useState(false);
  const detailsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 2026-08-18 fix (v2): watch the bottom of the résumé card itself
    // (this component's root) instead of an external sentinel. The
    // accordions close as soon as the user starts scrolling into the
    // PDF — i.e. when the card is no longer the focal point. This is
    // more reliable than a sentinel (which can be misplaced) and more
    // intuitive (the AI sections close when you stop reading them).
    const root = detailsRef.current?.parentElement;
    if (!root) return;
    let lastClosed = false;
    const check = () => {
      const rect = root.getBoundingClientRect();
      // Close when the bottom of the card has scrolled above the header
      // (62px mobile, 73px desktop). At that point the user is
      // looking at the PDF, not the résumé.
      const headerH = window.matchMedia('(min-width: 1024px)').matches ? 73 : 62;
      const shouldClose = rect.bottom < headerH + 50;
      if (shouldClose && !lastClosed) {
        lastClosed = true;
        setAiInsightsOpen(false);
        setAiKeyPointsOpen(false);
      } else if (!shouldClose) {
        lastClosed = false;
      }
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, []);

  // 2026-08-17 (Niveau 1.3): reading time estimate. ~1.5 minutes per page
  // for academic content, rounded up to the nearest minute.
  const readingTimeMin = useMemo(() => {
    if (!pageCount) return null;
    return Math.max(1, Math.ceil(pageCount * 1.5));
  }, [pageCount]);

  const hasLongDescription = (description?.length ?? 0) > TRUNCATE_AT;
  // 2026-08-19 fix: strip HTML tags from description (AI summaries for
  // collège files contain <strong>/<br>/<em> tags that shouldn't be
  // rendered as raw text). We strip them BEFORE truncation so the
  // character count is consistent.
  const stripHtml = (s: string) =>
    s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const cleanDescription = description ? stripHtml(description) : description;
  const visibleDescription = hasLongDescription && !expanded
    ? cleanDescription!.slice(0, TRUNCATE_AT).trimEnd() + '…'
    : cleanDescription;

  // Merge short + long key points (alternate, max 10)
  const mergedKP = useMemo(() => {
    const longKps = aiKeyPoints || [];
    const shortKps = aiShortKeyPoints || [];
    const merged: { text: string; isShort: boolean }[] = [];
    const maxLen = Math.max(longKps.length, shortKps.length);
    for (let i = 0; i < maxLen && merged.length < 10; i++) {
      if (i < shortKps.length) merged.push({ text: shortKps[i], isShort: true });
      if (i < longKps.length && merged.length < 10) merged.push({ text: longKps[i], isShort: false });
    }
    return merged;
  }, [aiKeyPoints, aiShortKeyPoints]);

  const hasInsights = !!(aiInsights && aiInsights.length > 0);
  const hasKeyPoints = mergedKP.length > 0;
  const hasAnyAI = hasInsights || hasKeyPoints;

  // 2026-08-19: detect AR content from the title if isArDoc isn't explicit.
  // The page already passes isArDoc based on resource.language, but we
  // also auto-detect from the title in case language is wrong/missing.
  const titleIsAr = /[\u0600-\u06FF]/.test(title);
  const isAr = isArDoc || titleIsAr;

  // 2026-08-20: when AR, prefer the AR prof name (if available), else fall back to FR
  const displayTeacherName = isAr
    ? (teacherNameAr && teacherNameAr.trim() ? teacherNameAr : teacherName)
    : teacherName;

  return (
    <div
      id="resource-scribd-header"
      dir={isAr ? 'rtl' : 'ltr'}
      lang={isAr ? 'ar' : 'fr'}
      className={`bg-white rounded-2xl border border-slate-200 overflow-hidden mb-4 ${isAr ? 'font-arabic-title text-right' : ''}`}
    >
      <div className="p-5 lg:p-6">
        {/* Title */}
        <h1
          dir={isAr ? 'rtl' : 'ltr'}
          className={`text-xl lg:text-2xl font-extrabold text-slate-900 leading-tight mb-3 ${isAr ? 'font-arabic-title' : ''}`}
        >
          {title}
        </h1>

        {titleAr && (
          <div
            className="text-base lg:text-lg font-semibold text-slate-600 mb-3 leading-snug font-arabic-title"
            dir="rtl"
            lang="ar"
          >
            {titleAr}
          </div>
        )}

        {/* Stats line */}
        <div
          dir={isAr ? 'rtl' : 'ltr'}
          className={`flex items-center gap-3 text-xs text-slate-500 mb-3 flex-wrap ${isAr ? 'justify-start text-right' : ''}`}
        >
          <span className="inline-flex items-center gap-1">
            <Eye className="w-3.5 h-3.5" /> {formatNumber(viewsCount)} vues
          </span>
          <span className="text-slate-300">•</span>
          <span className="inline-flex items-center gap-1">
            <Download className="w-3.5 h-3.5" /> {formatNumber(downloadsCount)} téléchargements
          </span>
          <span className="text-slate-300">•</span>
          <span className="inline-flex items-center gap-1">
            <Star className="w-3.5 h-3.5" /> {avgRating.toFixed(1)}/5
          </span>
          <span className="text-slate-300">•</span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="w-3.5 h-3.5" /> {commentsCount} commentaires
          </span>
          {pageCount ? (
            <>
              <span className="text-slate-300">•</span>
              <span className="inline-flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" /> {pageCount} pages
              </span>
            </>
          ) : null}
          {readingTimeMin ? (
            <>
              <span className="text-slate-300">•</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> ≈ {readingTimeMin} min de lecture
              </span>
            </>
          ) : null}
          {fileSize ? (
            <>
              <span className="text-slate-300">•</span>
              <span>{fileSize}</span>
            </>
          ) : null}
        </div>

        {/* Description with expand */}
        {description ? (
          <div className="mb-4">
            <p
              dir={isAr ? 'rtl' : 'ltr'}
              className={`text-sm text-slate-700 leading-relaxed whitespace-pre-line ${isAr ? 'font-arabic-title' : ''}`}
            >
              {visibleDescription}
            </p>
            {hasLongDescription && (
              <button
                onClick={() => setExpanded((e) => !e)}
                className={`text-sm text-primary-600 font-semibold hover:underline mt-1 inline-flex items-center gap-1 ${isAr ? 'flex-row-reverse font-arabic-title' : ''}`}
              >
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {expanded
                  ? (isAr ? 'طي' : 'Réduire')
                  : (isAr ? 'الوصف الكامل' : 'Description complète')}
              </button>
            )}
          </div>
        ) : null}

        {/* Transféré par — right-aligned per user request 2026-08-17.
            2026-08-19: AR translation 'نقل بواسطة' when the doc is AR.
            2026-08-20: when AR, use the prof's AR name (teacherNameAr) if available,
            else fall back to the FR name. */}
        {displayTeacherName && (
          <div dir={isAr ? 'rtl' : 'ltr'} className={`text-xs text-slate-500 mb-3 text-right ${isAr ? 'font-arabic-title' : ''}`}>
            {isAr ? 'نقل بواسطة' : 'Transféré par'}{' '}
            {teacherProfileUrl ? (
              <a
                href={teacherProfileUrl}
                className={`font-semibold text-primary-600 hover:underline ${isAr ? 'font-arabic-title' : ''}`}
              >
                {displayTeacherName}
              </a>
            ) : (
              <span className={`font-semibold text-slate-700 ${isAr ? 'font-arabic-title' : ''}`}>{displayTeacherName}</span>
            )}
          </div>
        )}

        {/* AI sections as collapsible accordions */}
        {hasAnyAI && (
          <div ref={detailsRef} className="pt-2 space-y-2">
            {hasInsights && (
              <details
                className="group"
                open={aiInsightsOpen}
                onToggle={(e) => setAiInsightsOpen((e.target as HTMLDetailsElement).open)}
              >
                <summary
                  dir={isAr ? 'rtl' : 'ltr'}
                  className={`flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-primary-600 cursor-pointer list-none py-1.5 ${isAr ? 'font-arabic-title' : ''}`}
                >
                  {/* Source order: [icon, text, chevron].
                      In LTR, chevron has ml-auto so it pushes to the right
                      edge (icon left, text middle, chevron right).
                      In RTL (direction: rtl), the visual order auto-
                      reverses to [chevron (left), text (middle),
                      icon (right)], all clustered on main-start (the
                      RIGHT) — no ml-auto needed.
                      2026-08-19: previous code used `flex-row-reverse`
                      which canceled with inherited direction: rtl. */}
                  <ListChecks className="w-4 h-4 text-primary-500 shrink-0" />
                  <span className="flex-1">{isAr ? 'نظرة عامة على التمارين' : 'Aperçu des exercices'}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform shrink-0 ${isAr ? '' : 'ml-auto'}`} />
                </summary>
                <div
                  dir={isAr ? 'rtl' : 'ltr'}
                  className={`pl-6 py-2 text-sm text-slate-600 space-y-2 ${isAr ? 'text-right font-arabic-title' : ''}`}
                >
                  {/* 2026-08-18: "{N} exercices {matière}" chip INSIDE the
                      accordion body, above the list of exercises. Format
                      per user rule: count of insights + real subject name
                      (not the parsed "Autre" fallback). */}
                  {aiInsights && aiInsights.length > 0 && (
                    <div className="mb-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-primary-50 text-primary-700 border border-primary-200">
                        <BookOpen className="w-3 h-3" />
                        {/* 2026-08-19: AR translation — use 'تمارين' for
                            'exercices' when the doc is in AR, so the chip
                            is 100% in the same language as the file. */}
                        {isAr
                          ? `${aiInsights.length} تمارين${subjectName ? ' ' + (subjectName || 'العربية') : ''}`
                          : `${aiInsights.length} exercice${aiInsights.length > 1 ? 's' : ''}${subjectName ? ' ' + subjectName : ''}`}
                      </span>
                    </div>
                  )}
                  {aiInsights!.map((item, i) => (
                    <div key={i} className="leading-relaxed">{item}</div>
                  ))}
                </div>
              </details>
            )}

            {hasKeyPoints && (
              <details
                className="group"
                open={aiKeyPointsOpen}
                onToggle={(e) => setAiKeyPointsOpen((e.target as HTMLDetailsElement).open)}
              >
                <summary
                  dir={isAr ? 'rtl' : 'ltr'}
                  className={`flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-primary-600 cursor-pointer list-none py-1.5 ${isAr ? 'font-arabic-title' : ''}`}
                >
                  <Target className="w-4 h-4 text-primary-500 shrink-0" />
                  <span className="flex-1">{isAr ? 'النقاط الرئيسية' : 'Points clés'}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform shrink-0 ${isAr ? '' : 'ml-auto'}`} />
                </summary>
                {/* 2026-08-19: KP bubbles are now CLICKABLE — each one
                    links to the search page filtered by that topic. This
                    lets users discover related resources with the same
                    key point. Per user request. */}
                <div
                  dir={isAr ? 'rtl' : 'ltr'}
                  // 2026-08-19 fix: in RTL, 'justify-end' aligns to
                  // main-end (LEFT). Use 'justify-start' (which in
                  // RTL is the RIGHT/main-start) so KP bubbles are
                  // right-aligned for AR files.
                  className={`pl-6 py-2 flex flex-wrap gap-2 ${isAr ? 'justify-start font-arabic-title' : 'justify-start'}`}
                >
                  {mergedKP.map((kp, i) => (
                    <Link
                      key={i}
                      href={`/recherche?q=${encodeURIComponent(kp.text)}`}
                      dir={isAr ? 'rtl' : 'ltr'}
                      title={`Rechercher des ressources contenant « ${kp.text} »`}
                      className={`px-3 py-1 bg-white text-slate-700 border border-slate-200 rounded-full text-xs font-semibold hover:bg-primary-50 hover:text-primary-700 hover:border-primary-200 transition-colors cursor-pointer ${isAr ? 'text-right' : 'text-left'}`}
                    >
                      {kp.text}
                    </Link>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
