// Registro rápido da água: total de hoje × meta, barra de progresso e botões de copo (+ desfazer).
// Usado na tela inicial e em Dieta → Água.
import ProgressBar from '../ProgressBar/ProgressBar.jsx'
import ui from '../../styles/controls.module.css'
import { GLASS_SIZES, formatWater } from '../../water/water.js'
import styles from './WaterQuickAdd.module.css'

/**
 * @param {object} props
 * @param {ReturnType<typeof import('../../hooks/useWater.js').useWater>} props.water
 */
export default function WaterQuickAdd({ water }) {
  const { todayMl, goal, drinks } = water
  const last = drinks.at(-1)
  const remaining = Math.max(0, goal.goalMl - todayMl)

  return (
    <div>
      <p className={styles.total}>
        {formatWater(todayMl)} <span className={styles.goal}>de {formatWater(goal.goalMl)}</span>
      </p>
      <ProgressBar value={todayMl} max={goal.goalMl} label={`Água: ${formatWater(todayMl)} de ${formatWater(goal.goalMl)}`} />
      <p className={ui.hint}>{remaining ? `Faltam ${formatWater(remaining)} para a meta.` : 'Meta de hoje alcançada! 💧'}</p>
      <div className={styles.buttons}>
        {GLASS_SIZES.map((ml) => (
          <button key={ml} type="button" className={`${ui.button} ${ui.buttonPrimary}`} onClick={() => water.add(ml)}>
            + {formatWater(ml)}
          </button>
        ))}
        {last && (
          <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={() => water.remove(last)}>
            Desfazer
          </button>
        )}
      </div>
    </div>
  )
}
