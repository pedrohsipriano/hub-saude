// Lembretes diários (pesagem, refeições e água) no formato do plugin @capacitor/local-notifications,
// o canal "alarme" do Android (prioridade máxima: aparece por cima da tela, com som, vibração e luz)
// e os botões das notificações ("Bebi um copo", "Fiz ✓", "Adiar"…). Funções puras.
import { mealReminderIds, mealReminders } from '../diet/dietPlan.js'
import { parseTime, timeOnDay } from '../utils/date.js'
import { formatWater } from '../water/water.js'

// IDs fixos/faixas de IDs de cada tipo de notificação.
export const WEIGH_REMINDER_ID = 900
export const WATER_REMINDER_BASE = 2000
const WATER_MAX = 30
export const SNOOZE_BASE = 3000 // "adiar": 3000–3019, em rodízio
export const SNOOZE_SLOTS = 20
export const TEST_NOTIFICATION_ID = 3999

export const REMINDER_KIND = { WEIGH: 'weigh', MEAL: 'meal', WATER: 'water' }

// Sons do alarme: arquivos em android/app/src/main/res/raw (gerados por scripts/alarm-sounds.mjs)
// e o mesmo desenho de som tocado pelo app (reminders/alarmSound.js).
export const ALARM_SOUNDS = [
  { id: 'alarme', label: 'Alarme (forte)', file: 'hub_alarme.wav' },
  { id: 'suave', label: 'Suave', file: 'hub_suave.wav' },
  { id: 'bip', label: 'Bipe curto', file: 'hub_bip.wav' },
  { id: 'silencioso', label: 'Sem som (só vibrar)', file: null },
]

// Preferências padrão do alarme e do lembrete de água.
export const DEFAULT_ALARM = { style: 'alarm', sound: 'alarme', volume: 80, vibration: true, lights: true, snoozeMinutes: 10, inApp: true }
export const DEFAULT_WATER_REMINDER = { enabled: false, start: '08:00', end: '22:00', everyMinutes: 90, glassMl: 250 }

// Prefixo dos canais do app (o Android não deixa mudar um canal: cada combinação de ajustes tem o seu).
export const CHANNEL_PREFIX = 'hub-lembretes-'

// Botões que aparecem na notificação, por tipo de lembrete.
export const ACTION_TYPES = [
  { id: 'hub-water', actions: [{ id: 'drink', title: 'Bebi um copo' }, { id: 'snooze', title: 'Adiar' }] },
  {
    id: 'hub-meal',
    actions: [
      { id: 'done', title: 'Fiz ✓' },
      { id: 'off', title: 'Não fiz corretamente' },
      { id: 'snooze', title: 'Adiar' },
    ],
  },
  { id: 'hub-weigh', actions: [{ id: 'snooze', title: 'Adiar' }] },
]
const ACTION_TYPE_BY_KIND = { water: 'hub-water', meal: 'hub-meal', weigh: 'hub-weigh' }

/** Horários (minutos desde a meia-noite) dos lembretes de água entre o início e o fim. */
export function waterReminderMinutes({ start, end, everyMinutes }) {
  const from = parseTime(start)
  const to = parseTime(end)
  const step = Math.max(15, Number(everyMinutes) || 90)
  if (from == null || to == null || to < from) return []
  const minutes = []
  for (let m = from; m <= to && minutes.length < WATER_MAX; m += step) minutes.push(m)
  return minutes
}

/** Todos os IDs diários que o app pode ter agendado (para cancelar antes de reagendar). */
export function managedReminderIds() {
  return [WEIGH_REMINDER_ID, ...mealReminderIds(), ...Array.from({ length: WATER_MAX }, (_, i) => WATER_REMINDER_BASE + i)]
}

/**
 * Lista de lembretes a agendar conforme as preferências.
 * @param {object} params
 * @param {object | null} params.plan - plano alimentar
 * @param {{ mealReminders: boolean, weighReminder: { enabled: boolean, time: string }, waterReminder?: object }} params.settings
 * @param {number | null} [params.waterGoalMl] - meta de água do dia (vai no texto do lembrete)
 * @returns {Array<{ id: number, kind: string, title: string, body: string, hour: number, minute: number, extra: object }>}
 */
export function buildReminders({ plan, settings, waterGoalMl = null }) {
  const reminders = []
  if (settings.weighReminder?.enabled) {
    const minutes = parseTime(settings.weighReminder.time) ?? 7 * 60
    reminders.push({
      id: WEIGH_REMINDER_ID,
      kind: REMINDER_KIND.WEIGH,
      title: 'Hora de se pesar',
      body: 'Suba na balança antes de comer, sempre no mesmo horário, para comparar melhor.',
      hour: Math.floor(minutes / 60),
      minute: minutes % 60,
      extra: {},
    })
  }
  if (settings.mealReminders && plan) {
    // mealReminders segue a ordem de plan.meals: o índice liga o lembrete à refeição.
    mealReminders(plan).forEach((reminder, index) => {
      reminders.push({ ...reminder, kind: REMINDER_KIND.MEAL, extra: { mealId: plan.meals[index].id } })
    })
  }
  const water = settings.waterReminder
  if (water?.enabled) {
    waterReminderMinutes(water).forEach((minutes, index) => {
      reminders.push({
        id: WATER_REMINDER_BASE + index,
        kind: REMINDER_KIND.WATER,
        title: 'Hora de beber água 💧',
        body: `Beba ${formatWater(water.glassMl)}.${waterGoalMl ? ` Meta de hoje: ${formatWater(waterGoalMl)}.` : ''}`,
        hour: Math.floor(minutes / 60),
        minute: minutes % 60,
        extra: {},
      })
    })
  }
  return reminders
}

/**
 * Canal do Android para os lembretes, conforme os ajustes do alarme.
 * Estilo "alarme" = importância máxima (5): a notificação aparece por cima da tela, toca e vibra.
 * @param {object} alarm - ajustes (DEFAULT_ALARM)
 * @param {string} [lightColor] - cor da luz de notificação (#RRGGBB, vinda do tema)
 */
export function alarmChannel(alarm, lightColor) {
  const sound = ALARM_SOUNDS.find((option) => option.id === alarm.sound) ?? ALARM_SOUNDS[0]
  return {
    id: `${CHANNEL_PREFIX}${alarm.style}-${sound.id}-${alarm.vibration ? 'v' : 'nv'}-${alarm.lights ? 'l' : 'nl'}`,
    name: alarm.style === 'alarm' ? 'Lembretes (alarme)' : 'Lembretes',
    description: 'Refeições, água e pesagem',
    importance: alarm.style === 'alarm' ? 5 : 3,
    visibility: 1, // aparece na tela bloqueada
    ...(sound.file ? { sound: sound.file } : {}),
    vibration: Boolean(alarm.vibration),
    lights: Boolean(alarm.lights),
    ...(alarm.lights && lightColor ? { lightColor } : {}),
  }
}

/** Formato do plugin: repete todo dia no horário (schedule.on), no canal do alarme e com os botões do tipo. */
export function toNotificationSchema(reminder, { channelId } = {}) {
  return {
    id: reminder.id,
    title: reminder.title,
    body: reminder.body,
    schedule: { on: { hour: reminder.hour, minute: reminder.minute }, allowWhileIdle: true },
    ...(channelId ? { channelId } : {}),
    ...(reminder.kind ? { actionTypeId: ACTION_TYPE_BY_KIND[reminder.kind], extra: { kind: reminder.kind, ...reminder.extra } } : {}),
  }
}

/** Notificação de uma vez só (adiar ou testar) no horário `at`. */
export function oneShotSchema({ id, title, body, kind, extra = {}, at, channelId }) {
  return {
    id,
    title,
    body,
    schedule: { at: new Date(at), allowWhileIdle: true },
    ...(channelId ? { channelId } : {}),
    actionTypeId: ACTION_TYPE_BY_KIND[kind],
    extra: { kind, ...extra },
  }
}

/**
 * Lembretes cujo horário caiu entre `from` (exclusivo) e `to` (inclusivo): o "despertador" do navegador,
 * que não agenda notificações. Olha hoje e ontem (para a virada da meia-noite).
 */
export function dueReminders(reminders, from, to) {
  const today = new Date(to)
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const yesterdayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1).getTime()
  return reminders.filter((reminder) =>
    [todayStart, yesterdayStart].some((day) => {
      const at = timeOnDay(day, reminder.hour * 60 + reminder.minute)
      return at > from && at <= to
    }),
  )
}
