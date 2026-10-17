// Treino → Atividades: totais dos últimos 7 dias e a lista dos treinos salvos (com a miniatura do trajeto).
import { useMemo } from 'react'
import RouteThumbnail from '../../components/RouteThumbnail/RouteThumbnail.jsx'
import { useNow } from '../../hooks/useNow.js'
import ui from '../../styles/controls.module.css'
import { DAY_MS } from '../../utils/date.js'
import { formatDate, formatTime } from '../../utils/format.js'
import { activityType } from '../../workouts/activityTypes.js'
import { formatDuration, formatKm, formatPace, formatSpeed } from '../../workouts/format.js'
import styles from './WorkoutPage.module.css'

/** Linha de números de um treino: "5,23 km · 27:40 · 5:17 /km". */
function workoutLine(workout) {
  const type = activityType(workout.type)
  const parts = []
  if (workout.distanceM > 0) parts.push(`${formatKm(workout.distanceM)} km`)
  parts.push(formatDuration(workout.movingTimeMs))
  if (workout.distanceM > 0) parts.push(type.pace ? `${formatPace(workout.paceSecPerKm)} /km` : `${formatSpeed(workout.avgSpeedMs)} km/h`)
  else parts.push(`${workout.calories} kcal`)
  return parts.join(' · ')
}

/**
 * @param {object} props
 * @param {Array<object>} props.workouts - treinos do usuário (mais recentes primeiro)
 * @param {boolean} props.loading
 * @param {(id: string) => void} props.onOpen
 */
export default function WorkoutList({ workouts, loading, onOpen }) {
  const now = useNow()

  // Totais da semana (últimos 7 dias).
  const week = useMemo(() => {
    const recent = workouts.filter((workout) => now - workout.startedAt <= 7 * DAY_MS)
    return {
      count: recent.length,
      distanceM: recent.reduce((sum, workout) => sum + workout.distanceM, 0),
      movingTimeMs: recent.reduce((sum, workout) => sum + workout.movingTimeMs, 0),
      calories: recent.reduce((sum, workout) => sum + workout.calories, 0),
    }
  }, [workouts, now])

  if (loading) return <p>Carregando…</p>
  if (!workouts.length) return <p className={ui.card}>Nenhum treino ainda. Comece um em “Gravar”.</p>

  return (
    <div>
      <div className={ui.card}>
        <h3 className={ui.cardTitle}>Últimos 7 dias</h3>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Treinos</span>
            <span className={styles.statValue}>{week.count}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Distância</span>
            <span className={styles.statValue}>{formatKm(week.distanceM)} km</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Tempo</span>
            <span className={styles.statValue}>{formatDuration(week.movingTimeMs)}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Calorias</span>
            <span className={styles.statValue}>{week.calories} kcal</span>
          </div>
        </div>
      </div>

      <ul className={styles.list}>
        {workouts.map((workout) => (
          <li key={workout.id}>
            <button type="button" className={styles.item} onClick={() => onOpen(workout.id)}>
              <RouteThumbnail points={workout.points} fallback={activityType(workout.type).label.slice(0, 2).toUpperCase()} />
              <span className={styles.itemText}>
                <span className={styles.itemName}>{workout.name}</span>
                <span className={styles.itemDate}>
                  {formatDate(workout.startedAt)} às {formatTime(workout.startedAt)}
                </span>
                <span className={styles.itemLine}>{workoutLine(workout)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
