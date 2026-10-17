// Notificação do treino em andamento no app Android (barra de notificações e tela bloqueada).
// - O cronômetro é contado pelo próprio Android, segundo a segundo, mesmo com o app parado.
// - Distância, ritmo e calorias são atualizados a cada ponto do GPS (no máximo a cada 5 s), na hora em
//   que o treino pausa ou retoma e, sem GPS (musculação, Muay Thai…), a cada 15 s.
// - A notificação nativa substitui a fixa do serviço de GPS ("Gravando o treino") e some ao finalizar.
import { useEffect, useRef } from 'react'
import { LocalNotifications } from '@capacitor/local-notifications'
import { HubBackground } from '../native/hubBackground.js'
import { isNativeApp } from '../platform.js'
import { workoutNotificationContent } from '../workouts/liveNotification.js'

// Intervalo mínimo entre duas atualizações com o mesmo estado (gravando/pausado).
const NOTIFY_EVERY_MS = 5000
// Atualização periódica (treinos sem GPS não recebem pontos).
const TICK_MS = 15000

/**
 * @param {object | null} recording - gravação em andamento (useWorkoutRecorder)
 * @param {object | null} live - números ao vivo (useWorkoutRecorder)
 * @param {number | null} weightKg - último peso do dono do treino (calorias; null = 70 kg estimados)
 */
export function useWorkoutNotification(recording, live, weightKg) {
  const native = isNativeApp()
  const latestRef = useRef({ recording: null, live: null, weightKg: null }) // estado mais recente, lido pelo intervalo
  const lastRef = useRef({ at: 0, status: 'start' }) // última atualização enviada ('start' = app abrindo)
  const active = Boolean(recording)

  // Android 13+: a notificação precisa da permissão de notificações (pedida ao começar o treino).
  useEffect(() => {
    if (native && active) LocalNotifications.requestPermissions().catch(() => {})
  }, [native, active])

  // A cada mudança do treino: atualiza (respeitando o intervalo mínimo) ou apaga ao terminar.
  useEffect(() => {
    if (!native) return
    latestRef.current = { recording, live, weightKg }
    post(latestRef.current, lastRef, false)
  }, [native, recording, live, weightKg])

  // Atualização periódica enquanto há treino.
  useEffect(() => {
    if (!native || !active) return undefined
    const id = setInterval(() => post(latestRef.current, lastRef, true), TICK_MS)
    return () => clearInterval(id)
  }, [native, active])
}

/**
 * Envia (ou apaga) a notificação.
 * @param {{ recording: object | null, live: object | null, weightKg: number | null }} state
 * @param {{ current: { at: number, status: string | null } }} lastRef - última atualização enviada
 * @param {boolean} force - ignora o intervalo mínimo
 */
function post({ recording, live, weightKg }, lastRef, force) {
  const last = lastRef.current
  if (!recording) {
    // Treino terminou (ou o app abriu sem treino): apaga a notificação que tiver sobrado.
    if (last.status !== null) {
      lastRef.current = { at: 0, status: null }
      HubBackground.workoutNotificationClear().catch(() => {})
    }
    return
  }
  const now = Date.now()
  if (!force && recording.status === last.status && now - last.at < NOTIFY_EVERY_MS) return
  lastRef.current = { at: now, status: recording.status }
  const content = workoutNotificationContent(recording, live, { now, weightKg })
  HubBackground.workoutNotification(content).catch(() => {})
}
