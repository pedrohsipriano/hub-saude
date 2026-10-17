// Hook com todas as linhas de medição do usuário (balança e relógio).
// Recarrega sempre que o hub avisa que algo novo foi gravado.
import { useEffect, useState } from 'react'
import { DEFAULT_USER_ID, hub } from '../hub/hub.js'
import { listMeasurements } from '../storage/db.js'

/**
 * @param {string} [userId]
 * @returns {{ rows: Array<object>, loading: boolean, error: Error | null }}
 */
export function useMeasurementRows(userId = DEFAULT_USER_ID) {
  const [state, setState] = useState({ rows: [], loading: true, error: null })

  useEffect(() => {
    // Sem usuário ainda (perfis carregando), não há o que ler.
    if (!userId) return undefined
    let active = true

    // Lê as linhas do banco local.
    const load = () =>
      listMeasurements(userId)
        .then((rows) => {
          if (active) setState({ rows, loading: false, error: null })
        })
        .catch((error) => {
          if (active) setState((previous) => ({ ...previous, loading: false, error }))
        })

    load()
    const unsubscribe = hub.on('measurements:changed', load)
    return () => {
      active = false
      unsubscribe()
    }
  }, [userId])

  return state
}
