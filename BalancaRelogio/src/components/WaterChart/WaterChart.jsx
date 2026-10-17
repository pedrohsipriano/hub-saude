// Gráfico da água dos últimos dias: uma barra por dia e a meta como linha tracejada. SVG puro.
import { formatDayMonth } from '../../utils/format.js'
import { formatWater } from '../../water/water.js'
import styles from './WaterChart.module.css'

const WIDTH = 320
const HEIGHT = 140
const PAD_TOP = 14
const PAD_BOTTOM = 22
const PAD_X = 4

/**
 * @param {object} props
 * @param {Array<{ day: number, totalMl: number }>} props.days
 * @param {number} props.goalMl
 */
export default function WaterChart({ days, goalMl }) {
  const max = Math.max(goalMl, ...days.map((day) => day.totalMl), 1)
  const slot = (WIDTH - PAD_X * 2) / days.length
  const barWidth = slot * 0.6
  const baseY = HEIGHT - PAD_BOTTOM
  const yAt = (ml) => baseY - (ml / max) * (baseY - PAD_TOP)

  return (
    <svg className={styles.chart} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Água por dia em relação à meta">
      {days.map((day, i) => {
        const x = PAD_X + i * slot + (slot - barWidth) / 2
        const reached = day.totalMl >= goalMl
        return (
          <g key={day.day}>
            <title>{`${formatDayMonth(day.day)}: ${formatWater(day.totalMl)}`}</title>
            <rect className={reached ? styles.barReached : styles.bar} x={x} y={yAt(day.totalMl)} width={barWidth} height={baseY - yAt(day.totalMl)} rx={3} />
            <text className={styles.label} x={x + barWidth / 2} y={HEIGHT - 6} textAnchor="middle">
              {formatDayMonth(day.day)}
            </text>
          </g>
        )
      })}
      <line className={styles.goal} x1={PAD_X} x2={WIDTH - PAD_X} y1={yAt(goalMl)} y2={yAt(goalMl)} />
      <text className={styles.goalLabel} x={WIDTH - PAD_X} y={yAt(goalMl) - 3} textAnchor="end">
        meta {formatWater(goalMl)}
      </text>
    </svg>
  )
}
