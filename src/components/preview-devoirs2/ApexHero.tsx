'use client';

import { Sparkles } from 'lucide-react';
import styles from './apex-devoirs.module.css';
import SubjectIcons from './SubjectIcons';
import { useDevoirsContext } from './devoirs-context';

interface HeroProps {
  subject: { slug: string; nameFr: string; nameAr?: string };
  totalCount: number;
  classCount: number;
  trimesterCount: number;
  classes: { slug: string; labelFr: string }[];
  activeClass: string | null;
  activeCycle?: string | null;
}

export default function ApexHero({
  subject,
  totalCount,
  classCount,
  trimesterCount,
  classes,
  activeClass,
  activeCycle,
}: HeroProps) {
  const ctx = useDevoirsContext();
  const cycle = ctx.cycle ?? activeCycle ?? null;
  const cycleLabel = cycle === 'college' ? 'Collège (7-9ème)' : cycle === 'lycee' ? 'Lycée (1-4AS)' : null;

  return (
    <section className={styles.hero}>
      <SubjectIcons />
      <div className={styles.aurora} aria-hidden="true" />

      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div className={styles.heroBadge}>
          <Sparkles size={12} />
          Mis à jour quotidiennement · {totalCount.toLocaleString('fr-FR')} ressources
          {cycleLabel && (
            <span style={{ marginLeft: '0.75rem', padding: '0.125rem 0.5rem', background: 'rgba(255,255,255,0.2)', borderRadius: '6px', fontSize: '11px' }}>
              {cycleLabel}
            </span>
          )}
        </div>

        <h1 className={styles.heroTitle}>
          <span className={styles.heroTitleAccent}>Devoirs</span>
          {subject.nameFr}
        </h1>

        <p className={styles.heroSub}>
          {cycleLabel
            ? <>Devoirs de <strong>{subject.nameFr}</strong> au <strong>{cycleLabel}</strong> — conformes au programme officiel tunisien.</>
            : <>Tous les devoirs de {subject.nameFr} du programme officiel tunisien — par classe, par trimestre, par type. PDFs gratuits, téléchargeables directement.</>}
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
      </div>
    </section>
  );
}
