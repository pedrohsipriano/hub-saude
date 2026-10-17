// Mapa com o trajeto do treino (Leaflet + mapa do OpenStreetMap; precisa de internet para as imagens do mapa).
// Carregado sob demanda (React.lazy) para não pesar na abertura do app.
// - follow = true (gravando ou percurso animado): centraliza no ponto atual a cada atualização.
// - follow = false (treino salvo): enquadra o trajeto inteiro.
// O traço e os marcadores são atualizados no lugar (sem recriar), para a animação ficar leve.
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import { FOLLOW_ZOOM, INITIAL_VIEW, toLines } from './routeLines.js'
import styles from './RouteMap.module.css'

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

/**
 * @param {object} props
 * @param {Array<{ lat: number, lon: number, segment: number }>} props.points - trajeto (já limpo)
 * @param {boolean} [props.follow] - seguir o ponto atual
 * @param {{ lat: number, lon: number } | null} [props.current] - ponto atual (gravando ou animação)
 * @param {number} [props.followZoom] - zoom mínimo ao seguir
 * @param {'live' | 'detail'} [props.size] - altura do mapa
 */
export default function RouteMap({ points, follow = false, current = null, followZoom = FOLLOW_ZOOM, size = 'detail' }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)

  // Cria o mapa uma vez e o destrói ao sair da tela.
  useEffect(() => {
    const map = L.map(containerRef.current, { center: INITIAL_VIEW.center, zoom: INITIAL_VIEW.zoom })
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map)
    const layer = L.layerGroup().addTo(map)
    mapRef.current = { map, layer, lines: [], markers: {} }
    // O Leaflet precisa saber quando o tamanho do contêiner muda (girar o celular, abrir a tela).
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(containerRef.current)
    return () => {
      observer.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Atualiza o trajeto e os marcadores de início, ponto atual e fim.
  useEffect(() => {
    const state = mapRef.current
    if (!state) return
    const { map, layer } = state
    const lines = toLines(points)

    // Um traço por segmento: reaproveita, cria os que faltam e remove os que sobram (cores no CSS).
    lines.forEach((coords, index) => {
      if (state.lines[index]) state.lines[index].setLatLngs(coords)
      else state.lines.push(L.polyline(coords, { className: styles.route, weight: 5 }).addTo(layer))
    })
    state.lines.splice(lines.length).forEach((line) => line.remove())

    /** Mostra, move ou esconde um marcador. */
    const showMarker = (key, point, className) => {
      const existing = state.markers[key]
      if (!point) {
        existing?.remove()
        delete state.markers[key]
      } else if (existing) existing.setLatLng([point.lat, point.lon])
      else state.markers[key] = L.circleMarker([point.lat, point.lon], { className, radius: 7, weight: 2, fillOpacity: 1 }).addTo(layer)
    }
    const last = current ?? points.at(-1)
    showMarker('start', points[0], styles.start)
    showMarker('current', follow ? last : null, styles.current)
    showMarker('end', follow ? null : last, styles.end)

    // Enquadramento (sem animação de deslocamento, para acompanhar a animação do percurso).
    if (follow && last) {
      map.setView([last.lat, last.lon], Math.max(map.getZoom(), followZoom), { animate: false })
    } else if (!follow) {
      const all = lines.flat()
      if (all.length > 1) map.fitBounds(L.latLngBounds(all), { padding: [24, 24] })
      else if (all.length === 1) map.setView(all[0], followZoom)
    }
  }, [points, follow, current, followZoom])

  return <div ref={containerRef} className={`${styles.map} ${size === 'live' ? styles.live : ''}`} role="region" aria-label="Mapa do trajeto" />
}
