'use client';

import { useState } from 'react';
import { ChevronDown, Check, EyeOff, Eye } from 'lucide-react';
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

// Full French labels
const SUBTYPE_FULL_LABELS: Record<string, (n: number | null) => string> = {
  CONTROLE: (n) => n ? `Devoir de Contrôle N°${n}` : 'Devoir de Contrôle',
  SYNTHESE: (n) => n ? `Devoir de Synthèse N°${n}` : 'Devoir de Synthèse',
  MAISON: (n) => n ? `Devoir de Maison N°${n}` : 'Devoir de Maison',
  REVISION: (n) => n ? `Devoir de Révision N°${n}` : 'Devoir de Révision',
};

const TYPE_ORDER = ['CONTROLE', 'SYNTHESE', 'MAISON', 'REVISION'];

export default function SidebarFilters({ facets, classes, resultCount, visible, onToggleVisible }: SidebarFiltersProps) {
  const ctx = useDevoirsContext();
  const {
    classSlug, trimestre: activeTrimestre, subtype: activeSubtype, number: activeNumber,
    setClass, setTrimestre, setType, clearAll,
  } = ctx;

  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    classe: false,
    trimestre: false,
    type: false,
  });

  const toggle = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const subtypesByType: Record<string, Array<{ number: number; count: number }>> = {};
  for (const opt of facets.subtypes || []) {
    if (!subtypesByType[opt.subtype]) subtypesByType[opt.subtype] = [];
    subtypesByType[opt.subtype].push({ number: opt.number, count: opt.count });
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

  // Hidden state: show "Afficher les filtres" button only
  if (!visible) {
    return (
      <button onClick={onToggleVisible} className={styles.showFiltersBtn}>
        <Eye size={16} />
        <span>Afficher les filtres</span>
      </button>
    );
  }

  return (
    <aside className={styles.sidebar}>
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

      {/* TYPE section */}
      <section className={styles.sidebarSection}>
        <button className={styles.sidebarSectionHead} onClick={() => toggle('type')}>
          <span>Type de devoir</span>
          <ChevronDown size={16} className={`${styles.sidebarChevron} ${expanded.type ? styles.sidebarChevronOpen : ''}`} />
        </button>
        {expanded.type && (
          <div className={styles.sidebarSectionBody}>
            {TYPE_ORDER.filter((t) => subtypesByType[t]).map((subtype) => (
              <div key={subtype} className={styles.sidebarSubsection}>
                <div className={styles.sidebarSubsectionLabel}>{subtype}</div>
                {subtypesByType[subtype].map((opt) => {
                  const isActive = activeSubtype === subtype && activeNumber === String(opt.number);
                  const label = SUBTYPE_FULL_LABELS[subtype]?.(opt.number) || `${subtype} ${opt.number}`;
                  return (
                    <label key={`${subtype}-${opt.number}`} className={styles.sidebarCheckbox}>
                      <span className={`${styles.sidebarBox} ${isActive ? styles.sidebarBoxChecked : ''}`}>
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
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}
