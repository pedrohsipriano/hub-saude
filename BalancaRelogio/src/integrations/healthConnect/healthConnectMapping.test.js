// Testes da conversão hub ↔ Health Connect.
import { describe, expect, it } from 'vitest'
import { SEX_MALE } from '../../devices/scale/bodyComposition.js'
import { weighingToMeasurement } from '../../devices/scale/weighings.js'
import { watchSyncToMeasurement } from '../../devices/watch/watchMeasurements.js'
import { workoutToMeasurement } from '../../workouts/recording.js'
import {
  APP_PACKAGE_ID,
  PERMISSION_SCOPES,
  buildSyncReport,
  catchUpEvents,
  connectionState,
  measurementToSamples,
  readSamplesToMeasurement,
} from './healthConnectMapping.js'

const PROFILE = { heightCm: 171, age: 23, sex: SEX_MALE }
const at = (hour, minute = 0) => new Date(2026, 9, 16, hour, minute).getTime()

describe('measurementToSamples — balança', () => {
  const event = weighingToMeasurement({ timestamp: at(7, 30), weightKg: 69.95, impedanceOhm: 600 }, 'default')

  it('envia peso, % de gordura e TMB (fórmulas do OKOK)', () => {
    const samples = measurementToSamples(event, { profile: PROFILE })
    expect(samples.map((s) => s.options.dataType)).toEqual(['weight', 'bodyFat', 'basalCalories'])
    expect(samples[0].options).toEqual({ dataType: 'weight', value: 69.95, startDate: new Date(at(7, 30)).toISOString() })
    expect(samples[1].options.value).toBeCloseTo(21.26, 2)
    expect(samples[0].key).toBe(`weight|${at(7, 30)}`)
  })

  it('sem perfil envia só o peso; desligado não envia nada', () => {
    expect(measurementToSamples(event, { profile: null })).toHaveLength(1)
    expect(measurementToSamples(event, { profile: PROFILE, exportScale: false })).toEqual([])
  })
})

describe('measurementToSamples — relógio', () => {
  const heartRate = new Array(48).fill(0)
  heartRate[37] = 68
  const event = watchSyncToMeasurement(
    {
      syncedAt: at(18, 35),
      battery: null,
      summary: { steps: 500 },
      heartRate,
      spo2: null,
      bloodPressure: Array.from({ length: 48 }, (_, i) => (i === 37 ? { systolic: 116, diastolic: 76 } : { systolic: 0, diastolic: 0 })),
      // 300 passos às 17 h (hora completa) e 200 às 18 h (hora atual, ainda mudando).
      hourSteps: Array.from({ length: 24 }, (_, h) => ({ steps: h === 17 ? 300 : h === 18 ? 200 : 0 })),
      sleep: { startMs: at(0), endMs: at(7), asleepMinutes: 410, deepMinutes: 90, lightMinutes: 320, awakeMinutes: 10 },
    },
    'default',
  )
  const samples = measurementToSamples(event, { profile: PROFILE, now: at(18, 35) })
  const byType = (type) => samples.filter((s) => s.options.dataType === type)

  it('passos só das horas já terminadas, em intervalos de 1 h', () => {
    expect(byType('steps')).toEqual([
      {
        key: `steps|${at(17)}`,
        options: { dataType: 'steps', value: 300, startDate: new Date(at(17)).toISOString(), endDate: new Date(at(18)).toISOString() },
      },
    ])
  })

  it('FC e pressão só depois que a meia hora terminou (o Health Connect não deixa corrigir depois)', () => {
    // Às 18:35 a meia hora das 18:30 ainda está aberta: nada de FC nem pressão.
    expect(byType('heartRate')).toEqual([])
    expect(byType('bloodPressure')).toEqual([])
  })

  it('FC, pressão (máx + mín juntas) e sono', () => {
    const later = measurementToSamples(event, { profile: PROFILE, now: at(19, 5) })
    const laterByType = (type) => later.filter((s) => s.options.dataType === type)
    expect(laterByType('heartRate')[0].options).toMatchObject({ value: 68, startDate: new Date(at(18, 30)).toISOString() })
    expect(laterByType('bloodPressure')[0].options).toMatchObject({ systolic: 116, diastolic: 76 })
    // Sessão de sono: 410 min dormindo + 10 acordado, terminando às 7:00.
    expect(byType('sleep')[0].options).toMatchObject({
      value: 410,
      startDate: new Date(at(7) - 420 * 60000).toISOString(),
      endDate: new Date(at(7)).toISOString(),
    })
  })

  it('não envia os passos totais do dia (evita contar em dobro)', () => {
    expect(samples.every((s) => s.key !== `steps|${at(0)}`)).toBe(true)
  })
})

describe('readSamplesToMeasurement', () => {
  it('importa passos por dia, FC e sono de outros apps, ignorando o nosso', () => {
    const event = readSamplesToMeasurement(
      {
        steps: [{ startDate: new Date(at(0)).toISOString(), endDate: new Date(at(23)).toISOString(), value: 8123.4 }],
        heartRate: [
          { startDate: new Date(at(10)).toISOString(), value: 62, sourceId: 'com.sec.android.app.shealth' },
          { startDate: new Date(at(11)).toISOString(), value: 99, sourceId: APP_PACKAGE_ID },
        ],
        sleep: [{ startDate: new Date(at(0)).toISOString(), endDate: new Date(at(7)).toISOString(), value: 400, sourceId: 'x' }],
      },
      'default',
    )
    expect(event.device).toBe('healthconnect')
    expect(event.metrics).toEqual([
      { metric: 'steps', value: 8123, unit: 'passos', timestamp: at(0) },
      { metric: 'heartRate', value: 62, unit: 'bpm', timestamp: at(10) },
      { metric: 'sleepMinutes', value: 400, unit: 'min', timestamp: at(7) },
    ])
  })
})

describe('measurementToSamples — treino', () => {
  it('envia distância e calorias do início ao fim; sem distância (academia) só calorias', () => {
    const run = workoutToMeasurement({ id: 'w', type: 'run', startedAt: 0, endedAt: 1800000, distanceM: 5000, movingTimeMs: 1700000, calories: 420 }, 'u')
    const samples = measurementToSamples(run, { profile: null })
    expect(samples.map((s) => [s.options.dataType, s.options.value, s.options.endDate])).toEqual([
      ['distance', 5000, new Date(1800000).toISOString()],
      ['calories', 420, new Date(1800000).toISOString()],
    ])
    const gym = workoutToMeasurement({ id: 'g', type: 'gym', startedAt: 0, endedAt: 60000, distanceM: 0, movingTimeMs: 60000, calories: 6 }, 'u')
    expect(measurementToSamples(gym, { profile: null }).map((s) => s.options.dataType)).toEqual(['calories'])
    expect(measurementToSamples(run, { profile: null, exportWorkout: false })).toEqual([])
  })
})

describe('buildSyncReport — confirmação da sincronização', () => {
  const since = 1000
  const exports = [
    { key: 'weight|5000', exportedAt: 6000 },
    { key: 'weight|500', exportedAt: 600 }, // antes do período lido: não entra na comparação
    { key: 'steps|7000', exportedAt: 9000 },
    { key: 'heartRate|8000', exportedAt: 9500 },
  ]
  const read = {
    weight: [{ sourceId: APP_PACKAGE_ID }, { sourceId: 'com.sec.android.app.shealth' }],
    steps: [{ sourceId: 'com.sec.android.app.shealth' }, { sourceId: 'com.sec.android.app.shealth' }, { sourceId: 'com.google.android.apps.fitness' }],
    heartRate: { error: 'sem permissão de leitura' },
  }
  const report = buildSyncReport({ exports, read, importedRows: [{ metric: 'steps' }, { metric: 'sleepMinutes' }], since })
  const row = (type) => report.find((item) => item.dataType === type)

  it('confirmado: enviado e encontrado de volta com a origem deste app', () => {
    expect(row('weight')).toMatchObject({ status: 'ok', sent: 1, confirmed: 1, lastSentAt: 6000 })
    expect(row('weight').others).toEqual([{ sourceId: 'com.sec.android.app.shealth', label: 'Samsung Health', count: 1 }])
  })

  it('enviado mas não encontrado; outros apps aparecem pela origem; erro de leitura', () => {
    expect(row('steps')).toMatchObject({ status: 'missing', sent: 1, confirmed: 0, imported: 1 })
    expect(row('steps').others.map((other) => [other.label, other.count])).toEqual([
      ['Samsung Health', 2],
      ['Google Fit', 1],
    ])
    expect(row('heartRate')).toMatchObject({ status: 'error', error: 'sem permissão de leitura' })
    expect(row('sleep')).toMatchObject({ status: 'error', imported: 1 })
    expect(row('distance').label).toBe('Distância (treinos)')
  })
})

describe('catchUpEvents — envio de recuperação', () => {
  it('uma pesagem por horário, um evento do relógio e um por treino', () => {
    const rows = [
      { device: 'scale', metric: 'weight', value: 70.05, unit: 'kg', timestamp: at(7) },
      { device: 'scale', metric: 'impedance', value: 600, unit: 'Ω', timestamp: at(7) },
      { device: 'scale', metric: 'weight', value: 69.9, unit: 'kg', timestamp: at(8) },
      { device: 'watch', metric: 'heartRate', value: 60, unit: 'bpm', timestamp: at(6) },
      { device: 'healthconnect', metric: 'steps', value: 100, unit: 'passos', timestamp: at(0) },
    ]
    const workout = { id: 'w', type: 'run', startedAt: at(9), endedAt: at(10), distanceM: 5000, movingTimeMs: 3000000, calories: 400 }
    const events = catchUpEvents({ rows, workouts: [workout], userId: 'u' })
    expect(events.map((event) => event.device)).toEqual(['scale', 'scale', 'watch', 'workout'])
    // A pesagem das 7 h vira peso + gordura + TMB (com perfil), como no envio na hora.
    const samples = measurementToSamples(events[0], { profile: PROFILE, now: at(12) })
    expect(samples.map((sample) => sample.options.dataType)).toEqual(['weight', 'bodyFat', 'basalCalories'])
    expect(measurementToSamples(events[2], { profile: PROFILE, now: at(12) })[0].options.dataType).toBe('heartRate')
  })
})

describe('connectionState — cartão de status', () => {
  const available = { available: true }

  it('PC, verificando e Health Connect ausente', () => {
    expect(connectionState({ native: false }).state).toBe('unsupported')
    expect(connectionState({ native: true, availability: { checking: true } }).state).toBe('checking')
    expect(connectionState({ native: true, availability: { available: false, reason: 'x' } })).toMatchObject({ state: 'unavailable', reason: 'x' })
  })

  it('sem permissões, em parte e completo', () => {
    expect(connectionState({ native: true, availability: available, permissions: null }).state).toBe('disconnected')
    const partial = connectionState({
      native: true,
      availability: available,
      permissions: { readAuthorized: PERMISSION_SCOPES.read, writeAuthorized: PERMISSION_SCOPES.write.filter((type) => type !== 'distance') },
    })
    expect(partial).toMatchObject({ state: 'partial', missing: ['Distância (treinos)'] })
    expect(partial.granted).toBe(partial.total - 1)
    const full = connectionState({
      native: true,
      availability: available,
      permissions: { readAuthorized: PERMISSION_SCOPES.read, writeAuthorized: PERMISSION_SCOPES.write },
    })
    expect(full.state).toBe('connected')
  })
})

describe('measurementToSamples — água', () => {
  it('cada copo vira hidratação em litros, 5 min depois (tempo para desfazer)', () => {
    const event = { userId: 'u', device: 'water', timestamp: at(9), metrics: [{ metric: 'waterMl', value: 250, unit: 'ml' }] }
    expect(measurementToSamples(event, { profile: null, now: at(9, 2) })).toEqual([])
    expect(measurementToSamples(event, { profile: null, now: at(9, 10) })).toEqual([
      {
        key: `dietaryWater|${at(9)}`,
        options: { dataType: 'dietaryWater', value: 0.25, startDate: new Date(at(9)).toISOString(), endDate: new Date(at(9) + 60000).toISOString() },
      },
    ])
    expect(measurementToSamples(event, { profile: null, exportWater: false, now: at(10) })).toEqual([])
  })
})
