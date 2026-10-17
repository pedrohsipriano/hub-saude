// Painel do treino por cima da tela bloqueada (useLockScreen): só o cronômetro, os números do treino e
// Pausar/Retomar. Nada do resto do app aparece sem desbloquear; finalizar também exige desbloquear.
import { useClock } from '../../hooks/useClock.js'
import { formatDuration } from '../../workouts/format.js'
import { workoutNotificationContent } from '../../workouts/liveNotification.js'
import ui from '../../styles/controls.module.css'
import styles from './LockScreenWorkout.module.css'

/**
 * @param {object} props
 * @param {ReturnType<import('../../hooks/useWorkoutRecorder.js').useWorkoutRecorder>} props.recorder
 * @param {() => void} props.onUnlock - pede o desbloqueio do celular
 */
export default function LockScreenWorkout({ recorder, onUnlock }) {
  const { recording, live, weightKg } = recorder
  const paused = recording.status === 'paused'
  // Cronômetro de 1 s só enquanto grava.
  const now = useClock(!paused)
  // Mesmos números da notificação (distância, ritmo/velocidade, calorias).
  const content = workoutNotificationContent(recording, live, { now, weightKg })

  return (
    <main className={styles.screen}>
      <p className={styles.title}>
        {live.type.label} · <span className={paused ? styles.paused : styles.recording}>{paused ? 'pausado' : 'gravando'}</span>
      </p>
      <p className={styles.timer}>{formatDuration(content.elapsedMs)}</p>

      {/* "Distância: 2,15 km" → rótulo pequeno e valor grande. */}
      <dl className={styles.stats}>
        {content.lines.map((line) => {
          const [label, value] = line.split(': ')
          return (
            <div key={label} className={styles.stat}>
              <dt className={styles.statLabel}>{label}</dt>
              <dd className={styles.statValue}>{value}</dd>
            </div>
          )
        })}
      </dl>

      <div className={styles.actions}>
        {paused ? (
          <button type="button" className={`${ui.button} ${ui.buttonPrimary} ${styles.bigButton}`} onClick={recorder.resume}>
            Retomar
          </button>
        ) : (
          <button type="button" className={`${ui.button} ${ui.buttonPrimary} ${styles.bigButton}`} onClick={recorder.pause}>
            Pausar
          </button>
        )}
        <button type="button" className={`${ui.button} ${styles.bigButton}`} onClick={onUnlock}>
          Desbloquear e abrir o app
        </button>
      </div>
      <p className={styles.hint}>Para finalizar o treino ou ver outras telas, desbloqueie o celular.</p>
    </main>
  )
}
