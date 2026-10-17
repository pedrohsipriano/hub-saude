// Percurso animado (estilo "flyover" do Strava): o ponto anda pelo trajeto do início ao fim.
// Funções puras, usadas pelo mapa (useRouteReplay) e pelo vídeo de compartilhamento (share/shareCard.js).
import { haversine } from './geo.js'

/** Distância acumulada (m) até cada ponto, sem somar o salto entre segmentos (pausas). */
export function cumulativeDistances(points) {
  const result = []
  let total = 0
  points.forEach((point, i) => {
    const previous = points[i - 1]
    if (previous && previous.segment === point.segment) total += haversine(previous, point)
    result.push(total)
  })
  return result
}

/** Suaviza o começo e o fim da animação (0 → 1). */
export function easeInOut(t) {
  return 0.5 - Math.cos(Math.PI * Math.min(1, Math.max(0, t))) / 2
}

/**
 * Trajeto percorrido até a fração `progress` (0–1) da distância, terminando no ponto interpolado ("cabeça").
 * @param {Array<{ lat: number, lon: number, segment: number }>} points
 * @param {number} progress
 * @param {number[]} [cumulative] - de cumulativeDistances (passe pronto para não recalcular a cada quadro)
 * @returns {{ points: Array<object>, head: object | null }}
 */
export function routeAtProgress(points, progress, cumulative = cumulativeDistances(points)) {
  if (!points.length) return { points: [], head: null }
  const total = cumulative.at(-1)
  if (progress >= 1 || total === 0) return { points, head: points.at(-1) }
  const target = Math.max(0, progress) * total
  // Primeiro ponto além do alvo (a distância só cresce dentro de um segmento, então a e b são do mesmo).
  const i = cumulative.findIndex((distance) => distance > target)
  if (i <= 0) return { points: points.slice(0, 1), head: points[0] }
  const a = points[i - 1]
  const b = points[i]
  const fraction = (target - cumulative[i - 1]) / (cumulative[i] - cumulative[i - 1])
  const head = { lat: a.lat + (b.lat - a.lat) * fraction, lon: a.lon + (b.lon - a.lon) * fraction, segment: a.segment }
  return { points: [...points.slice(0, i), head], head }
}

/**
 * Reduz o trajeto para cerca de `max` pontos (animação leve), mantendo o início e o fim de cada segmento.
 * @returns {Array<object>}
 */
export function simplifyForReplay(points, max = 400) {
  if (points.length <= max) return points
  const step = Math.ceil(points.length / max)
  return points.filter(
    (point, i) => i % step === 0 || points[i - 1]?.segment !== point.segment || points[i + 1]?.segment !== point.segment,
  )
}
