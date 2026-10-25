'use client';

import { Sparkles } from 'lucide-react';
import styles from './apex-cours.module.css';
import SubjectIcons from '@/components/shared/SubjectIcons';
import { useCoursContext } from './cours-context';

interface HeroProps {
  subject: { slug: string; nameFr: string; nameAr?: string };
  totalCount: number;
  classCount: number;
  trimesterCount: number;
  classes: { slug: string; labelFr: string }[];
  activeClass: string | null;
  activeCycle?: string | null;
  type?: 'Devoirs' | 'Cours' | 'Séries';
}

/**
 * 2026-10-25: singulier des libellés de stats.
 * « 1 DEVOIRS » / « 1 CLASSES » / « 1 TRIMESTRES » étaient affichés tel quel.
 * "Cours" est INVARIABLE en français → on ne retire pas le « s ».
 */
const SINGULAR_LABELS: Record<string, string> = {
  Devoirs: 'Devoir',
  Cours: 'Cours',
  'Séries': 'Série',
};

export default function ApexHero({
  subject,
  totalCount,
  classCount,
  trimesterCount,
  classes,
  activeClass,
  activeCycle,
  type = 'Cours',
}: HeroProps) {
  const ctx = useCoursContext();
  const cycle = ctx.cycle ?? activeCycle ?? null;
  const cycleLabel = cycle === 'college' ? 'Collège (7-9ème)' : cycle === 'lycee' ? 'Lycée (1-4AS)' : null;

  return (
    <section className={styles.hero}>
      <SubjectIcons slug={subject.slug} />
      <div className={styles.aurora} aria-hidden="true" />

      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div className={styles.heroBadge}>
          <Sparkles size={12} />
          Mis à jour quotidiennement · {totalCount.toLocaleString('fr-FR')}{' '}
          {totalCount > 1 ? 'ressources' : 'ressource'}
          {cycleLabel && (
            <span style={{ marginLeft: '0.75rem', padding: '0.125rem 0.5rem', background: 'rgba(255,255,255,0.2)', borderRadius: '6px', fontSize: '11px' }}>
              {cycleLabel}
            </span>
          )}
        </div>

        <h1 className={styles.heroTitle}>
          <span className={styles.heroTitleAccent}>{type}</span>
          {subject.nameFr}
        </h1>

        <p className={styles.heroSub}>
          {cycleLabel
            ? <>{type} de <strong>{subject.nameFr}</strong> au <strong>{cycleLabel}</strong> — conformes au programme officiel tunisien.</>
            : <>Tous les {type.toLowerCase()} de {subject.nameFr} du programme officiel tunisien — par classe, par trimestre, par type. PDFs gratuits, téléchargeables directement.</>}
        </p>

        <div className={styles.heroStats}>
          <div className={styles.heroStat}>
            <div className={styles.heroStatValue}>{totalCount.toLocaleString('fr-FR')}</div>
            <div className={styles.heroStatLabel}>
              {totalCount > 1 ? type : SINGULAR_LABELS[type] || type}
            </div>
          </div>
          <div className={styles.heroStat}>
            <div className={styles.heroStatValue}>{classCount}</div>
            <div className={styles.heroStatLabel}>{classCount > 1 ? 'Classes' : 'Classe'}</div>
          </div>
          <div className={styles.heroStat}>
            <div className={styles.heroStatValue}>{trimesterCount}</div>
            <div className={styles.heroStatLabel}>
              {trimesterCount > 1 ? 'Trimestres' : 'Trimestre'}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
