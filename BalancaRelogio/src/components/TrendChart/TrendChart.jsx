// Gráfico de tendência do peso: o peso de cada dia como ponto, a média móvel de 7 dias como linha,
// o peso-alvo como linha tracejada e as pesagens fora da curva como círculos vazados (ignorados na linha).
// SVG puro.
import { formatDate, formatNumber, formatTime } from '../../utils/format.js'
import styles from './TrendChart.module.css'

const WIDTH = 320
const HEIGHT = 170
const PAD_LEFT = 34
const PAD_RIGHT = 10
const PAD_TOP = 12
const PAD_BOTTOM = 26

/**
 * @param {object} props
 * @param {Array<{ timestamp: number, weightKg: number, average: number }>} props.series - de movingAverage(), um ponto por dia
 * @param {Array<{ timestamp: number, weightKg: number }>} [props.outliers] - pesagens fora da curva
 * @param {number | null} [props.targetKg]
 */
export default function TrendChart({ series, outliers = [], targetKg = null }) {
  if (series.length === 0) return null

  // Escalas: tempo no eixo X, peso no eixo Y (inclui o alvo; as fora da curva não esticam a escala).
  const values = series.flatMap((point) => [point.weightKg, point.average])
  if (targetKg != null) values.push(targetKg)
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (max - min < 1) {
    min -= 0.5
    max += 0.5
  }
  const times = [...series, ...outliers].map((point) => point.timestamp)
  const first = Math.min(...times)
  const last = Math.max(...times)
  // Tudo no mesmo dia: o eixo X mostra a hora em vez da data.
  const sameDay = new Date(first).toDateString() === new Date(last).toDateString()
  const formatAxis = sameDay ? formatTime : formatDate
  const xAt = (t) => (last === first ? (PAD_LEFT + WIDTH - PAD_RIGHT) / 2 : PAD_LEFT + ((t - first) / (last - first)) * (WIDTH - PAD_LEFT - PAD_RIGHT))
  const yAt = (v) => PAD_TOP + ((max - v) / (max - min)) * (HEIGHT - PAD_TOP - PAD_BOTTOM)

  // Linha da média móvel.
  const averagePath = series.map((p, i) => `${i ? 'L' : 'M'}${xAt(p.timestamp).toFixed(1)},${yAt(p.average).toFixed(1)}`).join(' ')

  return (
    <svg className={styles.chart} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Tendência do peso">
      {/* Eixo Y: maior e menor valor */}
      <text className={styles.axisLabel} x={2} y={PAD_TOP + 4}>
        {formatNumber(max, 1)}
      </text>
      <text className={styles.axisLabel} x={2} y={HEIGHT - PAD_BOTTOM}>
        {formatNumber(min, 1)}
      </text>
      <line className={styles.axis} x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={HEIGHT - PAD_BOTTOM} y2={HEIGHT - PAD_BOTTOM} />

      {/* Peso-alvo */}
      {targetKg != null && (
        <>
          <line className={styles.goal} x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={yAt(targetKg)} y2={yAt(targetKg)} />
          <text className={styles.goalLabel} x={WIDTH - PAD_RIGHT} y={yAt(targetKg) - 4} textAnchor="end">
            alvo {formatNumber(targetKg, 1)}
          </text>
        </>
      )}

      {/* Peso de cada dia e média móvel */}
      {series.map((p) => (
        <circle key={p.timestamp} className={styles.dot} cx={xAt(p.timestamp)} cy={yAt(p.weightKg)} r={2.5} />
      ))}
      {/* Fora da curva: na borda do gráfico quando passam da escala */}
      {outliers.map((p) => (
        <circle
          key={`o${p.timestamp}`}
          className={styles.outlier}
          cx={xAt(p.timestamp)}
          cy={yAt(Math.min(max, Math.max(min, p.weightKg)))}
          r={3.5}
        >
          <title>{`${formatNumber(p.weightKg, 2)} kg (fora da curva, ignorada)`}</title>
        </circle>
      ))}
      <path className={styles.line} d={averagePath} />

      {/* Eixo X: primeira e última data (ou hora, se tudo for do mesmo dia) */}
      <text className={styles.axisLabel} x={PAD_LEFT} y={HEIGHT - 8}>
        {formatAxis(first)}
      </text>
      <text className={styles.axisLabel} x={WIDTH - PAD_RIGHT} y={HEIGHT - 8} textAnchor="end">
        {formatAxis(last)}
      </text>
    </svg>
  )
}
