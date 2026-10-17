// Ajuste do trajeto às ruas com a Roads API do Google (snapToRoads, com interpolação).
// Limites da API: até 100 pontos por pedido e pontos a menos de 300 m um do outro.
// O trajeto original nunca é apagado: o ajustado é guardado à parte (workout.snappedPoints).
import { haversine } from '../../workouts/geo.js'

const ROADS_URL = 'https://roads.googleapis.com/v1/snapToRoads'
export const ROADS_BATCH_SIZE = 100
// Distância mínima entre os pontos enviados: menos pedidos, sem perder o desenho do caminho.
const MIN_SPACING_M = 20

/**
 * Divide o trajeto em pedidos: um grupo por segmento (as pausas não são ligadas), pontos a cada
 * `minSpacing` m (sempre com o último ponto) e até `batchSize` pontos por pedido. Cada pedido repete
 * o último ponto do anterior, para o traço ajustado não ter falha entre eles.
 * @param {Array<{ lat: number, lon: number, segment: number }>} points
 * @returns {Array<{ segment: number, coords: Array<{ lat: number, lon: number }> }>}
 */
export function snapBatches(points, { minSpacing = MIN_SPACING_M, batchSize = ROADS_BATCH_SIZE } = {}) {
  // Afina cada segmento.
  const segments = new Map()
  for (const point of points) {
    const kept = segments.get(point.segment) ?? { list: [], last: null }
    const previous = kept.list.at(-1)
    if (!previous || haversine(previous, point) >= minSpacing) kept.list.push(point)
    kept.last = point
    segments.set(point.segment, kept)
  }

  const batches = []
  for (const [segment, { list, last }] of segments) {
    if (list.at(-1) !== last) list.push(last) // termina exatamente onde o segmento termina
    if (list.length < 2) continue
    for (let start = 0; start < list.length - 1; start += batchSize - 1) {
      batches.push({ segment, coords: list.slice(start, start + batchSize).map(({ lat, lon }) => ({ lat, lon })) })
    }
  }
  return batches
}

/** URL de um pedido snapToRoads. */
export function snapUrl(coords, apiKey) {
  const path = coords.map(({ lat, lon }) => `${lat.toFixed(6)},${lon.toFixed(6)}`).join('|')
  return `${ROADS_URL}?${new URLSearchParams({ interpolate: 'true', path, key: apiKey })}`
}

/** Resposta da API → pontos no formato do app. */
export function parseSnapResponse(json, segment) {
  return (json.snappedPoints ?? []).map(({ location }) => ({ lat: location.latitude, lon: location.longitude, segment }))
}

/** Junta os pedidos, tirando o ponto repetido entre um pedido e o seguinte. */
export function mergeSnapped(results) {
  const merged = []
  for (const point of results.flat()) {
    const previous = merged.at(-1)
    if (previous && previous.segment === point.segment && haversine(previous, point) < 0.5) continue
    merged.push(point)
  }
  return merged
}

/**
 * Ajusta o trajeto às ruas (pedidos em sequência, para manter a ordem).
 * @param {Array<object>} points - trajeto limpo do treino
 * @param {{ apiKey: string, fetchImpl?: typeof fetch }} options
 * @returns {Promise<Array<{ lat: number, lon: number, segment: number }>>} vazio se não houver rua por perto
 */
export async function snapTrackToRoads(points, { apiKey, fetchImpl = fetch }) {
  const results = []
  for (const batch of snapBatches(points)) {
    const response = await fetchImpl(snapUrl(batch.coords, apiKey))
    const json = await response.json().catch(() => ({}))
    // A mensagem do Google explica a recusa (ex.: a Roads API não está liberada nesta chave).
    if (!response.ok || json.error) throw new Error(json.error?.message ?? `Roads API respondeu ${response.status}`)
    results.push(parseSnapResponse(json, batch.segment))
  }
  return mergeSnapped(results)
}
