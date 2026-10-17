// Relógio compartilhado: um único intervalo atualiza "agora" para todas as telas
// (próxima refeição, lembretes na tela, resumo do dia).
import { useSyncExternalStore } from 'react'

const TICK_MS = 30 * 1000
const listeners = new Set()
let current = Date.now()
let timer = null

/** Começa a contar quando a primeira tela assina e para quando a última sai. */
function subscribe(listener) {
  listeners.add(listener)
  if (!timer) {
    current = Date.now()
    timer = setInterval(() => {
      current = Date.now()
      listeners.forEach((notify) => notify())
    }, TICK_MS)
  }
  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      clearInterval(timer)
      timer = null
    }
  }
}

/** Timestamp atual, atualizado a cada 30 s. */
export function useNow() {
  return useSyncExternalStore(subscribe, () => current)
}
