// Hook com os treinos salvos de um usuário (aba Treino → Atividades).
// Recarrega quando um treino é salvo, renomeado ou apagado.
import { useCallback, useEffect, useState } from 'react'
import { hub } from '../hub/hub.js'
import { deleteWorkout, listWorkouts, saveWorkout } from '../storage/db.js'
import { workoutMeasurementIds } from '../workouts/recording.js'

/**
 * @param {string | null} userId
 * @returns {{ workouts: Array<object>, loading: boolean, error: Error | null, rename: Function, update: Function, remove: Function }}
 */
export function useWorkouts(userId) {
  const [state, setState] = useState({ workouts: [], loading: true, error: null })

  useEffect(() => {
    if (!userId) return undefined
    let active = true
    // Lê os treinos do banco local (mais recentes primeiro).
    const load = () =>
      listWorkouts(userId)
        .then((workouts) => {
          if (active) setState({ workouts, loading: false, error: null })
        })
        .catch((error) => {
          if (active) setState((previous) => ({ ...previous, loading: false, error }))
        })
    load()
    const unsubscribe = hub.on('workouts:changed', load)
    return () => {
      active = false
      unsubscribe()
    }
  }, [userId])

  /** Troca o nome de um treino. */
  const rename = useCallback(async (workout, name) => {
    await saveWorkout({ ...workout, name: name.trim() || workout.name })
    hub.emit('workouts:changed')
  }, [])

  /** Grava campos novos num treino (ex.: o trajeto ajustado às ruas). */
  const update = useCallback(async (workout, patch) => {
    await saveWorkout({ ...workout, ...patch })
    hub.emit('workouts:changed')
  }, [])

  /** Apaga um treino e o resumo dele no banco de medições. */
  const remove = useCallback(async (workout) => {
    await deleteWorkout(workout, workoutMeasurementIds(workout))
    hub.emit('workouts:changed')
    hub.emit('measurements:changed')
  }, [])

  return { ...state, rename, update, remove }
}
