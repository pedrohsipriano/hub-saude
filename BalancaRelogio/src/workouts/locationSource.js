// Adapter do GPS: único ponto do app que lê a localização.
// - App Android: plugin @capacitor-community/background-geolocation, que roda como serviço em primeiro plano
//   (com notificação) e continua gravando com a tela apagada ou o app em segundo plano.
// - Navegador: navigator.geolocation.watchPosition (para quando a aba fica em segundo plano/tela apaga).
// - Simulado: percorre uma volta (simulatedRoute.js) para testar no PC sem GPS.
// Todos entregam o mesmo formato de ponto: { lat, lon, acc, alt, t }.
import { registerPlugin } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { isNativeApp } from '../platform.js'
import { routePosition } from './simulatedRoute.js'

// O pacote do plugin só traz os tipos; o objeto vem do registro do Capacitor.
const BackgroundGeolocation = registerPlugin('BackgroundGeolocation')

// Códigos de erro entregues a onError.
/** Permissão negada (o usuário precisa liberar a localização nas configurações). */
export const NOT_AUTHORIZED = 'NOT_AUTHORIZED'
/** O GPS ainda não respondeu (temporário; a busca continua). */
export const SEARCHING = 'SEARCHING'
/** Sem fonte de localização no momento (no PC: localização do Windows desligada); a busca continua. */
export const UNAVAILABLE = 'UNAVAILABLE'

// Códigos do GeolocationPositionError do navegador.
const GEO_PERMISSION_DENIED = 1
const GEO_TIMEOUT = 3

/** true quando a gravação continua com a tela apagada (só no app Android). */
export function recordsInBackground() {
  return isNativeApp()
}

/** Ponto do plugin nativo → formato do app. */
function fromNative(location) {
  return {
    lat: location.latitude,
    lon: location.longitude,
    acc: location.accuracy,
    alt: location.altitude ?? null,
    t: location.time ?? Date.now(),
  }
}

/** Ponto do navegador → formato do app. */
function fromWeb(position) {
  return {
    lat: position.coords.latitude,
    lon: position.coords.longitude,
    acc: position.coords.accuracy,
    alt: position.coords.altitude ?? null,
    t: position.timestamp,
  }
}

/** GPS simulado: um ponto por segundo, avançando `speedMs` metros na volta de teste. */
function startSimulatedWatch({ onPoint, speedMs }) {
  let distance = 0
  const id = setInterval(() => {
    distance += speedMs
    onPoint({ ...routePosition(distance), acc: 5, t: Date.now() })
  }, 1000)
  return () => clearInterval(id)
}

/**
 * Começa a receber pontos de GPS.
 * @param {object} handlers
 * @param {(point: object) => void} handlers.onPoint
 * @param {(error: { code?: string, message: string }) => void} handlers.onError
 * @param {{ speedMs: number } | null} [handlers.simulate] - usa o trajeto simulado em vez do GPS
 * @returns {Promise<() => void>} função que para o GPS
 */
export async function startLocationWatch({ onPoint, onError, simulate = null }) {
  if (simulate) return startSimulatedWatch({ onPoint, speedMs: simulate.speedMs })
  if (isNativeApp()) {
    // Android 13+: a notificação da gravação precisa da permissão de notificações.
    try {
      await LocalNotifications.requestPermissions()
    } catch {
      // Sem a permissão a gravação funciona; só a notificação não aparece.
    }
    const id = await BackgroundGeolocation.addWatcher(
      {
        backgroundTitle: 'Hub de Saúde',
        backgroundMessage: 'Gravando o treino. Toque para voltar ao app.',
        requestPermissions: true,
        stale: false,
        distanceFilter: 3, // metros entre pontos (economiza bateria sem perder o trajeto)
      },
      (location, error) => {
        if (error) onError({ code: error.code, message: error.message })
        else if (location) onPoint(fromNative(location))
      },
    )
    return () => void BackgroundGeolocation.removeWatcher({ id })
  }

  if (!('geolocation' in navigator)) {
    onError({ code: UNAVAILABLE, message: 'Este navegador não tem GPS/localização.' })
    return () => {}
  }
  return startWebWatch({ onPoint, onError })
}

/**
 * GPS do navegador. Falhas temporárias (demora ou posição indisponível) não encerram a gravação:
 * o app avisa, pede uma posição aproximada (Wi-Fi/rede) e recomeça a busca sozinho.
 */
function startWebWatch({ onPoint, onError }) {
  const geo = navigator.geolocation
  let stopped = false
  let watchId = null
  let retryTimer = null

  const handlePosition = (position) => {
    if (!stopped) onPoint(fromWeb(position))
  }

  /** Recomeça a busca depois de `delayMs`. */
  const restart = (delayMs) => {
    if (watchId != null) geo.clearWatch(watchId)
    watchId = null
    clearTimeout(retryTimer)
    retryTimer = setTimeout(() => {
      if (!stopped) watch()
    }, delayMs)
  }

  const handleError = (error) => {
    if (stopped) return
    if (error.code === GEO_PERMISSION_DENIED) {
      onError({ code: NOT_AUTHORIZED, message: 'Permissão de localização negada.' })
      return
    }
    onError(error.code === GEO_TIMEOUT ? { code: SEARCHING, message: 'O GPS está demorando para responder.' } : { code: UNAVAILABLE, message: 'Localização indisponível.' })
    // Posição aproximada enquanto o GPS não responde: centraliza o mapa e mostra a precisão
    // (pontos imprecisos não entram no trajeto; ver cleanTrack).
    geo.getCurrentPosition(handlePosition, () => {}, { enableHighAccuracy: false, maximumAge: 60000, timeout: 15000 })
    restart(error.code === GEO_TIMEOUT ? 1000 : 5000)
  }

  /** Busca contínua de alta precisão (GPS do aparelho, quando existe). */
  const watch = () => {
    watchId = geo.watchPosition(handlePosition, handleError, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 })
  }

  watch()
  return () => {
    stopped = true
    clearTimeout(retryTimer)
    if (watchId != null) geo.clearWatch(watchId)
  }
}

/** Abre as configurações do app (para liberar a localização depois de negar). */
export function openLocationSettings() {
  if (isNativeApp()) return BackgroundGeolocation.openSettings()
  return Promise.resolve()
}
