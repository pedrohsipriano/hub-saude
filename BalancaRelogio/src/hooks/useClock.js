// Relógio que avança a cada `intervalMs` enquanto `active` (cronômetro do treino).
// Fica na tela que mostra o tempo, para só ela renderizar de novo a cada segundo.
import { useEffect, useState } from 'react'

/**
 * @param {boolean} active
 * @param {number} [intervalMs]
 * @returns {number} horário atual (ms) da última batida
 */
export function useClock(active, intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active) return undefined
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [active, intervalMs])

  return now
}
