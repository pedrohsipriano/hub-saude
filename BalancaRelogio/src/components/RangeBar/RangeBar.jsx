// Barra colorida com as faixas de referência, os limites embaixo
// e um marcador (triângulo) na posição do valor atual.
import { formatNumber, toneClassName } from '../../utils/format.js'
import styles from './RangeBar.module.css'

// Dimensões internas do desenho.
const WIDTH = 300
const BAR_Y = 14
const BAR_HEIGHT = 10

/**
 * @param {object} props
 * @param {Array<{ from: number, to: number, label: string, tone: string }>} props.bands
 * @param {number} props.value - valor atual
 * @param {number} [props.decimals] - casas decimais dos limites
 */
export default function RangeBar({ bands, value, decimals = 1 }) {
  const min = bands[0].from
  const max = bands.at(-1).to
  const span = max - min || 1

  // Converte um valor da métrica para a posição horizontal (presa às pontas da barra).
  const xAt = (v) => ((Math.min(Math.max(v, min), max) - min) / span) * WIDTH
  const markerX = xAt(value)

  // Limites exibidos embaixo: início da primeira faixa e fim de cada faixa.
  const limits = [min, ...bands.map((band) => band.to)]
  const limitDecimals = (limit) => (Number.isInteger(limit) ? 0 : Math.max(decimals, 1))

  return (
    <svg
      className={styles.rangeBar}
      viewBox={`-16 0 ${WIDTH + 32} 44`}
      role="img"
      aria-label={`Faixas de referência; valor atual ${formatNumber(value, decimals)}`}
    >
      {bands.map((band) => (
        <rect
          key={band.from}
          className={styles[toneClassName(band.tone)]}
          x={xAt(band.from)}
          y={BAR_Y}
          width={xAt(band.to) - xAt(band.from)}
          height={BAR_HEIGHT}
        />
      ))}
      <path className={styles.marker} d={`M${markerX - 5},2 L${markerX + 5},2 L${markerX},11 Z`} />
      {limits.map((limit, index) => (
        <text key={index} className={styles.limit} x={xAt(limit)} y={40} textAnchor="middle">
          {formatNumber(limit, limitDecimals(limit))}
        </text>
      ))}
    </svg>
  )
}
