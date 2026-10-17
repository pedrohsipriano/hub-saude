// Gráfico da dieta por dia (barras empilhadas): refeições feitas (verde), fora do plano (laranja)
// e sem registro (cinza). SVG puro; as cores vêm do CSS.
import { formatDayMonth } from '../../utils/format.js'
import styles from './AdherenceChart.module.css'

const WIDTH = 320
const HEIGHT = 150
const PAD_TOP = 8
const PAD_BOTTOM = 22
const PAD_X = 4

/**
 * @param {object} props
 * @param {Array<{ day: number, planned: number, done: number, off: number, missing: number }>} props.days - de dailyAdherence()
 */
export default function AdherenceChart({ days }) {
  if (!days.length) return null
  const maxPlanned = Math.max(...days.map((day) => day.planned), 1)
  const slot = (WIDTH - PAD_X * 2) / days.length
  const barWidth = Math.max(4, slot * 0.7)
  const unit = (HEIGHT - PAD_TOP - PAD_BOTTOM) / maxPlanned
  const baseY = HEIGHT - PAD_BOTTOM
  // Rótulo de data a cada 2 dias quando há muitos dias.
  const labelEvery = days.length > 7 ? 2 : 1

  return (
    <figure className={styles.figure}>
      <svg className={styles.chart} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Refeições por dia: feitas, fora do plano e sem registro">
        {days.map((day, i) => {
          const x = PAD_X + i * slot + (slot - barWidth) / 2
          // Empilha de baixo para cima: feitas, fora do plano, sem registro.
          const doneH = day.done * unit
          const offH = day.off * unit
          const missingH = day.missing * unit
          return (
            <g key={day.day}>
              <title>{`${formatDayMonth(day.day)}: ${day.done} feitas, ${day.off} fora do plano, ${day.missing} sem registro`}</title>
              <rect className={styles.done} x={x} y={baseY - doneH} width={barWidth} height={doneH} />
              <rect className={styles.off} x={x} y={baseY - doneH - offH} width={barWidth} height={offH} />
              <rect className={styles.missing} x={x} y={baseY - doneH - offH - missingH} width={barWidth} height={missingH} />
              {i % labelEvery === 0 && (
                <text className={styles.label} x={x + barWidth / 2} y={HEIGHT - 6} textAnchor="middle">
                  {formatDayMonth(day.day)}
                </text>
              )}
            </g>
          )
        })}
        <line className={styles.axis} x1={PAD_X} x2={WIDTH - PAD_X} y1={baseY} y2={baseY} />
      </svg>
      <figcaption className={styles.legend}>
        <span className={`${styles.swatch} ${styles.swatchDone}`} /> feitas
        <span className={`${styles.swatch} ${styles.swatchOff}`} /> fora do plano
        <span className={`${styles.swatch} ${styles.swatchMissing}`} /> sem registro
      </figcaption>
    </figure>
  )
}
