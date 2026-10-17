// Gráfico do sono por noite (barras empilhadas): profundo, leve e acordado, de baixo para cima.
// Noites sem fases (vindas do Health Connect, ex.: registro manual no Samsung Health) aparecem numa cor só.
// Mostra a linha da meta, as horas no eixo e a média. SVG puro; as cores vêm do CSS.
import { formatDayMonth, formatMinutes } from '../../utils/format.js'
import styles from './SleepChart.module.css'

const WIDTH = 320
const HEIGHT = 170
const PAD_TOP = 10
const PAD_BOTTOM = 22
const PAD_LEFT = 24 // rótulos das horas
const PAD_RIGHT = 4
const HOUR = 60

/**
 * @param {object} props
 * @param {Array<{ day: number, night: object | null }>} props.days - de sleepByDay()
 * @param {number | null} [props.goalMinutes] - meta de sono (min)
 * @param {number | null} [props.averageMinutes] - média das noites (min)
 */
export default function SleepChart({ days, goalMinutes = null, averageMinutes = null }) {
  if (!days.some((day) => day.night)) return null

  // Escala: pelo menos 8 h, arredondada para cima em blocos de 2 h.
  const longest = Math.max(...days.map((day) => (day.night ? day.night.asleepMinutes + (day.night.awakeMinutes ?? 0) : 0)))
  const maxMinutes = Math.ceil(Math.max(longest, goalMinutes ?? 0, 8 * HOUR) / (2 * HOUR)) * 2 * HOUR
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM
  const unit = plotHeight / maxMinutes
  const baseY = HEIGHT - PAD_BOTTOM
  const slot = (WIDTH - PAD_LEFT - PAD_RIGHT) / days.length
  const barWidth = Math.max(4, slot * 0.65)
  const labelEvery = days.length > 7 ? 2 : 1
  const gridHours = Array.from({ length: maxMinutes / (2 * HOUR) }, (_, i) => (i + 1) * 2)
  const hasUnknown = days.some((day) => day.night && day.night.deepMinutes == null)

  return (
    <figure className={styles.figure}>
      <svg className={styles.chart} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Sono por noite: profundo, leve e acordado">
        {/* Linhas das horas (2 h, 4 h, …) */}
        {gridHours.map((hours) => {
          const y = baseY - hours * HOUR * unit
          return (
            <g key={hours}>
              <line className={styles.grid} x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={y} y2={y} />
              <text className={styles.label} x={PAD_LEFT - 4} y={y + 3} textAnchor="end">
                {hours}h
              </text>
            </g>
          )
        })}

        {days.map((day, i) => {
          const x = PAD_LEFT + i * slot + (slot - barWidth) / 2
          const night = day.night
          let bars = null
          if (night && night.deepMinutes != null) {
            // Com fases: profundo embaixo, depois leve e acordado.
            const deepH = night.deepMinutes * unit
            const lightH = (night.lightMinutes ?? 0) * unit
            const awakeH = (night.awakeMinutes ?? 0) * unit
            bars = (
              <>
                <rect className={styles.deep} x={x} y={baseY - deepH} width={barWidth} height={deepH} />
                <rect className={styles.light} x={x} y={baseY - deepH - lightH} width={barWidth} height={lightH} />
                <rect className={styles.awake} x={x} y={baseY - deepH - lightH - awakeH} width={barWidth} height={awakeH} />
              </>
            )
          } else if (night) {
            // Sem fases (Health Connect): só o total.
            const totalH = night.asleepMinutes * unit
            bars = <rect className={styles.unknown} x={x} y={baseY - totalH} width={barWidth} height={totalH} />
          }
          return (
            <g key={day.day}>
              {night && (
                <title>
                  {`${formatDayMonth(day.day)}: dormiu ${formatMinutes(night.asleepMinutes)}` +
                    (night.deepMinutes != null
                      ? ` (profundo ${formatMinutes(night.deepMinutes)}, leve ${formatMinutes(night.lightMinutes)}, acordado ${formatMinutes(night.awakeMinutes)})`
                      : ' (Health Connect, sem fases)')}
                </title>
              )}
              {bars}
              {i % labelEvery === (days.length - 1) % labelEvery && (
                <text className={styles.label} x={x + barWidth / 2} y={HEIGHT - 6} textAnchor="middle">
                  {formatDayMonth(day.day)}
                </text>
              )}
            </g>
          )
        })}

        {/* Meta de sono */}
        {goalMinutes && (
          <line className={styles.goal} x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={baseY - goalMinutes * unit} y2={baseY - goalMinutes * unit} />
        )}
        <line className={styles.axis} x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={baseY} y2={baseY} />
      </svg>
      <figcaption className={styles.legend}>
        <span className={`${styles.swatch} ${styles.swatchDeep}`} /> profundo
        <span className={`${styles.swatch} ${styles.swatchLight}`} /> leve
        <span className={`${styles.swatch} ${styles.swatchAwake}`} /> acordado
        {hasUnknown && (
          <>
            <span className={`${styles.swatch} ${styles.swatchUnknown}`} /> sem fases
          </>
        )}
        {goalMinutes && (
          <>
            <span className={styles.swatchGoal} /> meta {formatMinutes(goalMinutes)}
          </>
        )}
      </figcaption>
      {averageMinutes != null && <p className={styles.average}>Média das noites registradas: {formatMinutes(averageMinutes)}</p>}
    </figure>
  )
}
