// Formato compacto do trajeto para o banco (funções puras).
// 1. Simplificação (Douglas–Peucker por trecho): tira pontos que ficam a menos de `toleranceM` metros
//    da reta entre os vizinhos — o desenho no mapa fica igual e o número de pontos cai bastante.
//    A distância, as parciais e a subida do treino são calculadas ANTES, com o trajeto inteiro.
// 2. Codificação binária: lat/lon em microgrus (Int32, ~0,1 m), altitude em decímetros (Int16),
//    horário em décimos de segundo desde o início (Uint32) e o trecho (Uint8).
//    ~15 bytes por ponto, contra ~100 de um objeto { lat, lon, alt, acc, t, segment }.

const MICRO = 1e6
const NO_ALT = -32768 // altitude ausente
const METERS_PER_DEG = 111195

/** Distância (m) do ponto p à reta a–b, numa projeção plana local (suficiente para alguns km). */
function distanceToSegment(p, a, b) {
  const cos = Math.cos((a.lat * Math.PI) / 180)
  const ax = a.lon * cos * METERS_PER_DEG
  const ay = a.lat * METERS_PER_DEG
  const bx = b.lon * cos * METERS_PER_DEG - ax
  const by = b.lat * METERS_PER_DEG - ay
  const px = p.lon * cos * METERS_PER_DEG - ax
  const py = p.lat * METERS_PER_DEG - ay
  const lengthSq = bx * bx + by * by
  const t = lengthSq ? Math.max(0, Math.min(1, (px * bx + py * by) / lengthSq)) : 0
  return Math.hypot(px - t * bx, py - t * by)
}

/** Douglas–Peucker iterativo de um trecho (mantém o primeiro e o último ponto). */
function simplifySegment(points, toleranceM) {
  if (points.length < 3) return points
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [first, last] = stack.pop()
    let maxDistance = 0
    let index = -1
    for (let i = first + 1; i < last; i += 1) {
      const distance = distanceToSegment(points[i], points[first], points[last])
      if (distance > maxDistance) {
        maxDistance = distance
        index = i
      }
    }
    if (maxDistance > toleranceM) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }
  return points.filter((_, i) => keep[i])
}

/**
 * Simplifica o trajeto trecho a trecho (as pausas continuam separadas).
 * @param {Array<{ lat: number, lon: number, segment: number }>} points
 * @param {number} [toleranceM]
 */
export function simplifyTrack(points, toleranceM = 2) {
  const result = []
  let start = 0
  for (let i = 1; i <= points.length; i += 1) {
    if (i === points.length || points[i].segment !== points[start].segment) {
      result.push(...simplifySegment(points.slice(start, i), toleranceM))
      start = i
    }
  }
  return result
}

/**
 * Trajeto → formato compacto (typed arrays; o IndexedDB guarda em binário).
 * @param {Array<{ lat: number, lon: number, alt?: number | null, t: number, segment?: number }>} points
 * @param {number} startedAt - início do treino (ms)
 */
export function encodeTrack(points, startedAt) {
  const n = points.length
  const track = {
    v: 1,
    lat: new Int32Array(n),
    lon: new Int32Array(n),
    alt: new Int16Array(n),
    t: new Uint32Array(n),
    seg: new Uint8Array(n),
  }
  points.forEach((point, i) => {
    track.lat[i] = Math.round(point.lat * MICRO)
    track.lon[i] = Math.round(point.lon * MICRO)
    track.alt[i] = point.alt == null ? NO_ALT : Math.max(-32767, Math.min(32767, Math.round(point.alt * 10)))
    track.t[i] = Math.max(0, Math.round(((point.t ?? startedAt) - startedAt) / 100))
    track.seg[i] = Math.min(255, point.segment ?? 0)
  })
  return track
}

/** Formato compacto → trajeto ({ lat, lon, alt, t, segment }). */
export function decodeTrack(track, startedAt) {
  if (!track?.lat) return []
  return Array.from(track.lat, (lat, i) => ({
    lat: lat / MICRO,
    lon: track.lon[i] / MICRO,
    alt: track.alt[i] === NO_ALT ? null : track.alt[i] / 10,
    t: startedAt + track.t[i] * 100,
    segment: track.seg[i],
  }))
}

/** Formato compacto em JSON (para o localStorage, que não guarda typed arrays). */
export function trackToJson(track) {
  return { v: track.v, lat: Array.from(track.lat), lon: Array.from(track.lon), alt: Array.from(track.alt), t: Array.from(track.t), seg: Array.from(track.seg) }
}

/** JSON → formato compacto. */
export function trackFromJson(json) {
  return {
    v: json.v,
    lat: Int32Array.from(json.lat),
    lon: Int32Array.from(json.lon),
    alt: Int16Array.from(json.alt),
    t: Uint32Array.from(json.t),
    seg: Uint8Array.from(json.seg),
  }
}
