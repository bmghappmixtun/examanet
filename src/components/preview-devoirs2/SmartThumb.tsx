'use client';

import { useState } from 'react';
import styles from './apex-devoirs.module.css';
import { BookOpen, FileText } from 'lucide-react';

interface SmartThumbProps {
  src?: string | null;
  alt?: string;
  type?: string;  // 'CONTROLE', 'SYNTHESE', etc.
  homeworkNumber?: number | null;
  className?: string;
  large?: boolean;
}

/**
 * SmartThumb — loads src, hides on error, shows subject-tinted fallback.
 */
export default function SmartThumb({ src, alt = '', type, homeworkNumber, className = '', large = false }: SmartThumbProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // If no src or already failed, render fallback
  if (!src || failed) {
    return (
      <div className={`${styles.bentoThumb} ${styles.thumbFallback} ${large ? styles.thumbFallbackLarge : ''} ${className}`}>
        <div className={styles.thumbFallbackInner}>
          {type === 'CONTROLE' || type === 'SYNTHESE' ? (
            <BookOpen size={large ? 48 : 28} />
          ) : (
            <FileText size={large ? 48 : 28} />
          )}
          {homeworkNumber != null && (
            <span className={styles.thumbBadge}>N°{homeworkNumber}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.bentoThumb} ${className}`}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        onLoad={() => setLoaded(true)}
        style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.3s' }}
      />
    </div>
  );
}
