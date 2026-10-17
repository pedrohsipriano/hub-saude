// Testes da conversão sincronização → evento do hub.
import { describe, expect, it } from 'vitest'
import { slotTimestamp, startOfLocalDay, watchSeries, watchSyncToMeasurement } from './watchMeasurements.js'

const SYNCED_AT = new Date(2026, 9, 16, 18, 35).getTime()

describe('watchSyncToMeasurement', () => {
  const heartRate = new Array(48).fill(0)
  heartRate[37] = 68
  const event = watchSyncToMeasurement(
    {
      syncedAt: SYNCED_AT,
      battery: { percent: 88, millivolts: 4000 },
      summary: { steps: 1234 },
      heartRate,
      spo2: null,
      bloodPressure: [{ systolic: 0, diastolic: 0 }, { systolic: 116, diastolic: 76 }],
      hourSteps: [{ steps: 0 }, { steps: 300 }],
      sleep: { endMs: new Date(2026, 9, 16, 7, 0).getTime(), asleepMinutes: 410, deepMinutes: 90, lightMinutes: 320, awakeMinutes: 10 },
    },
    'default',
  )
  const find = (metric) => event.metrics.filter((m) => m.metric === metric)

  it('coloca cada posição de 30 min no horário certo', () => {
    expect(find('heartRate')).toEqual([
      { metric: 'heartRate', value: 68, unit: 'bpm', timestamp: new Date(2026, 9, 16, 18, 30).getTime() },
    ])
    expect(find('bpSystolic')[0].timestamp).toBe(new Date(2026, 9, 16, 0, 30).getTime())
  })

  it('passos do dia ficam na meia-noite (um registro por dia)', () => {
    expect(find('steps')[0]).toMatchObject({ value: 1234, timestamp: startOfLocalDay(SYNCED_AT) })
    expect(find('stepsHour')[0]).toMatchObject({ value: 300, timestamp: new Date(2026, 9, 16, 1, 0).getTime() })
  })

  it('sono fica no horário em que a pessoa acordou', () => {
    expect(find('sleepMinutes')[0]).toMatchObject({ value: 410, timestamp: new Date(2026, 9, 16, 7, 0).getTime() })
  })

  it('ignora posições sem medição', () => {
    expect(find('spo2')).toEqual([])
    expect(find('bpSystolic')).toHaveLength(1)
  })
})

describe('auxiliares', () => {
  it('slotTimestamp e watchSeries', () => {
    const dayStart = startOfLocalDay(SYNCED_AT)
    expect(slotTimestamp(dayStart, 47)).toBe(new Date(2026, 9, 16, 23, 30).getTime())
    const rows = [
      { device: 'watch', metric: 'heartRate', timestamp: 2, value: 70 },
      { device: 'scale', metric: 'weight', timestamp: 1, value: 70 },
      { device: 'watch', metric: 'heartRate', timestamp: 1, value: 65 },
    ]
    expect(watchSeries(rows, 'heartRate')).toEqual([
      { timestamp: 1, value: 65 },
      { timestamp: 2, value: 70 },
    ])
  })
})
