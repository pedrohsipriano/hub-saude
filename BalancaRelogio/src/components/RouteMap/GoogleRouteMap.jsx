// Mapa do trajeto com o Google Maps (Maps JavaScript API), com as mesmas props do RouteMap (Leaflet).
// Usado quando existe VITE_GOOGLE_MAPS_API_KEY. Se o Google recusar a chave ou o script não carregar,
// chama onFailure e o LazyRouteMap troca para o OpenStreetMap.
// - follow = true (gravando ou percurso animado): centraliza no ponto atual a cada atualização.
// - follow = false (treino salvo): enquadra o trajeto inteiro.
import { useEffect, useRef, useState } from 'react'
import { GOOGLE_MAPS_MAP_ID } from '../../integrations/google/googleConfig.js'
import { currentTheme } from '../../theme/theme.js'
import { loadGoogleMaps, onGoogleMapsAuthFailure } from './googleMapsLoader.js'
import { FOLLOW_ZOOM, INITIAL_VIEW, toLines } from './routeLines.js'
import styles from './RouteMap.module.css'

/** Elemento da bolinha de um marcador (as cores ficam no CSS). */
function createPin(className) {
  const element = document.createElement('div')
  element.className = `${styles.pin} ${className}`
  return element
}

/** [lat, lon] → formato do Google ({ lat, lng }). */
const toLatLng = ([lat, lon]) => ({ lat, lng: lon })

/**
 * @param {object} props
 * @param {Array<{ lat: number, lon: number, segment: number }>} props.points - trajeto (já limpo)
 * @param {boolean} [props.follow] - seguir a posição atual
 * @param {{ lat: number, lon: number } | null} [props.current] - ponto atual (gravando ou animação)
 * @param {number} [props.followZoom] - zoom mínimo ao seguir
 * @param {'live' | 'detail'} [props.size] - altura do mapa
 * @param {() => void} [props.onFailure] - o Google Maps não pôde ser usado
 */
export default function GoogleRouteMap({ points, follow = false, current = null, followZoom = FOLLOW_ZOOM, size = 'detail', onFailure }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  // Muda a cada mapa criado, para redesenhar o trajeto no mapa novo.
  const [mapVersion, setMapVersion] = useState(0)

  // O aviso de falha é lido dentro de callbacks assíncronos (ref atualizado em efeito).
  const onFailureRef = useRef(onFailure)
  useEffect(() => {
    onFailureRef.current = onFailure
  }, [onFailure])

  // Carrega o Google Maps e cria o mapa (uma vez por tamanho).
  useEffect(() => {
    let cancelled = false
    const stopAuthWatch = onGoogleMapsAuthFailure(() => onFailureRef.current?.())
    loadGoogleMaps()
      .then(async (maps) => {
        const [{ Map, Polyline }, { AdvancedMarkerElement }, { LatLngBounds }] = await Promise.all([
          maps.importLibrary('maps'),
          maps.importLibrary('marker'),
          maps.importLibrary('core'),
        ])
        if (cancelled) return
        const map = new Map(containerRef.current, {
          center: toLatLng(INITIAL_VIEW.center),
          zoom: INITIAL_VIEW.zoom,
          mapId: GOOGLE_MAPS_MAP_ID,
          // Mesmo tema do app (claro/escuro), lido na criação do mapa.
          colorScheme: currentTheme() === 'dark' ? maps.ColorScheme?.DARK : maps.ColorScheme?.LIGHT,
          mapTypeControl: true, // mapa / satélite
          streetViewControl: false,
          fullscreenControl: false,
          // Gravando: um dedo move o mapa; no detalhe, um dedo rola a página.
          gestureHandling: size === 'live' ? 'greedy' : 'cooperative',
        })
        mapRef.current = { map, Polyline, AdvancedMarkerElement, LatLngBounds, lines: [], start: null, end: null }
        setMapVersion((version) => version + 1)
      })
      .catch(() => {
        if (!cancelled) onFailureRef.current?.()
      })
    return () => {
      cancelled = true
      stopAuthWatch()
      // Tira do mapa os traços e marcadores (o Google não tem um "destruir mapa").
      const state = mapRef.current
      if (state) {
        state.lines.forEach((line) => line.setMap(null))
        if (state.start) state.start.map = null
        if (state.end) state.end.map = null
      }
      mapRef.current = null
    }
  }, [size])

  // Atualiza o trajeto e os marcadores sem recriá-los a cada ponto novo.
  useEffect(() => {
    const state = mapRef.current
    if (!state) return
    const { map, Polyline, AdvancedMarkerElement, LatLngBounds } = state
    const lines = toLines(points)
    // A cor do traço vem do token --color-route (tokens.css).
    const strokeColor = getComputedStyle(containerRef.current).getPropertyValue('--color-route').trim()

    // Um traço por segmento: reaproveita os existentes, cria os que faltam e remove os que sobram.
    lines.forEach((coords, index) => {
      const path = coords.map(toLatLng)
      if (state.lines[index]) state.lines[index].setPath(path)
      else state.lines.push(new Polyline({ map, path, strokeColor, strokeOpacity: 0.9, strokeWeight: 5 }))
    })
    state.lines.splice(lines.length).forEach((line) => line.setMap(null))

    // Marcadores: início e posição atual (gravando) ou fim (treino salvo).
    const first = points[0]
    const last = current ?? points.at(-1)
    if (first) {
      state.start ??= new AdvancedMarkerElement({ content: createPin(styles.pinStart), title: 'Início' })
      state.start.position = { lat: first.lat, lng: first.lon }
      state.start.map = map
    } else if (state.start) state.start.map = null
    if (last) {
      state.end ??= new AdvancedMarkerElement({ content: createPin(styles.pinEnd) })
      state.end.content.className = `${styles.pin} ${follow ? styles.pinCurrent : styles.pinEnd}`
      state.end.title = follow ? 'Você está aqui' : 'Fim'
      state.end.position = { lat: last.lat, lng: last.lon }
      state.end.map = map
    } else if (state.end) state.end.map = null

    // Enquadramento.
    if (follow && last) {
      map.setCenter({ lat: last.lat, lng: last.lon })
      if (map.getZoom() < followZoom) map.setZoom(followZoom)
    } else if (!follow) {
      const all = lines.flat()
      if (all.length > 1) {
        const bounds = new LatLngBounds()
        all.forEach((coord) => bounds.extend(toLatLng(coord)))
        map.fitBounds(bounds, 24)
      } else if (all.length === 1) {
        map.setCenter(toLatLng(all[0]))
        map.setZoom(followZoom)
      }
    }
  }, [mapVersion, points, follow, current, followZoom])

  return <div ref={containerRef} className={`${styles.map} ${size === 'live' ? styles.live : ''}`} role="region" aria-label="Mapa do trajeto" />
}
