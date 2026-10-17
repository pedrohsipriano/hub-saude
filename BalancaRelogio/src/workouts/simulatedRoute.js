// Trajeto simulado (para testar a aba Treino no PC, sem GPS): uma volta retangular de 1,3 km
// em um parque público, com uma subida suave, percorrida na velocidade típica do exercício.
// Função pura: a posição depende só da distância percorrida.

// Ponto de partida: Parque Ibirapuera (São Paulo), um lugar público qualquer só para o mapa.
export const SIM_START = { lat: -23.5874, lon: -46.6576 }

// Cantos da volta em metros (x = leste, y = norte) a partir da partida.
const CORNERS = [
  [0, 0],
  [400, 0],
  [400, 250],
  [0, 250],
]
const METERS_PER_DEG_LAT = 111195

/** Comprimento de um lado (do canto i ao seguinte). */
function sideLength(i) {
  const [x1, y1] = CORNERS[i]
  const [x2, y2] = CORNERS[(i + 1) % CORNERS.length]
  return Math.hypot(x2 - x1, y2 - y1)
}

/** Comprimento da volta (m). */
export const LAP_M = CORNERS.reduce((sum, _, i) => sum + sideLength(i), 0)

/**
 * Posição depois de percorrer `distanceM` metros (dá voltas sem parar).
 * @returns {{ lat: number, lon: number, alt: number }}
 */
export function routePosition(distanceM, start = SIM_START) {
  let rest = ((distanceM % LAP_M) + LAP_M) % LAP_M
  let i = 0
  while (rest > sideLength(i)) {
    rest -= sideLength(i)
    i += 1
  }
  const [x1, y1] = CORNERS[i]
  const [x2, y2] = CORNERS[(i + 1) % CORNERS.length]
  const fraction = rest / sideLength(i)
  const x = x1 + (x2 - x1) * fraction
  const y = y1 + (y2 - y1) * fraction
  return {
    lat: start.lat + y / METERS_PER_DEG_LAT,
    lon: start.lon + x / (METERS_PER_DEG_LAT * Math.cos((start.lat * Math.PI) / 180)),
    // Subida de 9 m indo para o norte e descida na volta.
    alt: 760 + (y / 250) * 9,
  }
}
