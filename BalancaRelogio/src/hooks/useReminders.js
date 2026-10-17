// Hook dos lembretes (pesagem, refeições e água) e do alarme.
// - App Android: agenda notificações diárias no canal "alarme" (prioridade máxima: aparecem por cima da tela,
//   com som, vibração e luz) e com botões ("Bebi um copo", "Fiz ✓", "Adiar"). Com o app aberto, o lembrete
//   também aparece como alarme em tela cheia (AlarmOverlay).
// - Navegador: não há notificação agendada; um "despertador" confere a cada 20 s se algum lembrete venceu e
//   mostra o alarme na tela (e a notificação do Windows, se permitida) enquanto a página estiver aberta.
import { LocalNotifications } from '@capacitor/local-notifications'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isNativeApp } from '../platform.js'
import {
  ACTION_TYPES,
  CHANNEL_PREFIX,
  SNOOZE_BASE,
  SNOOZE_SLOTS,
  TEST_NOTIFICATION_ID,
  alarmChannel,
  buildReminders,
  dueReminders,
  managedReminderIds,
  oneShotSchema,
  toNotificationSchema,
} from '../reminders/reminders.js'

// Intervalo do "despertador" do navegador.
const WEB_TICK_MS = 20000

/** Lê uma cor do tema (tokens.css) — o Android quer a cor da luz em #RRGGBB. */
function themeColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || undefined
}

/** Alarme (o que a tela cheia mostra) a partir de uma notificação do plugin. */
function alarmFromNotification(notification) {
  return {
    kind: notification.extra?.kind ?? 'water',
    title: notification.title,
    body: notification.body,
    extra: notification.extra ?? {},
  }
}

/** Alarme a partir de um lembrete de buildReminders. */
const alarmFromReminder = (reminder) => ({ kind: reminder.kind, title: reminder.title, body: reminder.body, extra: reminder.extra ?? {} })

/** Notificação do sistema no navegador (Windows), quando permitida. */
function showWebNotification(alarm, requireInteraction) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    new Notification(alarm.title, { body: alarm.body, tag: `hub-${alarm.kind}`, requireInteraction })
  } catch {
    // Alguns navegadores só mostram notificação por service worker: o alarme na tela continua valendo.
  }
}

/**
 * @param {object} params
 * @param {object | null} params.plan - plano alimentar do dono do celular
 * @param {object} params.settings - preferências (mealReminders, weighReminder, waterReminder, alarm)
 * @param {number | null} [params.waterGoalMl] - meta de água do dia (vai no texto do lembrete)
 * @param {(kind: string, actionId: string, extra: object) => void} [params.onAction] - "Bebi um copo", "Fiz ✓"…
 */
export function useReminders({ plan, settings, waterGoalMl = null, onAction }) {
  const native = isNativeApp()
  const [status, setStatus] = useState({ permission: native ? 'unknown' : 'unsupported', scheduled: 0, error: null })
  const [webPermission, setWebPermission] = useState(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission))
  // Alarme mostrado em tela cheia agora (null = nenhum).
  const [activeAlarm, setActiveAlarm] = useState(null)
  const alarmSettings = settings.alarm
  const reminders = useMemo(() => buildReminders({ plan, settings, waterGoalMl }), [plan, settings, waterGoalMl])

  // Valores lidos dentro dos ouvintes e do "despertador" (refs atualizados em efeito).
  const remindersRef = useRef(reminders)
  const alarmRef = useRef(alarmSettings)
  const onActionRef = useRef(onAction)
  const snoozeCounter = useRef(0)
  const webQueue = useRef([]) // navegador: adiados e testes { at, alarm }
  useEffect(() => {
    remindersRef.current = reminders
    alarmRef.current = alarmSettings
    onActionRef.current = onAction
  }, [reminders, alarmSettings, onAction])

  /** Pede a permissão de notificação (Android 13+ mostra a janela do sistema; no PC, a do navegador). */
  const requestPermission = useCallback(async () => {
    if (native) {
      const result = await LocalNotifications.requestPermissions()
      setStatus((previous) => ({ ...previous, permission: result.display }))
    } else if (typeof Notification !== 'undefined') {
      setWebPermission(await Notification.requestPermission())
    }
  }, [native])

  // Android: canal do alarme, botões das notificações e reagendamento sempre que algo muda.
  useEffect(() => {
    if (!native) return undefined
    let active = true
    ;(async () => {
      const permission = (await LocalNotifications.checkPermissions()).display
      if (!active) return
      if (permission !== 'granted') {
        setStatus({ permission, scheduled: 0, error: null })
        return
      }
      const channel = alarmChannel(alarmSettings, themeColor('--color-accent'))
      await LocalNotifications.createChannel(channel)
      // Canais de ajustes anteriores saem (o Android não deixa alterar um canal existente).
      const { channels } = await LocalNotifications.listChannels()
      await Promise.all(
        channels.filter((other) => other.id.startsWith(CHANNEL_PREFIX) && other.id !== channel.id).map((other) => LocalNotifications.deleteChannel({ id: other.id })),
      )
      await LocalNotifications.registerActionTypes({ types: ACTION_TYPES })
      // Cancela os lembretes antigos do app e agenda os atuais.
      await LocalNotifications.cancel({ notifications: managedReminderIds().map((id) => ({ id })) })
      if (reminders.length) {
        await LocalNotifications.schedule({ notifications: reminders.map((reminder) => toNotificationSchema(reminder, { channelId: channel.id })) })
      }
      if (active) setStatus({ permission, scheduled: reminders.length, error: null })
    })().catch((error) => active && setStatus((previous) => ({ ...previous, error: error.message })))
    return () => {
      active = false
    }
  }, [native, reminders, alarmSettings, status.permission])

  /** Adia o alarme: o mesmo lembrete volta em N minutos. */
  const snooze = useCallback(
    async (alarm) => {
      const at = Date.now() + (alarmRef.current.snoozeMinutes ?? 10) * 60000
      if (native) {
        const id = SNOOZE_BASE + (snoozeCounter.current % SNOOZE_SLOTS)
        snoozeCounter.current += 1
        await LocalNotifications.schedule({
          notifications: [oneShotSchema({ id, title: alarm.title, body: alarm.body, kind: alarm.kind, extra: alarm.extra, at, channelId: alarmChannel(alarmRef.current).id })],
        })
      } else {
        webQueue.current.push({ at, alarm })
      }
    },
    [native],
  )

  /** Ação de um alarme (da tela cheia ou do botão da notificação). */
  const handleAction = useCallback(
    (alarm, actionId) => {
      if (actionId === 'snooze') void snooze(alarm)
      else if (actionId !== 'dismiss' && actionId !== 'tap') onActionRef.current?.(alarm.kind, actionId, alarm.extra)
    },
    [snooze],
  )
  const handleActionRef = useRef(handleAction)
  useEffect(() => {
    handleActionRef.current = handleAction
  }, [handleAction])

  // Android: notificação chegando com o app aberto → alarme na tela; toque/botão na notificação → ação.
  useEffect(() => {
    if (!native) return undefined
    const handles = []
    let cancelled = false
    ;(async () => {
      const received = await LocalNotifications.addListener('localNotificationReceived', (notification) => {
        if (alarmRef.current.inApp) setActiveAlarm(alarmFromNotification(notification))
      })
      const performed = await LocalNotifications.addListener('localNotificationActionPerformed', ({ actionId, notification }) => {
        const alarm = alarmFromNotification(notification)
        if (actionId === 'tap') setActiveAlarm(alarm)
        else handleActionRef.current(alarm, actionId)
      })
      if (cancelled) [received, performed].forEach((handle) => handle.remove())
      else handles.push(received, performed)
    })()
    return () => {
      cancelled = true
      handles.forEach((handle) => handle.remove())
    }
  }, [native])

  // Navegador: "despertador" que confere os lembretes vencidos e a fila de adiados/testes.
  useEffect(() => {
    if (native) return undefined
    let last = Date.now()
    const id = setInterval(() => {
      const now = Date.now()
      const fired = dueReminders(remindersRef.current, last, now).map(alarmFromReminder)
      fired.push(...webQueue.current.filter((item) => item.at <= now).map((item) => item.alarm))
      webQueue.current = webQueue.current.filter((item) => item.at > now)
      last = now
      if (!fired.length) return
      const alarm = fired.at(-1)
      showWebNotification(alarm, alarmRef.current.style === 'alarm')
      if (alarmRef.current.inApp) setActiveAlarm(alarm)
    }, WEB_TICK_MS)
    return () => clearInterval(id)
  }, [native])

  /** Mostra o alarme em tela cheia agora (botão "Testar alarme"). */
  const testAlarm = useCallback(() => {
    setActiveAlarm({ kind: 'water', title: 'Teste do alarme 💧', body: 'É assim que os lembretes vão aparecer.', extra: { test: true } })
  }, [])

  /** Manda uma notificação de teste em 10 s (dá tempo de bloquear a tela para ver como chega). */
  const testNotification = useCallback(async () => {
    const at = Date.now() + 10000
    const alarm = { kind: 'water', title: 'Teste de notificação 💧', body: 'Os lembretes chegam assim na barra de notificações.', extra: { test: true } }
    if (native) {
      await LocalNotifications.schedule({
        notifications: [oneShotSchema({ id: TEST_NOTIFICATION_ID, ...alarm, at, channelId: alarmChannel(alarmRef.current).id })],
      })
    } else {
      webQueue.current.push({ at, alarm })
    }
  }, [native])

  /** Fecha o alarme da tela, executando a ação escolhida ("drink", "done", "off", "snooze" ou "dismiss"). */
  const resolveAlarm = useCallback(
    (actionId) => {
      if (activeAlarm && !activeAlarm.extra?.test) handleAction(activeAlarm, actionId)
      setActiveAlarm(null)
    },
    [activeAlarm, handleAction],
  )

  return { native, status, webPermission, requestPermission, activeAlarm, resolveAlarm, testAlarm, testNotification }
}
