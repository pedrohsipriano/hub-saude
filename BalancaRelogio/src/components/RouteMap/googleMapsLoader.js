// Carrega a Maps JavaScript API do Google uma única vez, sem biblioteca extra.
// A chave vem de VITE_GOOGLE_MAPS_API_KEY (arquivo .env.local, fora do git; ver googleConfig.js).
// Sem chave, ou se o Google recusar a chave, o app usa o mapa do OpenStreetMap (RouteMap.jsx).
import { GOOGLE_MAPS_API_KEY } from '../../integrations/google/googleConfig.js'

// Função global que o script do Google chama quando termina de carregar.
const CALLBACK_NAME = '__hubSaudeGoogleMapsReady'

let loading = null
let authFailed = false
const authListeners = new Set()

/** true quando há chave e ela ainda não foi recusada nesta sessão. */
export function googleMapsAvailable() {
  return Boolean(GOOGLE_MAPS_API_KEY) && !authFailed
}

/**
 * Avisa quando o Google recusar a chave (inválida, sem faturamento, API desativada ou fora das restrições).
 * @param {() => void} listener
 * @returns {() => void} cancela o aviso
 */
export function onGoogleMapsAuthFailure(listener) {
  authListeners.add(listener)
  return () => authListeners.delete(listener)
}

/**
 * Carrega o script do Google Maps (uma vez) e devolve o namespace google.maps.
 * @returns {Promise<typeof window.google.maps>}
 */
export function loadGoogleMaps() {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps)
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      // O Google chama gm_authFailure quando a chave não é aceita.
      window.gm_authFailure = () => {
        authFailed = true
        authListeners.forEach((listener) => listener())
      }
      window[CALLBACK_NAME] = () => {
        delete window[CALLBACK_NAME]
        resolve(window.google.maps)
      }
      const params = new URLSearchParams({
        key: GOOGLE_MAPS_API_KEY,
        v: 'weekly',
        loading: 'async',
        callback: CALLBACK_NAME,
        language: 'pt-BR',
        region: 'BR',
      })
      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?${params}`
      script.async = true
      // Sem internet ou bloqueado: permite tentar de novo na próxima vez.
      script.onerror = () => {
        loading = null
        script.remove()
        reject(new Error('Não foi possível carregar o Google Maps.'))
      }
      document.head.append(script)
    })
  }
  return loading
}
