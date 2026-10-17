// Hook da água de um usuário: total de hoje, copos, meta pela altura/peso (+ treino do dia) e os últimos 7 dias.
import { useCallback, useMemo } from 'react'
import { groupWeighings } from '../devices/scale/weighings.js'
import { hub } from '../hub/hub.js'
import { deleteMeasurement } from '../storage/db.js'
import { recommendedWater, waterByDay, waterOfDay, waterToMeasurement } from '../water/water.js'
import { WORKOUT_DEVICE } from '../workouts/recording.js'
import { useMeasurementRows } from './useMeasurementRows.js'
import { useNow } from './useNow.js'

/** Meia-noite local de hoje. */
function startOfToday(now) {
  const date = new Date(now)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/**
 * @param {object | null} user - perfil (altura em heightCm)
 */
export function useWater(user) {
  const userId = user?.userId ?? null
  const { rows } = useMeasurementRows(userId)
  const now = useNow()

  const today = useMemo(() => waterOfDay(rows, now), [rows, now])
  const days = useMemo(() => waterByDay(rows, { days: 7, now }), [rows, now])

  // Meta: último peso da balança, altura do perfil e minutos de treino de hoje.
  const goal = useMemo(() => {
    const weightKg = groupWeighings(rows).at(-1)?.weightKg ?? null
    const dayStart = startOfToday(now)
    const workoutSeconds = rows
      .filter((row) => row.device === WORKOUT_DEVICE && row.metric === 'workoutDuration' && row.timestamp >= dayStart)
      .reduce((sum, row) => sum + row.value, 0)
    return recommendedWater({ weightKg, heightCm: user?.heightCm ?? null, workoutMinutes: workoutSeconds / 60 })
  }, [rows, now, user?.heightCm])

  /** Registra um copo (ml). */
  const add = useCallback(
    (ml) => {
      if (userId && ml > 0) hub.emit('measurement', waterToMeasurement(userId, Math.round(ml)))
    },
    [userId],
  )

  /** Apaga um copo registrado por engano. */
  const remove = useCallback(async (drink) => {
    await deleteMeasurement(drink.id)
    hub.emit('measurements:changed')
  }, [])

  return { todayMl: today.totalMl, drinks: today.drinks, days, goal, add, remove }
}
