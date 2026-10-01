'use client';

import { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
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
}

const SUBTYPE_LABELS: Record<string, string> = {
  CONTROLE: 'Contrôle',
  SYNTHESE: 'Synthèse',
  MAISON: 'Maison',
  REVISION: 'Révision',
};

const TYPE_ORDER = ['CONTROLE', 'SYNTHESE', 'MAISON', 'REVISION'];

export default function SidebarFilters({ facets, classes, resultCount }: SidebarFiltersProps) {
  const ctx = useDevoirsContext();
  const {
    classSlug, trimestre: activeTrimestre, subtype: activeSubtype, number: activeNumber,
    setClass, setTrimestre, setType, clearAll,
  } = ctx;

  // Default expanded sections (only Classe expanded by default per Etsy)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    classe: true,
    trimestre: true,
    type: true,
  });

  const toggle = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  // Group subtypes by type
  const subtypesByType: Record<string, Array<{ number: number; count: number }>> = {};
  for (const opt of facets.subtypes || []) {
    if (!subtypesByType[opt.subtype]) subtypesByType[opt.subtype] = [];
    subtypesByType[opt.subtype].push({ number: opt.number, count: opt.count });
  }

  const hasActiveFilters = classSlug || activeTrimestre || activeSubtype;

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <span className={styles.sidebarTitle}>Filtres</span>
        {hasActiveFilters && (
          <button onClick={() => { clearAll(); setClass(null); }} className={styles.sidebarReset}>
            Réinitialiser
          </button>
        )}
      </div>

      {/* CLASSE section */}
      <section className={styles.sidebarSection}>
        <button className={styles.sidebarSectionHead} onClick={() => toggle('classe')}>
          <span>Classe</span>
          <ChevronDown
            size={16}
            className={`${styles.sidebarChevron} ${expanded.classe ? styles.sidebarChevronOpen : ''}`}
          />
        </button>
        {expanded.classe && (
          <div className={styles.sidebarSectionBody}>
            <label className={styles.sidebarRadio}>
              <input
                type="radio"
                name="classe"
                checked={!classSlug}
                onChange={() => setClass(null)}
              />
              <span className={styles.sidebarRadioLabel}>Toutes les classes</span>
              <span className={styles.sidebarCount}>{facets.total}</span>
            </label>
            {classes.map((c) => (
              <label key={c.slug} className={styles.sidebarRadio}>
                <input
                  type="radio"
                  name="classe"
                  checked={classSlug === c.slug}
                  onChange={() => setClass(c.slug)}
                />
                <span className={styles.sidebarRadioLabel}>{c.labelFr}</span>
              </label>
            ))}
          </div>
        )}
      </section>

      {/* TRIMESTRE section */}
      <section className={styles.sidebarSection}>
        <button className={styles.sidebarSectionHead} onClick={() => toggle('trimestre')}>
          <span>Trimestre</span>
          <ChevronDown
            size={16}
            className={`${styles.sidebarChevron} ${expanded.trimestre ? styles.sidebarChevronOpen : ''}`}
          />
        </button>
        {expanded.trimestre && (
          <div className={styles.sidebarSectionBody}>
            <label className={styles.sidebarRadio}>
              <input
                type="radio"
                name="trimestre"
                checked={!activeTrimestre}
                onChange={() => setTrimestre(null)}
              />
              <span className={styles.sidebarRadioLabel}>Toute l'année</span>
              <span className={styles.sidebarCount}>{facets.total}</span>
            </label>
            {[1, 2, 3].map((t) => (
              <label key={t} className={styles.sidebarRadio}>
                <input
                  type="radio"
                  name="trimestre"
                  checked={activeTrimestre === String(t)}
                  onChange={() => setTrimestre(String(t))}
                />
                <span className={styles.sidebarRadioLabel}>T{t}</span>
                <span className={styles.sidebarCount}>{facets.trimestres[String(t)] || 0}</span>
              </label>
            ))}
          </div>
        )}
      </section>

      {/* TYPE section */}
      <section className={styles.sidebarSection}>
        <button className={styles.sidebarSectionHead} onClick={() => toggle('type')}>
          <span>Type de devoir</span>
          <ChevronDown
            size={16}
            className={`${styles.sidebarChevron} ${expanded.type ? styles.sidebarChevronOpen : ''}`}
          />
        </button>
        {expanded.type && (
          <div className={styles.sidebarSectionBody}>
            <label className={styles.sidebarRadio}>
              <input
                type="radio"
                name="subtype"
                checked={!activeSubtype}
                onChange={() => setType(null, null)}
              />
              <span className={styles.sidebarRadioLabel}>Tous types</span>
              <span className={styles.sidebarCount}>{facets.total}</span>
            </label>
            {TYPE_ORDER.filter((t) => subtypesByType[t]).map((subtype) => (
              <div key={subtype} style={{ marginBottom: '0.5rem' }}>
                <div className={styles.sidebarSubsectionLabel}>{SUBTYPE_LABELS[subtype] || subtype}</div>
                {subtypesByType[subtype].map((opt) => {
                  const isActive = activeSubtype === subtype && activeNumber === String(opt.number);
                  return (
                    <label key={`${subtype}-${opt.number}`} className={styles.sidebarRadio}>
                      <input
                        type="radio"
                        name="subtype"
                        checked={isActive}
                        onChange={() => setType(subtype, String(opt.number))}
                      />
                      <span className={styles.sidebarRadioLabel}>N°{opt.number}</span>
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
