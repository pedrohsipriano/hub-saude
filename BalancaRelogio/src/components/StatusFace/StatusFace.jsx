// Carinha de status (como no relatório de referência): sorri nas faixas boas,
// fica neutra nas de atenção e triste na faixa de risco.
import { toneClassName } from '../../utils/format.js'
import styles from './StatusFace.module.css'

// Formato da boca por tom.
const MOUTH = {
  good: 'M7,13.5 Q12,18 17,13.5',
  excellent: 'M7,13.5 Q12,18 17,13.5',
  low: 'M7.5,15 L16.5,15',
  high: 'M7.5,15 L16.5,15',
  danger: 'M7,17 Q12,12.5 17,17',
}

/**
 * @param {object} props
 * @param {string} props.tone - tom da faixa ('low', 'good', 'excellent', 'high', 'danger')
 */
export default function StatusFace({ tone }) {
  return (
    <svg className={`${styles.face} ${styles[toneClassName(tone)]}`} viewBox="0 0 24 24" aria-hidden="true">
      <circle className={styles.head} cx="12" cy="12" r="11" />
      <circle className={styles.eye} cx="8.5" cy="9.5" r="1.4" />
      <circle className={styles.eye} cx="15.5" cy="9.5" r="1.4" />
      <path className={styles.mouth} d={MOUTH[tone]} />
    </svg>
  )
}
