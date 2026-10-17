// Testes da adesão à dieta e do cruzamento por semana.
import { describe, expect, it } from 'vitest'
import { weeklyFindings, weeklyRows } from '../report/weeklyCross.js'
import { adherenceTotals, dailyAdherence, mealStatuses, offPlanMeals, statusValue } from './adherence.js'

// Plano com 3 refeições.
const plan = {
  meals: [
    { id: 'cafe', name: 'Café da manhã', time: '07:00', options: [] },
    { id: 'almoco', name: 'Almoço', time: '12:00', options: [] },
    { id: 'jantar', name: 'Jantar', time: '20:00', options: [] },
  ],
}
const at = (day, hour, minute = 0) => new Date(2026, 9, day, hour, minute).getTime()
const meal = (id, day, hour, status) => ({ device: 'diet', metric: `mealDone:${id}`, timestamp: at(day, hour), value: statusValue(status) })

describe('adesão à dieta', () => {
  const rows = [
    meal('cafe', 15, 7, 'done'),
    meal('almoco', 15, 12, 'off'),
    meal('jantar', 15, 20, 'done'),
    meal('cafe', 16, 7, 'done'),
    // Dia 16: almoço sem registro; o jantar (20 h) ainda não chegou às 15 h.
  ]

  it('feitas, fora do plano e sem registro por dia; refeições futuras não contam', () => {
    const days = dailyAdherence({ plan, rows, days: 7, now: at(16, 15) })
    // Começa no primeiro dia com registro (15/10).
    expect(days.map((day) => [day.planned, day.done, day.off, day.missing, day.pct])).toEqual([
      [3, 2, 1, 0, 67],
      [2, 1, 0, 1, 50],
    ])
    expect(adherenceTotals(days)).toEqual({ planned: 5, done: 3, off: 1, missing: 1, pct: 60 })
  })

  it('situação de cada refeição e lista das fora do plano', () => {
    expect(mealStatuses(rows).get(`almoco@${at(15, 12)}`)).toBe('off')
    expect(mealStatuses([{ ...meal('cafe', 15, 7, 'done'), value: 1 }]).get(`cafe@${at(15, 7)}`)).toBe('done')
    expect(offPlanMeals({ plan, rows })).toEqual([{ at: at(15, 12), name: 'Almoço' }])
  })

  it('sem plano ou sem registros: nada', () => {
    expect(dailyAdherence({ plan: null, rows, now: at(16, 15) })).toEqual([])
    expect(dailyAdherence({ plan, rows: [], now: at(16, 15) })).toEqual([])
  })
})

describe('cruzamento por semana', () => {
  const now = at(28, 21)
  // Semanas de 7 dias terminando hoje (28/10): 22–28/10 (atual) e 15–21/10 (anterior).
  const weighings = [
    { timestamp: at(16, 7), weightKg: 71 },
    { timestamp: at(20, 7), weightKg: 70.8 },
    { timestamp: at(24, 7), weightKg: 70.2 },
    { timestamp: at(27, 7), weightKg: 70.0 },
  ]
  const rows = [
    meal('cafe', 22, 7, 'done'),
    meal('almoco', 22, 12, 'off'),
    { device: 'workout', metric: 'workoutDuration', timestamp: at(23, 18), value: 3600 },
    { device: 'workout', metric: 'workoutDistance', timestamp: at(23, 18), value: 8000 },
    { device: 'watch', metric: 'steps', timestamp: at(24, 0), value: 9000 },
    { device: 'healthconnect', metric: 'steps', timestamp: at(24, 0), value: 1 },
  ]

  it('peso médio, variação, dieta, treinos e passos da semana', () => {
    const weeks = weeklyRows({ weighings, rows, plan, weeks: 2, now })
    expect(weeks).toHaveLength(2)
    const [previous, current] = weeks
    expect(previous.avgWeightKg).toBe(70.9)
    expect(current).toMatchObject({ avgWeightKg: 70.1, deltaKg: -0.8, workouts: 1, workoutMinutes: 60, distanceKm: 8, avgSteps: 9000, offMeals: 1 })
    expect(current.dietPlanned).toBeGreaterThan(0)
  })

  it('conclusões só com pelo menos 2 semanas de cada lado', () => {
    expect(weeklyFindings([{ deltaKg: -0.5, dietPct: 90, workoutMinutes: 200 }])).toEqual([])
    const findings = weeklyFindings([
      { deltaKg: -0.6, dietPct: 90, workoutMinutes: 200 },
      { deltaKg: -0.4, dietPct: 85, workoutMinutes: 180 },
      { deltaKg: 0.2, dietPct: 50, workoutMinutes: 30 },
      { deltaKg: 0.4, dietPct: 60, workoutMinutes: 0 },
    ])
    expect(findings[0]).toBe('Semanas com dieta seguida ≥ 80%: o peso variou em média -0,50 kg por semana; abaixo disso: +0,30 kg.')
    expect(findings[1]).toMatch(/^Semanas com 150 min ou mais de treino/)
  })
})
