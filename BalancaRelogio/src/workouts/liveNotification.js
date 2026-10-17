// Conteúdo da notificação do treino em andamento (lógica pura, testada).
// A notificação aparece na barra e na tela bloqueada: o cronômetro é contado pelo próprio Android
// (a partir de elapsedMs) e o texto traz os números do momento: distância, ritmo ou velocidade e calorias.
import { activityType } from './activityTypes.js'
import { formatDuration, formatKm, formatPace, formatSpeed, speedToPace } from './format.js'
import { movingTimeMs } from './recording.js'

// Peso usado nas calorias quando ainda não há pesagem (o valor sai com "~").
const DEFAULT_WEIGHT_KG = 70

/**
 * Monta o conteúdo da notificação.
 * @param {object} recording - gravação em andamento (createRecording)
 * @param {{ distanceM: number, speedNow: number | null } | null} live - números ao vivo (useWorkoutRecorder)
 * @param {{ now: number, weightKg?: number | null }} options
 * @returns {{ title: string, text: string, lines: string[], shortText: string | null, elapsedMs: number, paused: boolean }}
 *   title/text: linhas da notificação recolhida; lines: notificação expandida;
 *   shortText: texto curto do chip da barra de status (Android 16+); elapsedMs: tempo em movimento.
 */
export function workoutNotificationContent(recording, live, { now, weightKg = null }) {
  const type = activityType(recording.type)
  const paused = recording.status === 'paused'
  const elapsedMs = movingTimeMs(recording, now)

  // Calorias: MET × peso × horas em movimento (mesma conta do resumo final).
  const kcal = Math.round(type.met * (weightKg ?? DEFAULT_WEIGHT_KG) * (elapsedMs / 3600000))
  const kcalText = `${weightKg == null ? '~' : ''}${kcal} kcal`

  const parts = [] // linha curta: "2,15 km · 5:32 /km · 180 kcal"
  const lines = [] // notificação expandida, uma informação por linha
  let shortText = null

  if (type.gps) {
    const distanceM = live?.distanceM ?? 0
    const km = `${formatKm(distanceM)} km`
    parts.push(km)
    lines.push(`Distância: ${km}`)
    if (type.pace) {
      const average = `${formatPace(distanceM > 0 ? elapsedMs / 1000 / (distanceM / 1000) : null)} /km`
      parts.push(average)
      lines.push(`Ritmo médio: ${average}`)
      if (!paused) lines.push(`Ritmo atual: ${formatPace(speedToPace(live?.speedNow ?? 0))} /km`)
    } else {
      const average = `${formatSpeed(elapsedMs > 0 ? distanceM / (elapsedMs / 1000) : 0)} km/h`
      parts.push(average)
      lines.push(`Velocidade média: ${average}`)
      if (!paused) lines.push(`Velocidade atual: ${formatSpeed(live?.speedNow ?? 0)} km/h`)
    }
    shortText = km
  }
  parts.push(kcalText)
  lines.push(`Calorias: ${kcalText}`)

  // Pausado: o cronômetro da notificação para, então o tempo vai no título.
  const state = paused ? `pausado em ${formatDuration(elapsedMs)}` : 'gravando'
  return { title: `${type.label} · ${state}`, text: parts.join(' · '), lines, shortText, elapsedMs, paused }
}
