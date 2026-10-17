// Treino → Gravar: escolha do exercício e, durante o treino, cronômetro, distância, ritmo e mapa ao vivo.
import { useState } from 'react'
import LazyRouteMap from '../../components/RouteMap/LazyRouteMap.jsx'
import { useClock } from '../../hooks/useClock.js'
import { usePersistentState } from '../../hooks/usePersistentState.js'
import ui from '../../styles/controls.module.css'
import { ACTIVITY_TYPES } from '../../workouts/activityTypes.js'
import { formatDuration, formatKm, formatPace, formatSpeed, speedToPace } from '../../workouts/format.js'
import { NOT_AUTHORIZED, SEARCHING, UNAVAILABLE, openLocationSettings, recordsInBackground } from '../../workouts/locationSource.js'
import { movingTimeMs } from '../../workouts/recording.js'
import styles from './WorkoutPage.module.css'

// Precisão (m) acima da qual o ponto é descartado (mesmo limite de cleanTrack).
const WEAK_GPS_M = 30

// Dica para o PC (Chrome/Edge usam a localização do Windows, que vem do Wi-Fi; PC só no cabo costuma não ter).
const PC_HINT = 'No PC, ligue Configurações do Windows → Privacidade e segurança → Localização, inclusive "Permitir que aplicativos da área de trabalho acessem sua localização".'

/** Texto do estado do GPS durante a gravação. */
function gpsStatus(lastFix, gpsError) {
  if (gpsError?.code === NOT_AUTHORIZED) return { text: 'Localização negada: libere a localização do app para gravar o trajeto.', bad: true }
  // Falhas temporárias: a busca continua sozinha.
  if (gpsError?.code === SEARCHING || gpsError?.code === UNAVAILABLE) {
    const cause = gpsError.code === SEARCHING ? 'O GPS está demorando: fique em um lugar aberto.' : 'Localização indisponível no momento.'
    return { text: `${cause} Tentando de novo… ${recordsInBackground() ? '' : PC_HINT}`, bad: true }
  }
  if (gpsError) return { text: `GPS: ${gpsError.message}`, bad: true }
  if (!lastFix) return { text: 'Procurando sinal de GPS… fique em um lugar aberto.', bad: true }
  const accuracy = Math.round(lastFix.acc ?? 0)
  if (accuracy > WEAK_GPS_M) return { text: `Sinal de GPS fraco (±${accuracy} m): os pontos imprecisos são descartados.`, bad: true }
  return { text: `GPS ok (±${accuracy} m)`, bad: false }
}

/**
 * @param {object} props
 * @param {object} props.user - usuário atual (dono do treino que vai começar)
 * @param {ReturnType<import('../../hooks/useWorkoutRecorder.js').useWorkoutRecorder>} props.recorder
 * @param {(workout: object) => void} props.onFinished - treino salvo (abre o resumo)
 */
export default function RecordView({ user, recorder, onFinished }) {
  const [typeId, setTypeId] = usePersistentState('hubSaude.workoutType', 'run')
  // Confirmação de "Finalizar": o treino fica pausado enquanto a pessoa decide.
  // `resumeOnCancel` lembra se estava gravando, para "Continuar" voltar a gravar.
  const [confirming, setConfirming] = useState(false)
  const [resumeOnCancel, setResumeOnCancel] = useState(false)
  const [error, setError] = useState(null)
  const { recording, live, lastFix, gpsError, saving } = recorder
  const now = useClock(recording?.status === 'recording')

  // ---- Nenhum treino em andamento: escolher o exercício ----
  if (!recording) {
    const selected = ACTIVITY_TYPES.find((type) => type.id === typeId) ?? ACTIVITY_TYPES[0]
    return (
      <div className={ui.card}>
        <h3 className={ui.cardTitle}>Novo treino</h3>
        <div className={styles.typeGrid} role="group" aria-label="Tipo de exercício">
          {ACTIVITY_TYPES.map((type) => (
            <button
              key={type.id}
              type="button"
              aria-pressed={type.id === selected.id}
              className={`${styles.typeButton} ${type.id === selected.id ? styles.typeSelected : ''}`}
              onClick={() => setTypeId(type.id)}
            >
              {type.label}
              {type.gps && <span className={styles.gpsTag}>GPS</span>}
            </button>
          ))}
        </div>
        <p className={ui.hint}>
          {selected.gps
            ? recordsInBackground()
              ? 'Grava o trajeto pelo GPS do celular, mesmo com a tela apagada (aparece uma notificação enquanto grava).'
              : 'No navegador o GPS para quando a tela apaga ou a aba sai da frente. Para treinos de verdade, use o app Android.'
            : 'Sem GPS: conta o tempo e estima as calorias.'}
        </p>
        <div className={ui.actions}>
          <button type="button" className={`${ui.button} ${ui.buttonPrimary} ${styles.bigButton}`} onClick={() => recorder.start(selected.id, user.userId)}>
            Iniciar {selected.label.toLowerCase()}
          </button>
          {/* Teste no PC (sem GPS): percorre uma volta de 1,3 km, como os simuladores da balança e do relógio. */}
          {selected.gps && !recordsInBackground() && (
            <button
              type="button"
              className={`${ui.button} ${ui.buttonSecondary} ${styles.bigButton}`}
              onClick={() => recorder.start(selected.id, user.userId, { simulated: true })}
            >
              Simular trajeto
            </button>
          )}
        </div>
      </div>
    )
  }

  // ---- Treino em andamento ----
  const { type } = live
  const paused = recording.status === 'paused'
  // O relógio nunca fica antes do início do segmento atual (logo depois de retomar).
  const clock = Math.max(now, recording.segments.at(-1).start)
  const movingMs = movingTimeMs(recording, clock)
  const avgSpeed = movingMs > 0 ? live.distanceM / (movingMs / 1000) : null
  const status = type.gps ? gpsStatus(lastFix, gpsError) : null

  /** "Finalizar": pausa o cronômetro e o GPS e pergunta se salva, continua ou descarta. */
  const askFinish = () => {
    setResumeOnCancel(!paused)
    if (!paused) recorder.pause()
    setConfirming(true)
  }

  /** "Continuar": fecha a pergunta e volta a gravar se estava gravando antes. */
  const cancelFinish = () => {
    setConfirming(false)
    if (resumeOnCancel) recorder.resume()
  }

  /** Finaliza e salva; em caso de erro, mantém o treino em andamento. */
  const handleSave = async () => {
    setError(null)
    try {
      const workout = await recorder.finish()
      setConfirming(false)
      if (workout) onFinished(workout)
    } catch (saveError) {
      setError(`Não foi possível salvar o treino: ${saveError.message}`)
    }
  }

  return (
    <div>
      <div className={ui.card}>
        <div className={styles.liveHeader}>
          <h3 className={ui.cardTitle}>
            {type.label}
            {recording.simulated && ' (simulado)'}
          </h3>
          <span className={`${styles.badge} ${paused ? styles.badgePaused : styles.badgeRecording}`}>{paused ? 'Pausado' : 'Gravando'}</span>
        </div>
        {recording.userId !== user.userId && <p className={ui.hint}>Este treino está sendo gravado em outro perfil.</p>}

        {/* Cronômetro: tempo em movimento (as pausas não contam). */}
        <p className={styles.timer} aria-live="off">
          {formatDuration(movingMs)}
        </p>

        {type.gps && (
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Distância</span>
              <span className={styles.statValue}>{formatKm(live.distanceM)} km</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>{type.pace ? 'Ritmo atual' : 'Velocidade'}</span>
              <span className={styles.statValue}>
                {type.pace ? `${formatPace(speedToPace(live.speedNow))} /km` : `${formatSpeed(live.speedNow)} km/h`}
              </span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>{type.pace ? 'Ritmo médio' : 'Velocidade média'}</span>
              <span className={styles.statValue}>
                {type.pace ? `${formatPace(speedToPace(avgSpeed))} /km` : `${formatSpeed(avgSpeed)} km/h`}
              </span>
            </div>
          </div>
        )}

        {status && <p className={status.bad ? styles.gpsBad : ui.hint}>{status.text}</p>}
        {gpsError?.code === NOT_AUTHORIZED && (
          <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={() => void openLocationSettings()}>
            Abrir configurações do app
          </button>
        )}

        {/* Controles: pausar/retomar e finalizar (com confirmação). */}
        {confirming ? (
          <div className={styles.confirm}>
            <p>Finalizar o treino?</p>
            <div className={ui.actions}>
              <button type="button" className={`${ui.button} ${ui.buttonPrimary}`} disabled={saving} onClick={handleSave}>
                {saving ? 'Salvando…' : 'Salvar treino'}
              </button>
              <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} disabled={saving} onClick={cancelFinish}>
                Continuar
              </button>
              <button type="button" className={`${ui.button} ${styles.dangerButton}`} disabled={saving} onClick={recorder.discard}>
                Descartar
              </button>
            </div>
          </div>
        ) : (
          <div className={ui.actions}>
            {paused ? (
              <button type="button" className={`${ui.button} ${ui.buttonPrimary} ${styles.bigButton}`} onClick={recorder.resume}>
                Retomar
              </button>
            ) : (
              <button type="button" className={`${ui.button} ${ui.buttonPrimary} ${styles.bigButton}`} onClick={recorder.pause}>
                Pausar
              </button>
            )}
            <button type="button" className={`${ui.button} ${ui.buttonSecondary} ${styles.bigButton}`} onClick={askFinish}>
              Finalizar
            </button>
          </div>
        )}
        {error && <p className={ui.error}>{error}</p>}
      </div>

      {type.gps && <LazyRouteMap points={live.track} follow current={lastFix} size="live" />}
    </div>
  )
}
