import { motion } from 'framer-motion';

interface ProgressRingProps {
  /** 0 to 1. */
  fraction: number;
  color: string;
  label: string;
  /** Raw numbers for assistive tech, e.g. tasks done out of total. */
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  /** A brief brighter, slower fill, for the moment something finishes. */
  isGlowing?: boolean;
}

/** A circular progress meter: a faint track with an arc-colored stroke drawn clockwise from the top. */
export function ProgressRing({ fraction, color, label, value, max, size = 28, stroke = 3, isGlowing = false }: ProgressRingProps) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label} width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} style={{ stroke: 'var(--border-subtle)' }} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={false}
        animate={{ strokeDashoffset: circumference * (1 - fraction), filter: isGlowing ? 'brightness(1.4)' : 'brightness(1)' }}
        transition={{ duration: isGlowing ? 0.45 : 0.25, ease: 'easeOut' }}
        style={{ stroke: color }}
      />
    </svg>
  );
}
