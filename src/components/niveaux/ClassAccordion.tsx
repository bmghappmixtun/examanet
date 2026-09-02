'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import {
  ChevronDown,
  ChevronRight,
  BookOpen,
  ArrowRight,
  FileText,
  Calendar,
  HardDrive,
  Eye,
  Download,
  X,
} from 'lucide-react';

// ============== TYPES ==============
export interface ClassSectionData {
  id: string;
  slug: string;
  nameFr: string;
  nameAr?: string | null;
  emoji: string;
  tint: string;
  _count: { resources: number };
  resources: ResourceMini[];
}

export interface ResourceMini {
  id: string;
  numericId?: number | null;
  slug: string;
  title: string;
  type: string;
  trimester: string | null;
  year: string | null;
  pageCount: number | null;
  fileSize: number | null;
  viewsCount: number;
  downloadsCount: number;
  subject: { slug: string; nameFr: string; color: string | null };
  teacher: { firstName: string | null; lastName: string | null } | null;
}

interface ClassAccordionProps {
  classData: {
    id: string;
    slug: string;
    nameFr: string;
    nameAr?: string | null;
    _count: { resources: number };
  };
  classStyle: { roman: string; emoji: string; tint: string };
  design: { color: string; cardGradient: string };
  /** When the class has no sections (e.g. Collège, 1AS) — keep the link behavior */
  hasSections: boolean;
  /** If hasSections === true */
  sections?: ClassSectionData[];
}

// Resource type chips (simplified)
const RESOURCE_TYPE_CHIPS: { value: string; label: string; color: string }[] = [
  { value: 'all', label: 'Tous', color: 'bg-slate-100 text-slate-700' },
  { value: 'COURSE', label: 'Cours', color: 'bg-blue-100 text-blue-700' },
  { value: 'EXERCISE', label: 'Exercices', color: 'bg-green-100 text-green-700' },
  { value: 'DEVOIR', label: 'Devoirs', color: 'bg-amber-100 text-amber-700' },
  { value: 'BAC_SUBJECT', label: 'Sujets Bac', color: 'bg-pink-100 text-pink-700' },
  { value: 'CORRECTION', label: 'Corrigés', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'EXAM', label: 'Examens', color: 'bg-red-100 text-red-700' },
  { value: 'SUMMARY', label: 'Résumés', color: 'bg-indigo-100 text-indigo-700' },
];

const TYPE_LABELS: Record<string, { fr: string; color: string }> = {
  COURSE: { fr: 'Cours', color: 'bg-blue-100 text-blue-700' },
  DEVOIR: { fr: 'Devoir', color: 'bg-amber-100 text-amber-700' },
  EXERCISE: { fr: 'Exercice', color: 'bg-green-100 text-green-700' },
  REVISION: { fr: 'Révision', color: 'bg-purple-100 text-purple-700' },
  EXAM: { fr: 'Examen', color: 'bg-red-100 text-red-700' },
  BAC_SUBJECT: { fr: 'Sujet Bac', color: 'bg-pink-100 text-pink-700' },
  CORRECTION: { fr: 'Corrigé', color: 'bg-emerald-100 text-emerald-700' },
  SUMMARY: { fr: 'Résumé', color: 'bg-indigo-100 text-indigo-700' },
  OTHER: { fr: 'Autre', color: 'bg-slate-100 text-slate-700' },
};

function formatSize(bytes: number | null): string | null {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ============== COMPONENT ==============
export default function ClassAccordion({
  classData,
  classStyle,
  design,
  hasSections,
  sections = [],
}: ClassAccordionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const { roman, emoji, tint } = classStyle;
  const totalCount = classData._count.resources;

  // ---------- Class card (button or link) ----------
  const cardInner = (
    <>
      {/* Top accent bar */}
      <div
        className="absolute top-0 start-0 end-0 h-1 origin-left scale-x-0 group-hover:scale-x-100 group-focus-visible:scale-x-100 transition-transform duration-300"
        style={{ background: design.color }}
      />
      {/* Background tint */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${design.cardGradient} opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-300 pointer-events-none`}
      />

      {/* Roman numeral icon block */}
      <div
        className="relative w-16 h-16 lg:w-20 lg:h-20 rounded-2xl flex items-center justify-center mb-3 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3"
        style={{
          background: `${tint}1A`,
          boxShadow: `0 6px 16px -6px ${tint}55`,
        }}
      >
        <span
          className="absolute text-2xl lg:text-3xl font-extrabold opacity-15"
          style={{ color: tint }}
        >
          {roman}
        </span>
        <span className="relative text-3xl lg:text-4xl drop-shadow-sm">{emoji}</span>
      </div>

      {/* Class name FR */}
      <h3 className="relative font-bold text-sm lg:text-base text-slate-900 leading-tight mb-1">
        {classData.nameFr}
      </h3>

      {/* AR name */}
      {classData.nameAr && (
        <p dir="rtl" className="relative text-xs text-slate-500 leading-tight mb-3" lang="ar">
          {classData.nameAr}
        </p>
      )}
      {!classData.nameAr && <div className="mb-3" />}

      {/* Resource count badge */}
      <div className="relative mt-auto">
        <span
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold"
          style={{ background: `${tint}15`, color: tint }}
        >
          <span className="tabular-nums">{totalCount.toLocaleString('fr-FR')}</span>
          <span className="font-normal opacity-80">ressources</span>
        </span>
      </div>

      {/* Bottom-right chevron (always shown if has sections) */}
      {hasSections && (
        <ChevronDown
          className={`absolute bottom-3 end-3 w-4 h-4 transition-all duration-300 ${
            isExpanded ? 'rotate-180' : ''
          }`}
          style={{ color: tint }}
        />
      )}
      {!hasSections && (
        <ArrowRight className="absolute bottom-3 end-3 w-4 h-4 text-slate-300 group-hover:text-slate-600 group-hover:translate-x-1 transition-all duration-300" />
      )}
    </>
  );

  return (
    <div className="contents">
      {hasSections ? (
        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          aria-expanded={isExpanded}
          className="group relative flex flex-col items-center text-center p-5 lg:p-6 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-slate-300 focus-visible:shadow-xl focus-visible:-translate-y-1 focus-visible:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 transition-all duration-300 overflow-hidden"
        >
          {cardInner}
        </button>
      ) : (
        <Link
          href={`/ressources?class=${classData.slug}`}
          className="group relative flex flex-col items-center text-center p-5 lg:p-6 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-slate-300 transition-all duration-300 overflow-hidden"
        >
          {cardInner}
        </Link>
      )}

      {/* ============== EXPANDED: SECTIONS ============== */}
      {hasSections && isExpanded && (
        <div className="col-span-full mt-3 animate-in fade-in slide-in-from-top-2 duration-300">
          {/* Sections header */}
          <div
            className="flex items-center gap-3 mb-4 px-4 py-3 rounded-xl border"
            style={{
              background: `${design.color}08`,
              borderColor: `${design.color}25`,
            }}
          >
            <BookOpen className="w-5 h-5" style={{ color: design.color }} />
            <div className="flex-1">
              <h4 className="font-bold text-slate-900 text-sm">Sections de {classData.nameFr}</h4>
              <p className="text-xs text-slate-500">
                {sections.length} sections ·{' '}
                {sections.reduce((a, s) => a + s._count.resources, 0).toLocaleString('fr-FR')}{' '}
                ressources au total
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsExpanded(false);
                setExpandedSectionId(null);
              }}
              className="text-slate-400 hover:text-slate-600 transition p-1 rounded-md hover:bg-white"
              aria-label="Fermer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Sections grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {sections.map((section) => {
              const isActive = expandedSectionId === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() =>
                    setExpandedSectionId((prev) => (prev === section.id ? null : section.id))
                  }
                  aria-expanded={isActive}
                  className={`group/sec relative flex flex-col items-center text-center p-4 rounded-xl border-2 transition-all duration-200 ${
                    isActive
                      ? 'shadow-md -translate-y-0.5'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm hover:-translate-y-0.5'
                  }`}
                  style={
                    isActive
                      ? {
                          background: `${section.tint}10`,
                          borderColor: section.tint,
                        }
                      : undefined
                  }
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-2 transition-transform group-hover/sec:scale-110"
                    style={{ background: `${section.tint}18` }}
                  >
                    {section.emoji}
                  </div>
                  <h5 className="font-bold text-sm text-slate-900 leading-tight">
                    {section.nameFr}
                  </h5>
                  {section.nameAr && (
                    <p dir="rtl" lang="ar" className="text-[11px] text-slate-500 mt-0.5">
                      {section.nameAr}
                    </p>
                  )}
                  <div className="mt-2">
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{
                        background: `${section.tint}15`,
                        color: section.tint,
                      }}
                    >
                      <span className="tabular-nums">
                        {section._count.resources.toLocaleString('fr-FR')}
                      </span>
                      <span className="font-normal opacity-80">fichiers</span>
                    </span>
                  </div>
                  <ChevronRight
                    className={`absolute top-2 end-2 w-3.5 h-3.5 transition-transform ${
                      isActive ? 'rotate-90' : ''
                    }`}
                    style={{ color: isActive ? section.tint : '#94a3b8' }}
                  />
                </button>
              );
            })}
          </div>

          {/* ============== EXPANDED: SECTION RESOURCES ============== */}
          {expandedSectionId && (
            <SectionResourceView
              section={sections.find((s) => s.id === expandedSectionId)!}
              typeFilter={typeFilter}
              onTypeFilterChange={setTypeFilter}
              onClose={() => setExpandedSectionId(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ============== SECTION RESOURCE VIEW ==============
function SectionResourceView({
  section,
  typeFilter,
  onTypeFilterChange,
  onClose,
}: {
  section: ClassSectionData;
  typeFilter: string;
  onTypeFilterChange: (t: string) => void;
  onClose: () => void;
}) {
  const filtered =
    typeFilter === 'all'
      ? section.resources
      : section.resources.filter((r) => r.type === typeFilter);

  // Type counts for chips
  const typeCounts: Record<string, number> = { all: section.resources.length };
  section.resources.forEach((r) => {
    typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
  });

  return (
    <div
      className="col-span-full mt-4 p-5 lg:p-6 bg-white border-2 rounded-2xl shadow-sm animate-in fade-in slide-in-from-top-2 duration-300"
      style={{ borderColor: `${section.tint}40` }}
    >
      {/* Section header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">{section.emoji}</span>
            <h4 className="text-lg font-extrabold text-slate-900">
              {section.nameFr} · {section._count.resources.toLocaleString('fr-FR')} ressources
            </h4>
          </div>
          {section.nameAr && (
            <p dir="rtl" lang="ar" className="text-sm text-slate-500">
              {section.nameAr}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 transition p-1.5 rounded-md hover:bg-slate-100"
          aria-label="Fermer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Type filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {RESOURCE_TYPE_CHIPS.map((chip) => {
          const count = typeCounts[chip.value] || 0;
          const isActive = typeFilter === chip.value;
          if (count === 0 && chip.value !== 'all') return null;
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => onTypeFilterChange(chip.value)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                isActive
                  ? 'bg-slate-900 text-white border-slate-900'
                  : `${chip.color} border-transparent hover:scale-105`
              }`}
            >
              {chip.label}
              <span
                className={`tabular-nums text-[10px] ${isActive ? 'opacity-80' : 'opacity-70'}`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Resources list */}
      {filtered.length === 0 ? (
        <div className="text-center py-10 text-slate-500">
          <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Aucun fichier de ce type pour le moment.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const typeInfo = TYPE_LABELS[r.type] || {
              fr: r.type,
              color: 'bg-slate-100 text-slate-700',
            };
            const subjectColor = r.subject.color || '#0EA5E9';
            const teacherName =
              [r.teacher?.firstName, r.teacher?.lastName].filter(Boolean).join(' ') || null;
            return (
              <Link
                key={r.id}
                href={`/ressources/${r.numericId}/${r.slug}`}
                className="group/res flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm transition"
              >
                {/* Subject color accent */}
                <div
                  className="w-1 self-stretch rounded-full flex-shrink-0"
                  style={{ background: subjectColor }}
                />
                {/* Type badge */}
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex-shrink-0 ${typeInfo.color}`}
                >
                  {typeInfo.fr}
                </span>
                {/* Title + meta */}
                <div className="flex-1 min-w-0">
                  <h5 className="font-semibold text-sm text-slate-900 line-clamp-1 group-hover/res:text-primary-600 transition">
                    {r.title}
                  </h5>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                    <span style={{ color: subjectColor }} className="font-semibold">
                      {r.subject.nameFr}
                    </span>
                    {r.year && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-0.5">
                          <Calendar className="w-3 h-3" /> {r.year}
                        </span>
                      </>
                    )}
                    {r.trimester && (
                      <>
                        <span>·</span>
                        <span>T{r.trimester}</span>
                      </>
                    )}
                    {r.pageCount && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-0.5">
                          <FileText className="w-3 h-3" /> {r.pageCount}p
                        </span>
                      </>
                    )}
                    {formatSize(r.fileSize) && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-0.5">
                          <HardDrive className="w-3 h-3" /> {formatSize(r.fileSize)}
                        </span>
                      </>
                    )}
                    {teacherName && (
                      <>
                        <span>·</span>
                        <span>par {teacherName}</span>
                      </>
                    )}
                  </div>
                </div>
                {/* Stats */}
                <div className="hidden sm:flex items-center gap-3 text-[11px] text-slate-500 flex-shrink-0">
                  {r.viewsCount > 0 && (
                    <span className="inline-flex items-center gap-0.5">
                      <Eye className="w-3 h-3" /> {r.viewsCount}
                    </span>
                  )}
                  {r.downloadsCount > 0 && (
                    <span className="inline-flex items-center gap-0.5">
                      <Download className="w-3 h-3" /> {r.downloadsCount}
                    </span>
                  )}
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover/res:text-slate-600 group-hover/res:translate-x-1 transition flex-shrink-0" />
              </Link>
            );
          })}
        </div>
      )}

      {/* View all link */}
      <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {filtered.length} fichier{filtered.length > 1 ? 's' : ''} affiché
          {filtered.length < section._count.resources && (
            <> sur {section._count.resources.toLocaleString('fr-FR')}</>
          )}
        </span>
        <Link
          href={`/ressources?class=${section.slug}&section=${section.slug}`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-bold rounded-lg hover:bg-slate-800 transition group/all"
        >
          Voir tous les fichiers
          <ArrowRight className="w-4 h-4 group-hover/all:translate-x-1 transition-transform" />
        </Link>
      </div>
    </div>
  );
}
