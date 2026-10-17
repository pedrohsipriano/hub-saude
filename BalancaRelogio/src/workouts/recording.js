// Gravação de um treino (lógica pura): iniciar, pausar, retomar, adicionar pontos de GPS e finalizar.
// Cada pausa fecha um "segmento"; o tempo em movimento é a soma dos segmentos.
// Também monta o resumo final (distância, ritmo, parciais, calorias) e o evento do hub.
import { activityType, defaultWorkoutName } from './activityTypes.js'
import { cleanTrack, elevationGain, splits, trackDistance } from './geo.js'

export const WORKOUT_DEVICE = 'workout'

/** Começa uma gravação. */
export function createRecording(typeId, now) {
  return { type: typeId, status: 'recording', startedAt: now, endedAt: null, segments: [{ start: now, end: null }], points: [] }
}

/** Pausa (fecha o segmento atual). */
export function pauseRecording(recording, now) {
  if (recording.status !== 'recording') return recording
  const segments = recording.segments.map((segment, i) => (i === recording.segments.length - 1 ? { ...segment, end: now } : segment))
  return { ...recording, status: 'paused', segments }
}

/** Retoma (abre um segmento novo). */
export function resumeRecording(recording, now) {
  if (recording.status !== 'paused') return recording
  return { ...recording, status: 'recording', segments: [...recording.segments, { start: now, end: null }] }
}

/** Adiciona um ponto de GPS (só enquanto grava; pontos durante a pausa são ignorados). */
export function addPoint(recording, point) {
  if (recording.status !== 'recording') return recording
  return { ...recording, points: [...recording.points, { ...point, segment: recording.segments.length - 1 }] }
}

/** Finaliza. */
export function finishRecording(recording, now) {
  const paused = pauseRecording(recording, now)
  return { ...paused, status: 'finished', endedAt: now }
}

/** Tempo em movimento (ms) até `now`. */
export function movingTimeMs(recording, now) {
  return recording.segments.reduce((sum, segment) => sum + ((segment.end ?? now) - segment.start), 0)
}

/** Distância (m) com os pontos ruins já descartados. */
export function recordingDistance(recording) {
  const type = activityType(recording.type)
  return type.gps ? trackDistance(cleanTrack(recording.points, { maxSpeed: type.maxSpeed })) : 0
}

/**
 * Resumo final de uma gravação.
 * @param {object} recording - gravação finalizada
 * @param {{ weightKg?: number | null }} [options] - peso para estimar calorias (padrão 70 kg)
 */
export function summarizeRecording(recording, { weightKg = null } = {}) {
  const type = activityType(recording.type)
  const end = recording.endedAt ?? recording.segments.at(-1)?.end ?? recording.startedAt
  const moving = movingTimeMs(recording, end)
  const track = type.gps ? cleanTrack(recording.points, { maxSpeed: type.maxSpeed }) : []
  const distanceM = trackDistance(track)
  const hours = moving / 3600000
  return {
    type: recording.type,
    startedAt: recording.startedAt,
    endedAt: end,
    movingTimeMs: moving,
    elapsedMs: end - recording.startedAt,
    distanceM: Math.round(distanceM),
    avgSpeedMs: moving > 0 ? distanceM / (moving / 1000) : 0,
    paceSecPerKm: distanceM > 0 ? moving / 1000 / (distanceM / 1000) : null,
    elevationGainM: elevationGain(track),
    splits: splits(track),
    // Calorias estimadas: MET × peso (kg) × horas.
    calories: Math.round(type.met * (weightKg ?? 70) * hours),
    weightKnown: weightKg != null,
    points: track,
  }
}

/**
 * Treino pronto para salvar: resumo + id, dono e nome padrão.
 * @param {object} recording - gravação finalizada (com userId)
 * @param {{ weightKg?: number | null }} [options]
 */
export function buildWorkout(recording, { weightKg = null } = {}) {
  const summary = summarizeRecording(recording, { weightKg })
  return {
    ...summary,
    id: `${recording.userId}|${recording.startedAt}`,
    userId: recording.userId,
    name: `${defaultWorkoutName(recording.type, recording.startedAt)}${recording.simulated ? ' (simulado)' : ''}`,
    simulated: Boolean(recording.simulated),
  }
}

/** Ids das linhas do banco de medições geradas pelo treino (mesma regra de hub.js). */
export function workoutMeasurementIds(workout) {
  return ['workoutDistance', 'workoutDuration', 'workoutCalories'].map(
    (metric) => `${workout.userId}|${WORKOUT_DEVICE}|${metric}|${workout.startedAt}`,
  )
}

/** Evento "measurement" do hub com o resumo do treino (vai para o banco, os cruzamentos e o Health Connect). */
export function workoutToMeasurement(workout, userId) {
  return {
    userId,
    device: WORKOUT_DEVICE,
    timestamp: workout.startedAt,
    metrics: [
      { metric: 'workoutDistance', value: workout.distanceM, unit: 'm' },
      { metric: 'workoutDuration', value: Math.round(workout.movingTimeMs / 1000), unit: 's' },
      { metric: 'workoutCalories', value: workout.calories, unit: 'kcal' },
    ],
    workout: { id: workout.id, type: workout.type, endedAt: workout.endedAt },
  }
}
