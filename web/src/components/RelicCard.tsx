// ═══════════════════════════════════════════════════════════
//  RelicCard — Holy Relic card with Gold Flare + title glitch
//  Flare triggered by JS class toggle + void-reflow pattern.
// ═══════════════════════════════════════════════════════════
'use client';
import { useRef, useCallback } from 'react';
import type { RelicMeta } from '@/types/stickerverse';
import styles from './RelicCard.module.css';

interface RelicCardProps {
  relic: RelicMeta;
  onClick?: (relic: RelicMeta) => void;
}

export default function RelicCard({ relic, onClick }: RelicCardProps) {
  const cardRef  = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(() => {
    const card  = cardRef.current;
    const title = titleRef.current;
    if (!card || !title) return;

    // Gold Flare: remove → reflow → add → auto-cleanup
    card.classList.remove(styles.flaring);
    void card.offsetWidth; // force reflow
    card.classList.add(styles.flaring);

    title.classList.remove(styles.glitching);
    void title.offsetWidth;
    title.classList.add(styles.glitching);

    if (navigator.vibrate) navigator.vibrate([12, 18, 8, 14, 6, 22, 10, 16]);

    setTimeout(() => {
      card.classList.remove(styles.flaring);
      title.classList.remove(styles.glitching);
    }, 560);

    onClick?.(relic);
  }, [relic, onClick]);

  const tierColorClass = {
    ssr:  styles.tierSsr,
    sss:  styles.tierSss,
    sr:   styles.tierSr,
    r:    styles.tierR,
    myth: styles.tierMyth,
  }[relic.tier];

  return (
    <div
      ref={cardRef}
      className={styles.card}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && handleClick()}
      aria-label={`Relic: ${relic.title}`}
    >
      {relic.live && <span className={styles.badge}>LIVE</span>}

      <span className={styles.icon} aria-hidden="true">{relic.icon}</span>
      <span className={`${styles.tier} ${tierColorClass}`}>{relic.tierLabel}</span>

      <div ref={titleRef} className={styles.title}>{relic.title}</div>
      <p className={styles.roast}>{relic.roast}</p>
      <span className={styles.id}>{relic.id}</span>
    </div>
  );
}
