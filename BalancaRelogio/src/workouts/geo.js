// Cálculos com o trajeto do GPS: distância, limpeza de pontos ruins, parciais por km,
// subida acumulada e projeção para desenhar o trajeto em SVG.
// Cada ponto: { lat, lon, alt?, acc?, t (ms), segment } — "segment" muda a cada pausa,
// e o trajeto nunca é ligado entre segmentos (o tempo parado não conta).

const EARTH_RADIUS_M = 6371008.8
const toRad = (deg) => (deg * Math.PI) / 180

/** Distância em metros entre dois pontos (fórmula de haversine). */
export function haversine(a, b) {
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

/**
 * Remove pontos imprecisos (acc > maxAccuracy) e saltos impossíveis (velocidade > maxSpeed × 1,5).
 * @param {Array<object>} points
 * @param {{ maxAccuracy?: number, maxSpeed?: number }} [options]
 */
export function cleanTrack(points, { maxAccuracy = 30, maxSpeed = 15 } = {}) {
  const kept = []
  for (const point of points) {
    if (point.acc != null && point.acc > maxAccuracy) continue
    const previous = kept.at(-1)
    if (previous && previous.segment === point.segment) {
      const seconds = (point.t - previous.t) / 1000
      if (seconds <= 0) continue
      if (haversine(previous, point) / seconds > maxSpeed * 1.5) continue
    }
    kept.push(point)
  }
  return kept
}

/** Percorre os trechos consecutivos dentro do mesmo segmento. */
function forEachStep(points, callback) {
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].segment === points[i - 1].segment) callback(points[i - 1], points[i])
  }
}

/** Distância total (m), sem ligar segmentos separados por pausa. */
export function trackDistance(points) {
  let total = 0
  forEachStep(points, (a, b) => {
    total += haversine(a, b)
  })
  return total
}

/**
 * Velocidade recente (m/s) nos últimos `windowMs` do segmento atual (ritmo "agora").
 * @returns {number | null} null sem pontos suficientes
 */
export function recentSpeed(points, windowMs = 30000) {
  const last = points.at(-1)
  if (!last) return null
  const recent = points.filter((p) => p.segment === last.segment && last.t - p.t <= windowMs)
  if (recent.length < 2) return null
  const seconds = (last.t - recent[0].t) / 1000
  return seconds > 0 ? trackDistance(recent) / seconds : null
}

/**
 * Parciais: tempo em movimento de cada km (o último pode ser parcial).
 * @returns {Array<{ index: number, distanceM: number, durationMs: number }>}
 */
export function splits(points, every = 1000) {
  const result = []
  let distance = 0
  let time = 0
  let splitStartDistance = 0
  let splitStartTime = 0
  forEachStep(points, (a, b) => {
    const step = haversine(a, b)
    const dt = b.t - a.t
    // Fecha quantos km este trecho completar (interpolando o tempo dentro do trecho).
    while (step > 0 && distance + step >= splitStartDistance + every) {
      const fraction = (splitStartDistance + every - distance) / step
      const crossTime = time + dt * fraction
      result.push({ index: result.length + 1, distanceM: every, durationMs: crossTime - splitStartTime })
      splitStartDistance += every
      splitStartTime = crossTime
    }
    distance += step
    time += dt
  })
  if (distance - splitStartDistance > 50) {
    result.push({ index: result.length + 1, distanceM: distance - splitStartDistance, durationMs: time - splitStartTime })
  }
  return result
}

/** Subida acumulada (m), ignorando oscilações menores que `threshold` (ruído da altitude do GPS). */
export function elevationGain(points, threshold = 3) {
  let gain = 0
  let reference = null
  for (const point of points) {
    if (point.alt == null) continue
    if (reference == null) reference = point.alt
    else if (point.alt - reference >= threshold) {
      gain += point.alt - reference
      reference = point.alt
    } else if (reference - point.alt >= threshold) reference = point.alt
  }
  return Math.round(gain)
}

/**
 * Projeção fixa lat/lon → x/y num retângulo, mantendo a proporção (correção do cosseno da latitude).
 * Calculada uma vez com o trajeto inteiro, serve também para desenhar pedaços dele sem "pular".
 * @returns {(point: { lat: number, lon: number }) => { x: number, y: number }}
 */
export function trackProjector(points, width, height, padding = 6) {
  const lats = points.map((p) => p.lat)
  const lons = points.map((p) => p.lon)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLon = Math.min(...lons)
  const maxLon = Math.max(...lons)
  const lonScale = Math.cos(toRad((minLat + maxLat) / 2))
  const spanX = Math.max((maxLon - minLon) * lonScale, 1e-9)
  const spanY = Math.max(maxLat - minLat, 1e-9)
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY)
  // Centraliza o desenho.
  const offsetX = (width - spanX * scale) / 2
  const offsetY = (height - spanY * scale) / 2
  return (point) => ({ x: offsetX + (point.lon - minLon) * lonScale * scale, y: offsetY + (maxLat - point.lat) * scale })
}

/**
 * Projeta o trajeto num retângulo (SVG).
 * @returns {Array<Array<{ x: number, y: number }>>} um traço por segmento
 */
export function projectTrack(points, width, height, padding = 6) {
  if (points.length < 2) return []
  const project = trackProjector(points, width, height, padding)
  const strokes = []
  for (const point of points) {
    const xy = project(point)
    const last = strokes.at(-1)
    if (last && last.segment === point.segment) last.points.push(xy)
    else strokes.push({ segment: point.segment, points: [xy] })
  }
  return strokes.map((stroke) => stroke.points)
}
