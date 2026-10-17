// Escolhe e carrega o mapa do trajeto só quando ele aparece na tela:
// Google Maps quando há chave (VITE_GOOGLE_MAPS_API_KEY); senão, ou se a chave falhar, OpenStreetMap (Leaflet).
import { lazy, Suspense, useState } from 'react'
import { googleMapsAvailable } from './googleMapsLoader.js'
import styles from './RouteMap.module.css'

const GoogleRouteMap = lazy(() => import('./GoogleRouteMap.jsx'))
const RouteMap = lazy(() => import('./RouteMap.jsx'))

/** Mesmas props do RouteMap. */
export default function LazyRouteMap(props) {
  const [useGoogle, setUseGoogle] = useState(googleMapsAvailable)
  const MapComponent = useGoogle ? GoogleRouteMap : RouteMap

  return (
    <Suspense fallback={<div className={`${styles.map} ${props.size === 'live' ? styles.live : ''}`}>Carregando o mapa…</div>}>
      <MapComponent {...props} onFailure={() => setUseGoogle(false)} />
    </Suspense>
  )
}
