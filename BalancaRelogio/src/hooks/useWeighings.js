// Hook das pesagens salvas (linhas da balança reagrupadas em pesagens).
import { useMemo } from 'react'
import { groupWeighings } from '../devices/scale/weighings.js'
import { DEFAULT_USER_ID } from '../hub/hub.js'
import { useMeasurementRows } from './useMeasurementRows.js'

/**
 * @param {string} [userId]
 * @returns {{ weighings: Array<object>, loading: boolean, error: Error | null }}
 *   pesagens da mais antiga para a mais recente
 */
export function useWeighings(userId = DEFAULT_USER_ID) {
  const { rows, loading, error } = useMeasurementRows(userId)
  const weighings = useMemo(() => groupWeighings(rows), [rows])
  return { weighings, loading, error }
}
