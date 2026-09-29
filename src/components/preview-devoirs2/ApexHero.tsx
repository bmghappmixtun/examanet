'use client';

import { useEffect, useRef } from 'react';
import { Search, Sparkles } from 'lucide-react';
import styles from './apex-devoirs.module.css';
import { useDevoirsContext } from './devoirs-context';

interface HeroProps {
  subject: { slug: string; nameFr: string; nameAr?: string };
  totalCount: number;
  classCount: number;
  trimesterCount: number;
  featured: Array<{
    id: string;
    title: string;
    thumbnailUrl?: string | null;
    class: { slug: string; nameFr: string } | null;
    teacher: { firstName: string | null; lastName: string | null } | null;
    homeworkNumber: number | null;
    trimester: string | number | null;
  }>;
  classes: { slug: string; labelFr: string }[];
  activeClass: string | null;
}

export default function ApexHero({
  subject,
  totalCount,
  classCount,
  trimesterCount,
  featured,
  classes,
  activeClass,
}: HeroProps) {
  const ctx = useDevoirsContext();
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd+K / Ctrl+K — dispatch custom event (parent listens)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('devoirs-palette-open'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <section className={styles.hero}>
      <div className={styles.aurora} aria-hidden="true" />

      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div className={styles.heroBadge}>
          <Sparkles size={12} />
          Mis à jour quotidiennement · {totalCount.toLocaleString('fr-FR')} ressources
        </div>

        <h1 className={styles.heroTitle}>
          <span className={styles.heroTitleAccent}>Devoirs</span>
          {subject.nameFr}
        </h1>

        <p className={styles.heroSub}>
          Tous les devoirs de {subject.nameFr} du programme officiel tunisien — par classe,
          par trimestre, par type. PDFs gratuits, téléchargeables directement.
        </p>

        <div className={styles.heroStats}>
          <div className={styles.heroStat}>
            <div className={styles.heroStatValue}>{totalCount.toLocaleString('fr-FR')}</div>
            <div className={styles.heroStatLabel}>Devoirs</div>
          </div>
          <div className={styles.heroStat}>
            <div className={styles.heroStatValue}>{classCount}</div>
            <div className={styles.heroStatLabel}>Classes</div>
          </div>
          <div className={styles.heroStat}>
            <div className={styles.heroStatValue}>{trimesterCount}</div>
            <div className={styles.heroStatLabel}>Trimestres</div>
          </div>
        </div>

        <div className={styles.searchWrap}>
          <Search className={styles.searchIcon} size={20} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Rechercher un devoir, un thème, une année..."
            onKeyDown={(e) => {
              if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('devoirs-palette-open'));
              }
            }}
            className={styles.searchInput}
          />
          <kbd className={styles.searchHint}>⌘K</kbd>
        </div>

        <div className={styles.classChips} role="tablist">
          <button
            type="button"
            onClick={() => ctx.setClass(null)}
            className={`${styles.classChip} ${activeClass === null ? styles.active : ''}`}
          >
            Toutes <span className={styles.classChipCount}>({totalCount.toLocaleString('fr-FR')})</span>
          </button>
          {classes.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => ctx.setClass(c.slug)}
              className={`${styles.classChip} ${activeClass === c.slug ? styles.active : ''}`}
            >
              {c.labelFr}
            </button>
          ))}
        </div>

        {featured.length > 0 && (
          <div className={styles.featured}>
            {featured.slice(0, 3).map((card, idx) => (
              <a
                key={card.id}
                href={`/fr/ressources/${card.id}`}
                className={styles.featuredCard}
              >
                {card.thumbnailUrl && (
                  <img
                    src={card.thumbnailUrl}
                    alt=""
                    loading={idx < 2 ? 'eager' : 'lazy'}
                    decoding="async"
                    className={styles.featuredImg}
                  />
                )}
                <div className={styles.featuredOverlay}>
                  <div className={styles.featuredTag}>Nouveau</div>
                  <div className={styles.featuredTitle}>{card.title}</div>
                  <div className={styles.featuredMeta}>
                    {card.class?.nameFr} · Contrôle N°{card.homeworkNumber ?? '?'} · T{card.trimester ?? '?'}
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
