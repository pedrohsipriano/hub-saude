// Testes da tendência de peso.
import { describe, expect, it } from 'vitest'
import { dailyWeights, flagOutliers, movingAverage, prepareTrend, projectGoal, weeklyRate, weightTrendSummary } from './trend.js'

const day = (n) => new Date(2026, 9, n, 7, 30).getTime()

describe('movingAverage', () => {
  it('média das pesagens dos 7 dias anteriores', () => {
    const series = movingAverage([
      { timestamp: day(1), weightKg: 71 },
      { timestamp: day(3), weightKg: 70 },
      { timestamp: day(10), weightKg: 69 },
    ])
    expect(series.map((p) => p.average)).toEqual([71, 70.5, 69])
  })
})

describe('weeklyRate', () => {
  it('perdendo 0,5 kg por semana', () => {
    const weighings = [0, 7, 14, 21].map((d, i) => ({ timestamp: day(1 + d), weightKg: 72 - i * 0.5 }))
    expect(weeklyRate(weighings, { now: day(22) })).toBeCloseTo(-0.5, 2)
  })

  it('poucos dados → null', () => {
    expect(weeklyRate([{ timestamp: day(1), weightKg: 70 }, { timestamp: day(2), weightKg: 70 }], { now: day(3) })).toBeNull()
  })
})

describe('projectGoal', () => {
  it('chega ao alvo no ritmo atual', () => {
    const result = projectGoal({ currentKg: 70, targetKg: 68, ratePerWeek: -0.5, now: day(1) })
    expect(result.reachable).toBe(true)
    expect(result.weeks).toBe(4)
  })

  it('ritmo na direção contrária ou estável → não alcançável', () => {
    expect(projectGoal({ currentKg: 70, targetKg: 68, ratePerWeek: 0.3 }).reachable).toBe(false)
    expect(projectGoal({ currentKg: 70, targetKg: 68, ratePerWeek: 0.01 }).reachable).toBe(false)
  })
})

describe('weightTrendSummary', () => {
  it('junta a média, o ritmo, a projeção e a variação no período', () => {
    const weighings = [0, 7, 14, 21].map((d, i) => ({ timestamp: day(1 + d), weightKg: 72 - i * 0.5 }))
    const summary = weightTrendSummary(weighings, { targetKg: 69, now: day(22) })
    expect(summary.latest.weightKg).toBe(70.5)
    expect(summary.ratePerWeek).toBeCloseTo(-0.5, 2)
    expect(summary.projection.reachable).toBe(true)
    expect(summary.changeInPeriod).toBeLessThan(0)
  })
})

describe('pesagens fora da curva e um ponto por dia', () => {
  // Caso real: várias pesagens no mesmo dia (~70 kg) e uma de 54,7 kg (outra pessoa ou pesagem incompleta).
  const at = (hour, minute = 0) => new Date(2026, 9, 16, hour, minute).getTime()
  const sameDay = [
    { timestamp: at(16, 40), weightKg: 70.4 },
    { timestamp: at(16, 49), weightKg: 70.05 },
    { timestamp: at(17, 5), weightKg: 69.95 },
    { timestamp: at(18, 0), weightKg: 54.7 },
    { timestamp: at(18, 30), weightKg: 70.2 },
  ]

  it('marca só a pesagem que destoa das vizinhas', () => {
    expect(flagOutliers(sameDay).filter((w) => w.outlier).map((w) => w.weightKg)).toEqual([54.7])
    // Com só 2 pesagens não dá para saber qual é a errada: nada é marcado.
    expect(flagOutliers(sameDay.slice(2, 4)).some((w) => w.outlier)).toBe(false)
  })

  it('o dia vira um ponto (mediana, sem a fora da curva) e a tendência não despenca', () => {
    const { daily, outliers } = prepareTrend(sameDay)
    expect(daily).toEqual([{ timestamp: at(16, 40), weightKg: 70.13, count: 4 }])
    expect(outliers).toHaveLength(1)
    const summary = weightTrendSummary(sameDay, { now: at(19) })
    expect(summary.average7).toBeCloseTo(70.13, 2)
    expect(summary.changeInPeriod).toBeNull()
    expect(summary.outlierCount).toBe(1)
  })

  it('dias diferentes continuam separados', () => {
    const days = [
      { timestamp: new Date(2026, 9, 14, 7).getTime(), weightKg: 70.6 },
      { timestamp: new Date(2026, 9, 15, 7).getTime(), weightKg: 70.4 },
      { timestamp: new Date(2026, 9, 15, 20).getTime(), weightKg: 71.2 },
    ]
    expect(dailyWeights(days).map((d) => d.weightKg)).toEqual([70.6, 70.8])
  })
})
