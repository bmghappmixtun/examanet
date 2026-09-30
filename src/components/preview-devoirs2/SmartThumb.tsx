'use client';

import { useState } from 'react';
import styles from './apex-devoirs.module.css';
import { BookOpen, FileText } from 'lucide-react';

interface SmartThumbProps {
  src?: string | null;
  alt?: string;
  type?: string;
  homeworkNumber?: number | null;
  className?: string;
  large?: boolean;
}

/**
 * SmartThumb — loads src, hides on error, shows subject-tinted gradient fallback.
 * Compact mode (default): thin horizontal banner — saves vertical space for body content.
 */
export default function SmartThumb({ src, alt = '', type, homeworkNumber, className = '', large = false }: SmartThumbProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // If no src or already failed, render compact gradient fallback
  if (!src || failed) {
    const isControle = type === 'CONTROLE' || type === 'SYNTHESE';
    return (
      <div className={`${styles.bentoThumb} ${styles.bentoThumbCompact} ${styles.thumbFallback} ${className}`}>
        <div className={styles.thumbFallbackInner}>
          {isControle ? (
            <BookOpen size={14} />
          ) : (
            <FileText size={14} />
          )}
          {homeworkNumber != null && (
            <span className={styles.thumbBadge}>N°{homeworkNumber}</span>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <span className={styles.thumbBadge} style={{ background: 'rgba(240, 143, 69, 0.12)', color: '#9a3412', borderColor: 'rgba(240, 143, 69, 0.25)' }}>
          {isControle ? type === 'CONTROLE' ? 'Contrôle' : 'Synthèse' : type === 'MAISON' ? 'Maison' : type === 'REVISION' ? 'Révision' : 'Devoir'}
        </span>
      </div>
    );
  }

  return (
    <div className={`${styles.bentoThumb} ${styles.bentoThumbCompact} ${className}`}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        onLoad={() => setLoaded(true)}
        style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.3s', position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
    </div>
  );
}
