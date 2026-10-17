// Miniatura do trajeto em SVG (lista de atividades): funciona sem internet e sem carregar o mapa.
import { useMemo } from 'react'
import { projectTrack } from '../../workouts/geo.js'
import styles from './RouteThumbnail.module.css'

const WIDTH = 96
const HEIGHT = 72

/**
 * @param {object} props
 * @param {Array<{ lat: number, lon: number, segment: number }>} props.points
 * @param {string} props.fallback - texto quando não há trajeto (ex.: sigla do exercício)
 */
export default function RouteThumbnail({ points, fallback }) {
  const strokes = useMemo(() => projectTrack(points ?? [], WIDTH, HEIGHT), [points])

  if (!strokes.length) {
    return (
      <span className={styles.fallback} aria-hidden="true">
        {fallback}
      </span>
    )
  }

  return (
    <svg className={styles.thumb} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Trajeto do treino">
      {strokes.map((stroke, index) => (
        <polyline key={index} className={styles.line} points={stroke.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} />
      ))}
    </svg>
  )
}
