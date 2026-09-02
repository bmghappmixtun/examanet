import { BookOpen, FileText, Users, ChevronRight, Sparkles } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import type { LucideIcon } from 'lucide-react';
import { SUBJECT_ICONS } from '@/lib/subjects.icons';

interface SubjectHeroProps {
  subject: {
    slug: string;
    nameFr: string;
    nameAr: string;
    color: string;
    emoji: string;
    gradient: string;
    motif: 'dots' | 'grid' | 'waves' | 'sparkles' | 'circuit' | 'tree' | 'globe' | 'lines';
  };
  intro: string;
  totalResources: number;
  totalTeachers: number;
}

/**
 * Hero très design pour la page matière.
 * - Couleur principale + gradient par matière
 * - Iconographie Lucide
 * - Motif SVG inline (filigrane)
 * - Chiffres clés (ressources / profs)
 * - Tags populaires cliquables
 */
export default function SubjectHero({
  subject,
  totalResources,
  totalTeachers,
  intro,
}: SubjectHeroProps) {
  const Icon: LucideIcon =
    SUBJECT_ICONS[
      subject.motif === 'circuit'
        ? 'Cpu'
        : subject.motif === 'globe'
          ? 'Globe2'
          : subject.motif === 'waves'
            ? 'Music'
            : subject.motif === 'tree'
              ? 'Leaf'
              : 'BookOpen'
    ] ?? 'BookOpen';

  // Adapt color: HSL-based components for tints
  const lighterColor = hexToRgba(subject.color, 0.15);
  const borderColor = hexToRgba(subject.color, 0.3);

  return (
    <section
      className="relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${lighterColor} 0%, ${hexToRgba(subject.color, 0.05)} 100%)`,
        borderBottom: `1px solid ${borderColor}`,
      }}
    >
      {/* Motif SVG filigrane */}
      <SubjectMotif motif={subject.motif} color={subject.color} />

      {/* Floating decorative shapes */}
      <div
        className="absolute -top-20 -end-20 w-72 h-72 rounded-full blur-3xl opacity-30"
        style={{ background: subject.color }}
      />
      <div
        className="absolute -bottom-16 -start-16 w-64 h-64 rounded-full blur-3xl opacity-20"
        style={{ background: subject.color }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm text-slate-600 mb-5">
          <Link href="/" className="hover:text-slate-900 transition">
            Accueil
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link href="/matieres" className="hover:text-slate-900 transition">
            Matières
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-slate-900 font-semibold">{subject.nameFr}</span>
        </nav>

        <div className="flex flex-col lg:flex-row items-start gap-8">
          {/* Bloc icon + nom */}
          <div className="flex-1">
            <div className="flex items-center gap-5 mb-5">
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center text-5xl shadow-lg"
                style={{
                  background: `linear-gradient(135deg, ${hexToRgba(subject.color, 0.25)} 0%, ${hexToRgba(subject.color, 0.1)} 100%)`,
                  border: `2px solid ${hexToRgba(subject.color, 0.5)}`,
                }}
              >
                {subject.emoji}
              </div>
              <div>
                <h1
                  className="text-4xl lg:text-5xl font-extrabold tracking-tight"
                  style={{ color: subject.color }}
                >
                  {subject.nameFr}
                </h1>
                <p className="text-xl text-slate-700 mt-1" dir="rtl">
                  {subject.nameAr}
                </p>
              </div>
            </div>

            {/* Quick stats */}
            <div className="flex flex-wrap gap-3 mb-5">
              <PillStat
                icon={BookOpen}
                value={totalResources.toLocaleString()}
                label="ressources"
                color={subject.color}
              />
              <PillStat
                icon={Users}
                value={totalTeachers.toString()}
                label={`prof${totalTeachers > 1 ? 's' : ''} vérifié${totalTeachers > 1 ? 's' : ''}`}
                color={subject.color}
              />
              <PillStat icon={FileText} value="100%" label="gratuit" color={subject.color} />
              <PillStat
                icon={Sparkles}
                value="Programme"
                label="officiel JORT 2019"
                color={subject.color}
              />
            </div>

            {/* Quick filters (year + BAC sections) */}
            <QuickAccessTags slug={subject.slug} color={subject.color} />
          </div>

          {/* Right illustration block */}
          <div className="hidden lg:block">
            <div
              className="relative w-64 h-64 rounded-3xl flex items-center justify-center text-9xl"
              style={{
                background: `linear-gradient(135deg, ${hexToRgba(subject.color, 0.35)} 0%, ${hexToRgba(subject.color, 0.15)} 100%)`,
                border: `3px solid ${hexToRgba(subject.color, 0.4)}`,
                boxShadow: `0 20px 60px -10px ${hexToRgba(subject.color, 0.4)}`,
              }}
            >
              <span className="drop-shadow-2xl">{subject.emoji}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Mini-pill stats
 */
function PillStat({
  icon: Icon,
  value,
  label,
  color,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
  color: string;
}) {
  return (
    <div
      className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm"
      style={{
        background: 'rgba(255,255,255,0.7)',
        backdropFilter: 'blur(8px)',
        border: `1px solid ${hexToRgba(color, 0.3)}`,
        color: '#1c1917',
      }}
    >
      <Icon className="w-3.5 h-3.5" style={{ color }} />
      <span className="font-bold">{value}</span>
      <span className="text-slate-600 text-xs">{label}</span>
    </div>
  );
}

/**
 * Quick access tags : liens rapides vers les combinaisons les + cherchées
 */
function QuickAccessTags({ slug, color }: { slug: string; color: string }) {
  const tags = [
    { label: '4ème BAC', qs: 'annee=4AS' },
    { label: '3ème', qs: 'annee=3AS' },
    { label: 'BAC sujets', qs: 'type=BAC_SUBJECT' },
    { label: 'Corrigés', qs: 'hasCorrection=1' },
    { label: 'Devoirs', qs: 'type=DEVOIR' },
    { label: 'Cours', qs: 'type=COURSE' },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="text-xs text-slate-500 self-center me-1">Accès rapide:</span>
      {tags.map((t) => (
        <Link
          key={t.qs}
          href={`/matieres/${slug}?${t.qs}`}
          className="text-xs px-2.5 py-1 rounded-full bg-white border transition hover:scale-105"
          style={{ borderColor: hexToRgba(color, 0.3), color }}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

/**
 * Motif SVG inline selon le type de matière (filigrane)
 */
function SubjectMotif({
  motif,
  color,
}: {
  motif: 'dots' | 'grid' | 'waves' | 'sparkles' | 'circuit' | 'tree' | 'globe' | 'lines';
  color: string;
}) {
  const fillColor = hexToRgba(color, 0.08);

  if (motif === 'circuit' || motif === 'globe' || motif === 'lines') {
    return (
      <svg
        className="absolute end-0 top-0 h-full w-1/2 opacity-40 pointer-events-none"
        viewBox="0 0 400 400"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern
            id={`motif-${motif}`}
            x="0"
            y="0"
            width="40"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            {motif === 'circuit' && (
              <>
                <path
                  d="M 0 20 L 20 20 L 20 0 M 20 20 L 40 20 M 20 20 L 20 40"
                  stroke={fillColor}
                  strokeWidth="1"
                  fill="none"
                />
                <circle cx="20" cy="20" r="2" fill={fillColor} />
              </>
            )}
            {motif === 'globe' && (
              <>
                <circle cx="20" cy="20" r="15" stroke={fillColor} strokeWidth="0.8" fill="none" />
                <ellipse
                  cx="20"
                  cy="20"
                  rx="15"
                  ry="6"
                  stroke={fillColor}
                  strokeWidth="0.8"
                  fill="none"
                />
                <line x1="20" y1="5" x2="20" y2="35" stroke={fillColor} strokeWidth="0.8" />
              </>
            )}
            {motif === 'lines' && (
              <>
                <line x1="0" y1="20" x2="40" y2="20" stroke={fillColor} strokeWidth="0.8" />
                <line x1="0" y1="10" x2="40" y2="10" stroke={fillColor} strokeWidth="0.6" />
                <line x1="0" y1="30" x2="40" y2="30" stroke={fillColor} strokeWidth="0.6" />
              </>
            )}
          </pattern>
        </defs>
        <rect width="400" height="400" fill={`url(#motif-${motif})`} />
      </svg>
    );
  }

  if (motif === 'tree') {
    return (
      <svg
        className="absolute end-0 top-0 h-full w-1/2 opacity-30 pointer-events-none"
        viewBox="0 0 200 200"
      >
        <path
          d="M 100 50 Q 90 30 80 50 Q 70 30 60 50 Q 50 30 40 50"
          stroke={fillColor}
          strokeWidth="2"
          fill="none"
        />
        <circle cx="100" cy="50" r="6" fill={fillColor} />
        <circle cx="80" cy="60" r="4" fill={fillColor} />
        <circle cx="60" cy="70" r="4" fill={fillColor} />
        <circle cx="40" cy="80" r="4" fill={fillColor} />
      </svg>
    );
  }

  // dots / sparkles / waves fallback
  return (
    <svg
      className="absolute end-0 top-0 h-full w-1/2 opacity-30 pointer-events-none"
      viewBox="0 0 200 200"
    >
      {Array.from({ length: 30 }, (_, i) => (
        <circle
          key={i}
          cx={(i % 10) * 20 + 20}
          cy={Math.floor(i / 10) * 60 + 30}
          r={motif === 'sparkles' ? (1 + ((i * 7 + 3) % 4)) : 1.5}
          fill={fillColor}
        />
      ))}
    </svg>
  );
}

/** Helper hex + alpha → rgba() CSS string */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
