// Se o app está na tela (primeiro plano) ou não.
// Com o serviço do relógio mantendo o app vivo em segundo plano, o JavaScript continua rodando com o app
// fora da tela — e o Health Connect recusa leituras nesse caso ("must be in foreground"). Por isso as
// leituras do Health Connect esperam o app voltar para a tela (whenAppActive).
import { App } from '@capacitor/app'
import { isNativeApp } from './platform.js'

let active = typeof document === 'undefined' || document.visibilityState !== 'hidden'
const listeners = new Set()

/** Atualiza o estado e avisa quem está ouvindo. */
function setActive(next) {
  if (next === active) return
  active = next
  listeners.forEach((listener) => listener(next))
}

if (isNativeApp()) {
  App.getState()
    .then((state) => setActive(state.isActive))
    .catch(() => {})
  App.addListener('appStateChange', ({ isActive }) => setActive(isActive)).catch(() => {})
} else if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => setActive(document.visibilityState === 'visible'))
}

/** O app está na tela agora? */
export function isAppActive() {
  return active
}

/**
 * Avisa quando o app entra ou sai da tela.
 * @param {(isActive: boolean) => void} listener
 * @returns {() => void} para de avisar
 */
export function onAppStateChange(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Roda `task` agora, se o app estiver na tela; senão, assim que ele voltar.
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
export function whenAppActive(task) {
  if (active) return task()
  return new Promise((resolve, reject) => {
    const stop = onAppStateChange((isActive) => {
      if (!isActive) return
      stop()
      task().then(resolve, reject)
    })
  })
}
