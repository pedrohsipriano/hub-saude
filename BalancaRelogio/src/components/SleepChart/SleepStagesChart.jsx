// Fases de uma noite ao longo do tempo (hipnograma): acordado em cima, leve no meio e profundo embaixo,
// do horário em que pegou no sono até o de acordar. As fases vêm da cópia local das noites do relógio
// (devices/watch/sleepBackup.js). SVG puro; as cores vêm do CSS.
import { SLEEP_STAGE } from '../../devices/watch/njjProtocol.js'
import { formatMinutes, formatTime } from '../../utils/format.js'
import styles from './SleepChart.module.css'

const WIDTH = 320
const HEIGHT = 112
const PAD_LEFT = 58 // nomes das faixas
const PAD_RIGHT = 6
const PAD_TOP = 4
const PAD_BOTTOM = 18
const HOUR_MS = 3600000

// Faixas, de cima para baixo.
const LANES = [
  { stage: SLEEP_STAGE.AWAKE, label: 'Acordado', className: 'awake' },
  { stage: SLEEP_STAGE.LIGHT, label: 'Leve', className: 'light' },
  { stage: SLEEP_STAGE.DEEP, label: 'Profundo', className: 'deep' },
]

/**
 * @param {object} props
 * @param {{ startMs: number, endMs: number, stages: Array<{ stage: number, minutes: number, startMs: number }> }} props.night
 */
export default function SleepStagesChart({ night }) {
  if (!night?.stages?.length || !(night.endMs > night.startMs)) return null
  const laneHeight = (HEIGHT - PAD_TOP - PAD_BOTTOM) / LANES.length
  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT
  const x = (ms) => PAD_LEFT + ((Math.min(Math.max(ms, night.startMs), night.endMs) - night.startMs) / (night.endMs - night.startMs)) * plotWidth

  // Marcas de hora cheia entre o início e o fim (a cada 2 h quando a noite é longa).
  const firstHour = Math.ceil(night.startMs / HOUR_MS) * HOUR_MS
  const step = night.endMs - night.startMs > 6 * HOUR_MS ? 2 * HOUR_MS : HOUR_MS
  const ticks = []
  for (let t = firstHour; t < night.endMs; t += step) ticks.push(t)

  return (
    <figure className={styles.figure}>
      <svg className={styles.chart} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Fases do sono ao longo da noite">
        {LANES.map((lane, i) => (
          <text key={lane.stage} className={styles.label} x={PAD_LEFT - 6} y={PAD_TOP + laneHeight * i + laneHeight / 2 + 3} textAnchor="end">
            {lane.label}
          </text>
        ))}
        {ticks.map((t) => (
          <g key={t}>
            <line className={styles.grid} x1={x(t)} x2={x(t)} y1={PAD_TOP} y2={HEIGHT - PAD_BOTTOM} />
            <text className={styles.label} x={x(t)} y={HEIGHT - 5} textAnchor="middle">
              {formatTime(t)}
            </text>
          </g>
        ))}
        {night.stages.map((entry) => {
          const laneIndex = LANES.findIndex((lane) => lane.stage === entry.stage)
          if (laneIndex < 0) return null
          const left = x(entry.startMs)
          const right = x(entry.startMs + entry.minutes * 60000)
          return (
            <rect
              key={entry.startMs}
              className={styles[LANES[laneIndex].className]}
              x={left}
              y={PAD_TOP + laneHeight * laneIndex + 2}
              width={Math.max(1, right - left)}
              height={laneHeight - 4}
              rx={2}
            >
              <title>{`${LANES[laneIndex].label}: ${formatTime(entry.startMs)}, ${formatMinutes(entry.minutes)}`}</title>
            </rect>
          )
        })}
        <line className={styles.axis} x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={HEIGHT - PAD_BOTTOM} y2={HEIGHT - PAD_BOTTOM} />
      </svg>
      <p className={styles.average}>
        Fases da noite: {formatTime(night.startMs)} → {formatTime(night.endMs)}
      </p>
    </figure>
  )
}
