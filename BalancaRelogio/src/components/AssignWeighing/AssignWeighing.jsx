// Cartão "De quem é esta pesagem?": aparece quando a balança é usada por mais de uma pessoa
// e o app não tem certeza de quem subiu.
import ui from '../../styles/controls.module.css'
import { formatNumber } from '../../utils/format.js'
import styles from './AssignWeighing.module.css'

/**
 * @param {object} props
 * @param {{ reading: object, candidates: Array<{ userId: string, name?: string, distanceKg: number | null }> }} props.pending
 * @param {(userId: string) => void} props.onConfirm
 * @param {() => void} props.onDismiss
 */
export default function AssignWeighing({ pending, onConfirm, onDismiss }) {
  return (
    <div className={`${ui.card} ${styles.assign}`} role="alert">
      <h3 className={ui.cardTitle}>De quem é esta pesagem de {formatNumber(pending.reading.weightKg, 2)} kg?</h3>
      <div className={ui.actions}>
        {pending.candidates.map((candidate) => (
          <button
            key={candidate.userId}
            type="button"
            className={`${ui.button} ${ui.buttonPrimary}`}
            onClick={() => onConfirm(candidate.userId)}
          >
            {candidate.name || 'Sem nome'}
            {candidate.distanceKg != null && ` (±${formatNumber(candidate.distanceKg, 1)} kg)`}
          </button>
        ))}
        <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={onDismiss}>
          Descartar
        </button>
      </div>
      <p className={ui.hint}>Entre parênteses: diferença para o último peso de cada pessoa.</p>
    </div>
  )
}
