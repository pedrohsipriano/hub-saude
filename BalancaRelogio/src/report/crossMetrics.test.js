// Testes dos cruzamentos balança × relógio.
import { describe, expect, it } from 'vitest'
import { buildCrossRows, hasWatchData } from './crossMetrics.js'

const at = (day, hour, minute = 0) => new Date(2026, 9, day, hour, minute).getTime()

describe('buildCrossRows', () => {
  const weighings = [{ timestamp: at(17, 7, 30), weightKg: 70.05 }]
  const rows = [
    // Passos do dia 16 (registrados na meia-noite do dia 16).
    { device: 'watch', metric: 'steps', timestamp: at(16, 0), value: 8500 },
    { device: 'watch', metric: 'steps', timestamp: at(17, 0), value: 300 },
    // Sono que terminou às 7:00 do dia 17, e um sono antigo fora da janela.
    { device: 'watch', metric: 'sleepMinutes', timestamp: at(17, 7), value: 410 },
    { device: 'watch', metric: 'sleepMinutes', timestamp: at(15, 7), value: 380 },
    // FC das últimas 24 h (mínima 58) e uma FC fora da janela.
    { device: 'watch', metric: 'heartRate', timestamp: at(16, 18), value: 75 },
    { device: 'watch', metric: 'heartRate', timestamp: at(17, 3), value: 58 },
    { device: 'watch', metric: 'heartRate', timestamp: at(15, 3), value: 50 },
    // Linha da balança não entra nos cruzamentos.
    { device: 'scale', metric: 'weight', timestamp: at(17, 7, 30), value: 70.05 },
  ]

  it('liga a pesagem da manhã aos passos de ontem, ao sono da noite e à FC de repouso', () => {
    expect(buildCrossRows({ weighings, rows })).toEqual([
      {
        timestamp: at(17, 7, 30),
        weightKg: 70.05,
        stepsPreviousDay: 8500,
        sleepMinutes: 410,
        restingHeartRate: 58,
        workoutMinutesPreviousDay: null,
        dietPreviousDay: null,
      },
    ])
  })

  it('usa o Health Connect como reserva, e o relógio tem prioridade', () => {
    const fromHealthConnect = [
      { device: 'healthconnect', metric: 'steps', timestamp: at(16, 0), value: 9999 },
      { device: 'healthconnect', metric: 'sleepMinutes', timestamp: at(17, 6), value: 395 },
    ]
    // Só Health Connect: os valores dele aparecem.
    expect(buildCrossRows({ weighings, rows: fromHealthConnect })[0]).toMatchObject({ stepsPreviousDay: 9999, sleepMinutes: 395 })
    // Relógio + Health Connect: vence o relógio.
    expect(buildCrossRows({ weighings, rows: [...rows, ...fromHealthConnect] })[0]).toMatchObject({
      stepsPreviousDay: 8500,
      sleepMinutes: 410,
    })
  })

  it('sem dados do relógio, os campos ficam null', () => {
    const cross = buildCrossRows({ weighings, rows: [] })
    expect(cross[0]).toMatchObject({ stepsPreviousDay: null, sleepMinutes: null, restingHeartRate: null })
    expect(hasWatchData(cross)).toBe(false)
  })

  it('treino e dieta do dia anterior', () => {
    const plan = { meals: [{ id: 'cafe', name: 'Café', time: '07:00', options: [] }, { id: 'jantar', name: 'Jantar', time: '20:00', options: [] }] }
    const extra = [
      { device: 'workout', metric: 'workoutDuration', timestamp: at(16, 18), value: 2700 },
      { device: 'diet', metric: 'mealDone:cafe', timestamp: at(16, 7), value: 1 },
      { device: 'diet', metric: 'mealDone:jantar', timestamp: at(16, 20), value: -1 },
    ]
    const [row] = buildCrossRows({ weighings, rows: [...rows, ...extra], plan, now: at(17, 9) })
    expect(row.workoutMinutesPreviousDay).toBe(45)
    expect(row.dietPreviousDay).toEqual({ pct: 50, off: 1 })
    expect(hasWatchData(buildCrossRows({ weighings, rows: extra, plan, now: at(17, 9) }))).toBe(true)
  })
})
