import { describe, expect, it } from 'vitest'
import { compactNight, expandNight, mergeSleepNights } from './sleepBackup.js'
import { sleepNightsToMeasurement } from './watchMeasurements.js'

describe('cópia local das noites de sono', () => {
  it('compacta e expande sem perder as fases nem os horários', () => {
    const sleep = {
      startMs: 1000,
      endMs: 1000 + 90 * 60000,
      asleepMinutes: 80,
      deepMinutes: 30,
      lightMinutes: 50,
      awakeMinutes: 10,
      stages: [
        { stage: 1, minutes: 50, startMs: 1000 },
        { stage: 2, minutes: 30, startMs: 1000 + 50 * 60000 },
        { stage: 0, minutes: 10, startMs: 1000 + 80 * 60000 },
      ],
    }
    const compact = compactNight(sleep)
    expect(compact.stages).toEqual([
      [1, 50],
      [2, 30],
      [0, 10],
    ])
    expect(expandNight(compact)).toEqual(sleep)
  })

  it('junta por horário de acordar (a nova vence), em ordem, só as mais recentes', () => {
    const night = (endMs, asleepMinutes) => ({ endMs, asleepMinutes, stages: [] })
    const merged = mergeSleepNights([night(3, 100), night(1, 100)], [night(3, 200), night(2, 150)], 2)
    expect(merged.map((n) => [n.endMs, n.asleepMinutes])).toEqual([
      [2, 150],
      [3, 200],
    ])
  })

  it('várias noites viram um evento só, cada métrica no horário em que acordou', () => {
    const nights = [
      { startMs: 10, endMs: 100, asleepMinutes: 400, deepMinutes: 90, lightMinutes: 310, awakeMinutes: 5 },
      { startMs: 200, endMs: 300, asleepMinutes: 420, deepMinutes: 100, lightMinutes: 320, awakeMinutes: 0 },
    ]
    const event = sleepNightsToMeasurement(nights, 'u1', 999)
    expect(event).toMatchObject({ userId: 'u1', device: 'watch', timestamp: 999 })
    expect(event.metrics.filter((m) => m.metric === 'sleepMinutes').map((m) => [m.value, m.timestamp])).toEqual([
      [400, 100],
      [420, 300],
    ])
    expect(event.metrics.find((m) => m.metric === 'sleepStart' && m.timestamp === 300).value).toBe(200)
  })
})
