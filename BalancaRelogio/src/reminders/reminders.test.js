// Testes dos lembretes diários, do canal de alarme e da água.
import { describe, expect, it } from 'vitest'
import { normalizePlan } from '../diet/dietPlan.js'
import { formatWater, recommendedWater, waterByDay, waterOfDay, waterToMeasurement } from '../water/water.js'
import {
  DEFAULT_ALARM,
  WATER_REMINDER_BASE,
  WEIGH_REMINDER_ID,
  alarmChannel,
  buildReminders,
  dueReminders,
  managedReminderIds,
  oneShotSchema,
  toNotificationSchema,
  waterReminderMinutes,
} from './reminders.js'

const PLAN = normalizePlan({ meals: [{ id: 'cafe', name: 'Café da manhã', time: '07:00', options: [{ items: [{ main: 'Ovo - 2' }] }] }] })

describe('buildReminders', () => {
  it('pesagem + refeições conforme as preferências', () => {
    const reminders = buildReminders({ plan: PLAN, settings: { mealReminders: true, weighReminder: { enabled: true, time: '06:45' } } })
    expect(reminders.map((r) => [r.id, r.hour, r.minute, r.kind])).toEqual([
      [WEIGH_REMINDER_ID, 6, 45, 'weigh'],
      [1000, 7, 0, 'meal'],
    ])
    expect(reminders[1].extra).toEqual({ mealId: 'cafe' })
    expect(managedReminderIds()).toContain(WEIGH_REMINDER_ID)
    expect(managedReminderIds()).toContain(WATER_REMINDER_BASE)
  })

  it('tudo desligado → nenhum lembrete', () => {
    expect(buildReminders({ plan: PLAN, settings: { mealReminders: false, weighReminder: { enabled: false } } })).toEqual([])
  })

  it('água: de X em X minutos entre o início e o fim, com a meta no texto', () => {
    expect(waterReminderMinutes({ start: '08:00', end: '12:00', everyMinutes: 90 })).toEqual([480, 570, 660])
    const reminders = buildReminders({
      plan: null,
      settings: { mealReminders: false, weighReminder: { enabled: false }, waterReminder: { enabled: true, start: '08:00', end: '09:00', everyMinutes: 60, glassMl: 250 } },
      waterGoalMl: 2600,
    })
    expect(reminders.map((r) => [r.id, r.hour, r.minute])).toEqual([
      [WATER_REMINDER_BASE, 8, 0],
      [WATER_REMINDER_BASE + 1, 9, 0],
    ])
    expect(reminders[0].body).toBe('Beba 250 ml. Meta de hoje: 2,6 L.')
  })

  it('formato do plugin: repete todo dia, no canal do alarme, com os botões do tipo', () => {
    expect(toNotificationSchema({ id: 1, title: 't', body: 'b', hour: 7, minute: 0 })).toEqual({
      id: 1,
      title: 't',
      body: 'b',
      schedule: { on: { hour: 7, minute: 0 }, allowWhileIdle: true },
    })
    const meal = toNotificationSchema({ id: 2, kind: 'meal', title: 't', body: 'b', hour: 7, minute: 0, extra: { mealId: 'cafe' } }, { channelId: 'c' })
    expect(meal).toMatchObject({ channelId: 'c', actionTypeId: 'hub-meal', extra: { kind: 'meal', mealId: 'cafe' } })
    expect(oneShotSchema({ id: 3000, title: 't', body: 'b', kind: 'water', at: 1000, channelId: 'c' }).schedule.at).toEqual(new Date(1000))
  })
})

describe('canal de alarme', () => {
  it('alarme = importância máxima com som, vibração e luz; cada combinação tem o seu id', () => {
    const channel = alarmChannel(DEFAULT_ALARM, '#0f9d8f')
    expect(channel).toMatchObject({ importance: 5, sound: 'hub_alarme.wav', vibration: true, lights: true, lightColor: '#0f9d8f', visibility: 1 })
    const quiet = alarmChannel({ ...DEFAULT_ALARM, style: 'normal', sound: 'silencioso', lights: false })
    expect(quiet.importance).toBe(3)
    expect(quiet.sound).toBeUndefined()
    expect(quiet.id).not.toBe(channel.id)
  })

  it('despertador do navegador: lembretes que venceram desde a última olhada', () => {
    const reminders = [
      { id: 1, hour: 7, minute: 0 },
      { id: 2, hour: 12, minute: 0 },
      { id: 3, hour: 23, minute: 50 },
    ]
    const day = (h, m = 0) => new Date(2026, 9, 17, h, m).getTime()
    expect(dueReminders(reminders, day(6, 59), day(7, 0)).map((r) => r.id)).toEqual([1])
    expect(dueReminders(reminders, day(7, 1), day(11, 0))).toEqual([])
    // Virada da meia-noite: o das 23:50 de ontem.
    expect(dueReminders(reminders, new Date(2026, 9, 16, 23, 45).getTime(), day(0, 5)).map((r) => r.id)).toEqual([3])
  })
})

describe('água', () => {
  it('meta pela altura e pelo peso (+ treino)', () => {
    // 70 kg e 171 cm: 35 ml × 70 = 2450; superfície 1,82 m² × 1,5 L = 2750; média 2600.
    expect(recommendedWater({ weightKg: 70, heightCm: 171 })).toMatchObject({ goalMl: 2600, byWeightMl: 2450, byBodySurfaceMl: 2750, bodySurfaceM2: 1.82 })
    expect(recommendedWater({ weightKg: 70, heightCm: 171, workoutMinutes: 60 }).goalMl).toBe(3100)
    expect(recommendedWater({ weightKg: 70 }).goalMl).toBe(2450)
    expect(recommendedWater({}).estimated).toBe(true)
  })

  it('copos do dia, total por dia e formato', () => {
    const at = (day, hour) => new Date(2026, 9, day, hour).getTime()
    const rows = [
      { id: 'a', device: 'water', metric: 'waterMl', timestamp: at(17, 9), value: 250 },
      { id: 'b', device: 'water', metric: 'waterMl', timestamp: at(17, 14), value: 500 },
      { id: 'c', device: 'water', metric: 'waterMl', timestamp: at(16, 20), value: 300 },
    ]
    expect(waterOfDay(rows, at(17, 23))).toEqual({
      totalMl: 750,
      drinks: [
        { id: 'a', at: at(17, 9), ml: 250 },
        { id: 'b', at: at(17, 14), ml: 500 },
      ],
    })
    expect(waterByDay(rows, { days: 2, now: at(17, 23) }).map((d) => d.totalMl)).toEqual([300, 750])
    expect(formatWater(2600)).toBe('2,6 L')
    expect(formatWater(250)).toBe('250 ml')
    expect(waterToMeasurement('u', 250, 5).metrics[0]).toEqual({ metric: 'waterMl', value: 250, unit: 'ml' })
  })
})
