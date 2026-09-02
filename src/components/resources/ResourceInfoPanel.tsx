import { Link } from '@/i18n/navigation';
import { fileSize, timeAgo } from '@/lib/utils';
import {
  FileText,
  Tag,
  Globe,
  GraduationCap,
} from 'lucide-react';

const LANGUAGE_LABELS: Record<string, string> = {
  fr: '🇫🇷 Français',
  ar: '🇹🇳 العربية',
  en: '🇬🇧 English',
  it: '🇮🇹 Italiano',
  de: '🇩🇪 Deutsch',
  es: '🇪🇸 Español',
  'fr+ar': '🇫🇷 + 🇹🇳 Bilingue',
};

export default function ResourceInfoPanel({ resource, hideClasse = false }: { resource: any; hideClasse?: boolean }) {
  // AI-extracted topics (from `metadata.topics`) — shown as chips in the
  // sidebar right under "Langue" per user rule (2026-08-13). The old
  // `resource.tags` (PostgreSQL array, manual tags) is no longer rendered
  // here to avoid two "Tags" sections in the same panel.
  const topics: string[] = Array.isArray(resource.metadata?.topics)
    ? resource.metadata.topics.filter((t: any) => t && typeof t === 'string' && t.trim().length > 0)
    : [];

  return (
    <div className="card p-5">
      <h3 className="font-bold text-sm mb-4 text-slate-500 uppercase flex items-center gap-2">
        <FileText className="w-4 h-4" /> Informations
      </h3>

      <dl className="space-y-3 text-sm">
        {/* Per user rule (2026-08-06): the sidebar "Informations" panel is now
            a META panel (file facts only) — not a classification panel. The
            classification attributes (Type, Matière, Section, Trimestre,
            Année) are already encoded in the page header / breadcrumb / title
            format "BASE (year) : GeneralSubject", so showing them again here
            would be redundant. Classe can be kept (and hidden for lycée via
            `hideClasse` prop) because it's the primary navigation axis users
            scan for. What remains: Langue, Pages, Taille, Publié, Tags. */}

        {/* CLASSE */}
        {resource.class && !hideClasse && (
          <Row icon={<GraduationCap className="w-4 h-4" />} label="Classe">
            <span className="font-semibold text-slate-900">{resource.class.nameFr}</span>
          </Row>
        )}

        {/* LANGUE */}
        {resource.language && (
          <Row icon={<Globe className="w-4 h-4" />} label="Langue">
            <span className="font-semibold text-slate-900">
              {LANGUAGE_LABELS[resource.language] || resource.language}
            </span>
          </Row>
        )}

        {/* AI TOPICS (mots-clés 1 mot) — Per user rule (2026-08-13):
            The AI-extracted topics from `metadata.topics` are shown as small
            clickable chips right under "Langue" in the sidebar. Each tag links
            to the search page filtered by that topic. */}
        {topics.length > 0 && (
          <Row icon={<Tag className="w-4 h-4" />} label="Tags">
            <div className="flex flex-wrap gap-1.5">
              {topics.map((t: string, i: number) => (
                <Link
                  key={`${t}-${i}`}
                  href={`/recherche?q=${encodeURIComponent(t)}`}
                  className="inline-block text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 transition-colors"
                >
                  #{t}
                </Link>
              ))}
            </div>
          </Row>
        )}

        {/* Technical info — per user rule (2026-08-06): Pages is removed from
            the sidebar. The PDF viewer in the main column already shows the
            page count + navigation controls, so duplicating it in the
            sidebar was redundant. */}
        <div className="pt-3 border-t border-slate-100 space-y-2">
          {/* NOTE (2026-08-13): the "Tags" block (using `resource.tags`) was
              removed. The AI-extracted `metadata.topics` are now shown as
              chips right under "Langue" (per user rule), and showing two
              "Tags" sections in the same panel was redundant. */}

          <div className="flex justify-between text-xs">
            <dt className="text-slate-500">Taille du fichier</dt>
            <dd className="font-semibold text-slate-900">{fileSize(resource.fileSize)}</dd>
          </div>
          {resource.publishedAt && (
            <div className="flex justify-between text-xs">
              <dt className="text-slate-500">Publié</dt>
              <dd className="font-semibold text-slate-900">{timeAgo(resource.publishedAt)}</dd>
            </div>
          )}
        </div>
      </dl>
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      {icon && <span className="text-slate-400 mt-0.5 flex-shrink-0">{icon}</span>}
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">
          {label}
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}
