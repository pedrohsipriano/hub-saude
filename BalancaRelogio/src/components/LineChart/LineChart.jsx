// Gráfico de linha em SVG com a evolução de uma métrica (valor em cada ponto e data no eixo).
// SVG puro: fica nítido na tela e vetorial no PDF, sem biblioteca de gráficos.
import { formatDate, formatNumber } from '../../utils/format.js'
import styles from './LineChart.module.css'

// Dimensões internas do desenho (o SVG escala para a largura disponível).
const WIDTH = 320
const HEIGHT = 150
const PAD_X = 34
const PAD_TOP = 26
const PAD_BOTTOM = 32

/**
 * @param {object} props
 * @param {Array<{ timestamp: number, value: number }>} props.points - em ordem cronológica
 * @param {number} [props.decimals] - casas decimais dos rótulos
 * @param {string} props.label - nome da métrica (acessibilidade)
 * @param {(timestamp: number) => string} [props.formatLabel] - texto do eixo (padrão: data)
 * @param {boolean} [props.showValues] - mostra o valor em cada ponto
 * @param {number} [props.labelEvery] - escreve o eixo a cada N pontos (gráficos com muitos pontos)
 */
export default function LineChart({ points, decimals = 1, label, formatLabel = formatDate, showValues = true, labelEvery = 1 }) {
  if (!points.length) return null

  // Escala vertical: do menor ao maior valor (com folga quando todos são iguais).
  const values = points.map((point) => point.value)
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (max - min < 1e-9) {
    min -= 1
    max += 1
  }

  // Posição de cada ponto no desenho.
  const xAt = (index) =>
    points.length === 1 ? WIDTH / 2 : PAD_X + (index * (WIDTH - 2 * PAD_X)) / (points.length - 1)
  const yAt = (value) => PAD_TOP + ((max - value) / (max - min)) * (HEIGHT - PAD_TOP - PAD_BOTTOM)

  // Linha ligando os pontos.
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${xAt(index).toFixed(1)},${yAt(point.value).toFixed(1)}`)
    .join(' ')

  return (
    <svg className={styles.chart} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Evolução de ${label}`}>
      <line className={styles.axis} x1={0} x2={WIDTH} y1={HEIGHT - PAD_BOTTOM + 8} y2={HEIGHT - PAD_BOTTOM + 8} />
      <path className={styles.line} d={path} />
      {points.map((point, index) => (
        <g key={point.timestamp}>
          <circle className={styles.dot} cx={xAt(index)} cy={yAt(point.value)} r={showValues ? 3.5 : 2} />
          {showValues && (
            <text className={styles.value} x={xAt(index)} y={yAt(point.value) - 9} textAnchor="middle">
              {formatNumber(point.value, decimals)}
            </text>
          )}
          {index % labelEvery === 0 && (
            <text className={styles.date} x={xAt(index)} y={HEIGHT - 8} textAnchor="middle">
              {formatLabel(point.timestamp)}
            </text>
          )}
        </g>
      ))}
      {/* Sem os valores em cada ponto, mostra o menor e o maior à esquerda. */}
      {!showValues && (
        <>
          <text className={styles.value} x={2} y={PAD_TOP - 8}>
            {formatNumber(max, decimals)}
          </text>
          <text className={styles.value} x={2} y={HEIGHT - PAD_BOTTOM - 4}>
            {formatNumber(min, decimals)}
          </text>
        </>
      )}
    </svg>
  )
}
