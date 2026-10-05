'use client';

import { Sparkles } from 'lucide-react';
import styles from './apex-cours.module.css';
import SubjectIcons from './SubjectIcons';
import { useCoursContext } from './cours-context';

interface HeroProps {
  subject: { slug: string; nameFr: string; nameAr?: string };
  totalCount: number;
  classCount: number;
  trimesterCount: number;
  classes: { slug: string; labelFr: string }[];
  activeClass: string | null;
}

export default function ApexHero({
  subject,
  totalCount,
  classCount,
  trimesterCount,
  classes,
  activeClass,
}: HeroProps) {
  const ctx = useCoursContext();

  return (
    <section className={styles.hero}>
      <SubjectIcons />
      <div className={styles.aurora} aria-hidden="true" />

      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div className={styles.heroBadge}>
          <Sparkles size={12} />
          Mis à jour quotidiennement · {totalCount.toLocaleString('fr-FR')} ressources
        </div>

        <h1 className={styles.heroTitle}>
          <span className={styles.heroTitleAccent}>Cours</span>
          {subject.nameFr}
        </h1>

        <p className={styles.heroSub}>
          Tous les cours de {subject.nameFr} du programme officiel tunisien — par classe,
          par trimestre, par type. PDFs gratuits, téléchargeables directement.
        </p>

        <div className={styles.heroStats}>
          <div className={styles.heroStat}>
            <div className={styles.heroStatValue}>{totalCount.toLocaleString('fr-FR')}</div>
            <div className={styles.heroStatLabel}>Cours</div>
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
