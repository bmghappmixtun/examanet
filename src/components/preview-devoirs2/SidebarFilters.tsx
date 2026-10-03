'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Check, EyeOff } from 'lucide-react';
import styles from './apex-devoirs.module.css';
import { useDevoirsContext } from './devoirs-context';

interface SidebarFiltersProps {
  facets: {
    total: number;
    trimestres: Record<string, number>;
    subtypes: Array<{ subtype: string; number: number; count: number }>;
  };
  classes: Array<{ slug: string; labelFr: string }>;
  resultCount: number;
  visible: boolean;
  onToggleVisible: () => void;
}

const SUBTYPE_FULL_LABELS: Record<string, (n: number | null) => string> = {
  CONTROLE: (n) => n ? `Devoir de Contrôle N°${n}` : 'Devoir de Contrôle',
  SYNTHESE: (n) => n ? `Devoir de Synthèse N°${n}` : 'Devoir de Synthèse',
  MAISON: (n) => n ? `Devoir de Maison N°${n}` : 'Devoir de Maison',
  REVISION: (n) => n ? `Devoir de Révision N°${n}` : 'Devoir de Révision',
};

// Color for each subtype bubble (Etsy-style colored badges)
const SUBTYPE_COLORS: Record<string, string> = {
  CONTROLE: '#0ea5e9',   // blue
  SYNTHESE: '#a855f7',   // purple
  MAISON: '#f59e0b',    // orange
  REVISION: '#10b981',   // green
};

const TYPE_ORDER = ['CONTROLE', 'SYNTHESE', 'MAISON', 'REVISION'];

export default function SidebarFilters({ facets, classes, resultCount, visible, onToggleVisible }: SidebarFiltersProps) {
  const ctx = useDevoirsContext();
  const {
    classSlug, trimestre: activeTrimestre, subtype: activeSubtype, number: activeNumber,
    setClass, setTrimestre, setType, clearAll,
  } = ctx;

  // Each top section + each subtype is its own collapsible
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    classe: false,
    trimestre: false,
    controle: false,
    synthese: false,
    maison: false,
    revision: false,
  });

  const toggle = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const subtypesByType: Record<string, Array<{ number: number; count: number }>> = {};
  for (const opt of facets.subtypes || []) {
    if (!subtypesByType[opt.subtype]) subtypesByType[opt.subtype] = [];
    subtypesByType[opt.subtype].push({ number: opt.number, count: opt.count });
  }

  // Total per subtype (sum of all numbers)
  const totalsByType: Record<string, number> = {};
  for (const opt of facets.subtypes || []) {
    totalsByType[opt.subtype] = (totalsByType[opt.subtype] || 0) + opt.count;
  }

  const toggleClasse = (slug: string) => setClass(classSlug === slug ? null : slug);
  const toggleTrimestre = (tri: string) => setTrimestre(activeTrimestre === tri ? null : tri);
  const toggleType = (subtype: string, number: string) => {
    if (activeSubtype === subtype && activeNumber === number) {
      setType(null, null);
    } else {
      setType(subtype, number);
    }
  };

  const hasActiveFilters = !!(classSlug || activeTrimestre || activeSubtype);

  // Always render both: the aside (hidden via CSS) and the "Afficher" button.
  // CSS controls visibility so toggling animates smoothly (no remount).

  // Render a subtype section (collapsible)
  const renderSubtypeSection = (subtype: string) => {
    const isExpanded = expanded[subtype.toLowerCase()];
    const options = subtypesByType[subtype] || [];
    const total = totalsByType[subtype] || 0;
    if (total === 0) return null;
    const color = SUBTYPE_COLORS[subtype] || '#64748b';

    return (
      <section key={subtype} className={styles.sidebarSubtypeSection}>
        <button className={styles.sidebarSubtypeHead} onClick={() => toggle(subtype.toLowerCase())}>
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className={styles.sidebarSubtypeLabel}>{SUBTYPE_FULL_LABELS[subtype](null)}</span>
          <span className={styles.sidebarSubtypeBubble} style={{ backgroundColor: color }}>
            {total}
          </span>
        </button>
        {isExpanded && (
          <div className={styles.sidebarSubtypeBody}>
            {options.map((opt) => {
              const isActive = activeSubtype === subtype && activeNumber === String(opt.number);
              const label = SUBTYPE_FULL_LABELS[subtype](opt.number);
              return (
                <label key={`${subtype}-${opt.number}`} className={styles.sidebarCheckbox}>
                  <span className={`${styles.sidebarBox} ${isActive ? styles.sidebarBoxChecked : ''}`}
                    style={isActive ? { backgroundColor: color, borderColor: color } : {}}>
                    {isActive && <Check size={12} strokeWidth={3} />}
                  </span>
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={() => toggleType(subtype, String(opt.number))}
                    style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                  />
                  <span className={styles.sidebarCheckboxLabel}>{label}</span>
                  <span className={styles.sidebarCount}>{opt.count}</span>
                </label>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  return (
    <aside className={`${styles.sidebar} ${!visible ? styles.sidebarHidden : ''}`}>
      <div className={styles.sidebarHeader}>
        <span className={styles.sidebarTitle}>Filtres</span>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {hasActiveFilters && (
            <button onClick={() => { clearAll(); setClass(null); }} className={styles.sidebarReset}>
              Réinitialiser
            </button>
          )}
          <button onClick={onToggleVisible} className={styles.sidebarHideBtn} aria-label="Masquer les filtres">
            <EyeOff size={16} />
            <span>Masquer les filtres</span>
          </button>
        </div>
      </div>

      {/* CLASSE section */}
      <section className={styles.sidebarSection}>
        <button className={styles.sidebarSectionHead} onClick={() => toggle('classe')}>
          <span>Classe</span>
          <ChevronDown size={16} className={`${styles.sidebarChevron} ${expanded.classe ? styles.sidebarChevronOpen : ''}`} />
        </button>
        {expanded.classe && (
          <div className={styles.sidebarSectionBody}>
            {classes.map((c) => {
              const checked = classSlug === c.slug;
              return (
                <label key={c.slug} className={styles.sidebarCheckbox}>
                  <span className={`${styles.sidebarBox} ${checked ? styles.sidebarBoxChecked : ''}`}>
                    {checked && <Check size={12} strokeWidth={3} />}
                  </span>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleClasse(c.slug)}
                    style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                  />
                  <span className={styles.sidebarCheckboxLabel}>{c.labelFr}</span>
                </label>
              );
            })}
          </div>
        )}
      </section>

      {/* TRIMESTRE section */}
      <section className={styles.sidebarSection}>
        <button className={styles.sidebarSectionHead} onClick={() => toggle('trimestre')}>
          <span>Trimestre</span>
          <ChevronDown size={16} className={`${styles.sidebarChevron} ${expanded.trimestre ? styles.sidebarChevronOpen : ''}`} />
        </button>
        {expanded.trimestre && (
          <div className={styles.sidebarSectionBody}>
            {[1, 2, 3].map((t) => {
              const checked = activeTrimestre === String(t);
              return (
                <label key={t} className={styles.sidebarCheckbox}>
                  <span className={`${styles.sidebarBox} ${checked ? styles.sidebarBoxChecked : ''}`}>
                    {checked && <Check size={12} strokeWidth={3} />}
                  </span>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleTrimestre(String(t))}
                    style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                  />
                  <span className={styles.sidebarCheckboxLabel}>Trimestre {t}</span>
                  <span className={styles.sidebarCount}>{facets.trimestres[String(t)] || 0}</span>
                </label>
              );
            })}
          </div>
        )}
      </section>

      {/* TYPE DE DEVOIR section - each subtype is a collapsible sub-section */}
      {TYPE_ORDER.map((subtype) => renderSubtypeSection(subtype))}
    </aside>
  );
}
