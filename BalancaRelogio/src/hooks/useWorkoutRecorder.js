// Hook da gravação de treino em andamento (fica no App para continuar gravando ao trocar de aba).
// Liga o GPS enquanto há um treino com trajeto, guarda o treino
// em andamento no aparelho (sobrevive a uma recarga do app) e, ao finalizar, salva e publica no hub.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { latestWeightByUser } from '../devices/scale/weighings.js'
import { hub } from '../hub/hub.js'
import { listAllMeasurements, saveWorkout } from '../storage/db.js'
import { activityType } from '../workouts/activityTypes.js'
import { cleanTrack, recentSpeed, trackDistance } from '../workouts/geo.js'
import { decodeTrack, encodeTrack, trackFromJson, trackToJson } from '../workouts/trackCodec.js'
import { startLocationWatch } from '../workouts/locationSource.js'
import {
  addPoint,
  buildWorkout,
  createRecording,
  finishRecording,
  pauseRecording,
  resumeRecording,
  workoutToMeasurement,
} from '../workouts/recording.js'

// Treino em andamento guardado no aparelho (localStorage).
const STORAGE_KEY = 'hubSaude.workoutInProgress'
// Intervalo mínimo entre gravações do treino em andamento (os pontos chegam a cada poucos segundos).
const SAVE_EVERY_MS = 10000

/** Lê o treino em andamento salvo (null se não houver). */
function loadInProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!saved || !['recording', 'paused'].includes(saved.status)) return null
    // Formato compacto (pontos em arrays de inteiros) ou antigo (pontos como objetos).
    const { packed, ...recording } = saved
    return packed ? { ...recording, points: decodeTrack(trackFromJson(packed), saved.startedAt) } : saved
  } catch {
    return null
  }
}

/**
 * Guarda (ou apaga, com null) o treino em andamento. Vai só o trajeto já limpo, em formato compacto:
 * menos espaço e menos trabalho a cada gravação (a cada 10 s).
 */
function storeInProgress(recording) {
  try {
    if (!recording) {
      localStorage.removeItem(STORAGE_KEY)
      return
    }
    const type = activityType(recording.type)
    const track = type.gps ? cleanTrack(recording.points, { maxSpeed: type.maxSpeed }) : []
    const rest = { ...recording }
    delete rest.points
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...rest, packed: trackToJson(encodeTrack(track, recording.startedAt)) }))
  } catch {
    // Sem armazenamento local, o treino vale só enquanto o app está aberto.
  }
}

export function useWorkoutRecorder() {
  const [recording, setRecording] = useState(loadInProgress)
  const [lastFix, setLastFix] = useState(null) // último ponto bruto do GPS (mostra a precisão)
  const [gpsError, setGpsError] = useState(null)
  const [saving, setSaving] = useState(false)

  // GPS ligado durante todo o treino com trajeto (também na pausa: mantém o sinal e o serviço ativos;
  // os pontos da pausa são ignorados por addPoint).
  const gpsActive = Boolean(recording && activityType(recording.type).gps)
  // Treino simulado (teste no PC): velocidade do trajeto de teste; 0 = GPS de verdade.
  const simSpeed = recording?.simulated ? activityType(recording.type).simSpeed : 0
  useEffect(() => {
    if (!gpsActive) return undefined
    let stop = null
    let cancelled = false
    startLocationWatch({
      simulate: simSpeed ? { speedMs: simSpeed } : null,
      onPoint: (point) => {
        setLastFix(point)
        setGpsError(null)
        setRecording((previous) => (previous ? addPoint(previous, point) : previous))
      },
      onError: (error) => setGpsError(error),
    })
      .then((stopWatch) => {
        if (cancelled) stopWatch()
        else stop = stopWatch
      })
      .catch((error) => setGpsError({ message: error.message }))
    return () => {
      cancelled = true
      stop?.()
    }
  }, [gpsActive, simSpeed])

  // Guarda o treino em andamento: na hora em que o estado muda (pausa/retoma) e, durante a gravação,
  // no máximo a cada SAVE_EVERY_MS.
  const lastStoreRef = useRef({ at: 0, status: null })
  useEffect(() => {
    if (!recording) {
      storeInProgress(null)
      lastStoreRef.current = { at: 0, status: null }
      return
    }
    const at = Date.now()
    const last = lastStoreRef.current
    if (recording.status !== last.status || at - last.at >= SAVE_EVERY_MS) {
      storeInProgress(recording)
      lastStoreRef.current = { at, status: recording.status }
    }
  }, [recording])

  // Números ao vivo: trajeto limpo, distância e velocidade dos últimos 30 s.
  const live = useMemo(() => {
    if (!recording) return null
    const type = activityType(recording.type)
    const track = type.gps ? cleanTrack(recording.points, { maxSpeed: type.maxSpeed }) : []
    return { type, track, distanceM: trackDistance(track), speedNow: recentSpeed(track) }
  }, [recording])

  /**
   * Começa um treino do tipo escolhido para o usuário.
   * @param {string} typeId
   * @param {string} userId
   * @param {{ simulated?: boolean }} [options] - simulated: trajeto de teste em vez do GPS
   */
  const start = useCallback((typeId, userId, { simulated = false } = {}) => {
    setRecording({ ...createRecording(typeId, Date.now()), userId, simulated })
    setLastFix(null)
    setGpsError(null)
  }, [])

  /** Pausa: o tempo parado não conta. */
  const pause = useCallback(() => setRecording((previous) => previous && pauseRecording(previous, Date.now())), [])

  /** Retoma a gravação (abre um segmento novo do trajeto). */
  const resume = useCallback(() => setRecording((previous) => previous && resumeRecording(previous, Date.now())), [])

  /** Descarta o treino em andamento sem salvar. */
  const discard = useCallback(() => setRecording(null), [])

  /**
   * Finaliza, salva o treino e publica o resumo no hub (banco de medições, resumo da semana, Health Connect).
   * @returns {Promise<object | null>} o treino salvo
   */
  const finish = useCallback(async () => {
    if (!recording) return null
    setSaving(true)
    try {
      const finished = finishRecording(recording, Date.now())
      // Calorias com o último peso do dono do treino (sem pesagem: 70 kg, marcado como estimativa).
      const weightKg = latestWeightByUser(await listAllMeasurements()).get(recording.userId) ?? null
      const workout = buildWorkout(finished, { weightKg })
      await saveWorkout(workout)
      hub.emit('measurement', workoutToMeasurement(workout, workout.userId))
      hub.emit('workouts:changed', workout)
      setRecording(null)
      return workout
    } finally {
      setSaving(false)
    }
  }, [recording])

  return { recording, live, lastFix, gpsError, saving, start, pause, resume, finish, discard }
}
