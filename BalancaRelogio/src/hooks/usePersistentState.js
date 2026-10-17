// Estado guardado no localStorage (preferências do aparelho: usuário atual, lembretes, donos dos aparelhos).
// Tolerante a armazenamento bloqueado: sem ele, o valor vale só nesta sessão.
import { useCallback, useState } from 'react'

/** Lê um valor JSON do localStorage. */
function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

/** Grava um valor JSON no localStorage (ignora falhas). */
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Armazenamento indisponível: segue só em memória.
  }
}

/**
 * @param {string} key - chave no localStorage
 * @param {any} fallback - valor padrão
 * @returns {[any, (next: any | ((previous: any) => any)) => void]}
 */
export function usePersistentState(key, fallback) {
  const [value, setValue] = useState(() => read(key, fallback))

  const update = useCallback(
    (next) => {
      setValue((previous) => {
        const resolved = typeof next === 'function' ? next(previous) : next
        write(key, resolved)
        return resolved
      })
    },
    [key],
  )

  return [value, update]
}
