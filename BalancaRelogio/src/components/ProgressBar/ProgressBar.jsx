// Barra de progresso em SVG (sem estilo inline): ex.: passos de hoje em relação à meta.
import styles from './ProgressBar.module.css'

/**
 * @param {object} props
 * @param {number} props.value
 * @param {number} props.max
 * @param {string} props.label - descrição para leitores de tela
 */
export default function ProgressBar({ value, max, label }) {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <svg
      className={styles.bar}
      viewBox="0 0 100 8"
      preserveAspectRatio="none"
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <rect className={styles.track} x="0" y="0" width="100" height="8" rx="4" />
      <rect className={percent >= 100 ? styles.done : styles.fill} x="0" y="0" width={percent} height="8" rx="4" />
    </svg>
  )
}
