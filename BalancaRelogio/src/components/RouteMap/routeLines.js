// Partes comuns aos dois mapas do trajeto (OpenStreetMap/Leaflet e Google Maps).

// Vista inicial antes do primeiro ponto (Brasil inteiro).
export const INITIAL_VIEW = { center: [-15.78, -47.93], zoom: 4 }
// Zoom mínimo ao seguir a posição durante o treino.
export const FOLLOW_ZOOM = 16

/** Pontos → uma lista de [lat, lon] por segmento (o trajeto não liga as pausas). */
export function toLines(points) {
  const lines = []
  for (const point of points) {
    const last = lines.at(-1)
    if (last && last.segment === point.segment) last.coords.push([point.lat, point.lon])
    else lines.push({ segment: point.segment, coords: [[point.lat, point.lon]] })
  }
  return lines.map((line) => line.coords)
}
