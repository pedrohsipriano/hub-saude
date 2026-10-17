// Testes do resumo semanal e dos avisos.
import { describe, expect, it } from 'vitest'
import { healthAlerts, weeklySummary } from './insights.js'

const NOW = new Date(2026, 9, 20, 12).getTime()
const at = (day, hour = 7) => new Date(2026, 9, day, hour).getTime()

describe('weeklySummary', () => {
  it('frases de peso, sono, passos e FC de repouso', () => {
    const weighings = [
      { timestamp: at(10), weightKg: 71 },
      { timestamp: at(15), weightKg: 70.4 },
      { timestamp: at(19), weightKg: 70.0 },
    ]
    const rows = [
      { device: 'watch', metric: 'sleepMinutes', timestamp: at(18), value: 420 },
      { device: 'watch', metric: 'sleepMinutes', timestamp: at(19), value: 360 },
      { device: 'watch', metric: 'steps', timestamp: at(18, 0), value: 8000 },
      { device: 'healthconnect', metric: 'steps', timestamp: at(18, 0), value: 9999 },
      { device: 'watch', metric: 'heartRate', timestamp: at(18, 3), value: 58 },
    ]
    const sentences = weeklySummary({ weighings, rows, now: NOW })
    expect(sentences[0]).toMatch(/Peso médio da semana: 70,20 kg \(2 pesagens\), -0,80 kg/)
    expect(sentences.join(' ')).toMatch(/Sono: média de 6 h 30 min/)
    // O relógio vence o Health Connect no mesmo dia.
    expect(sentences.join(' ')).toMatch(/Passos: média de 8\.000 por dia/)
    expect(sentences.join(' ')).toMatch(/FC de repouso média: 58 bpm/)
  })

  it('treinos da semana: quantidade, tempo e distância', () => {
    const rows = [
      { device: 'workout', metric: 'workoutDuration', timestamp: at(18), value: 1800 },
      { device: 'workout', metric: 'workoutDistance', timestamp: at(18), value: 5200 },
      { device: 'workout', metric: 'workoutDuration', timestamp: at(19), value: 2700 },
      { device: 'workout', metric: 'workoutDistance', timestamp: at(19), value: 0 },
      { device: 'workout', metric: 'workoutDuration', timestamp: at(1), value: 9999 }, // fora da semana
    ]
    expect(weeklySummary({ weighings: [], rows, now: NOW })).toContain('Treinos: 2 treinos, 1 h 15 min em movimento, 5,2 km.')
  })

  it('dieta da semana: % seguidas e fora do plano', () => {
    const plan = { meals: [{ id: 'cafe', name: 'Café', time: '07:00', options: [] }, { id: 'almoco', name: 'Almoço', time: '12:00', options: [] }] }
    const rows = [
      { device: 'diet', metric: 'mealDone:cafe', timestamp: at(20, 7), value: 1 },
      { device: 'diet', metric: 'mealDone:almoco', timestamp: at(20, 12), value: -1 },
    ]
    expect(weeklySummary({ weighings: [], rows, plan, now: NOW })).toContain('Dieta: 50% das refeições seguidas (1 de 2), 1 fora do plano.')
  })

  it('sem dados, nenhuma frase', () => {
    expect(weeklySummary({ weighings: [], rows: [], now: NOW })).toEqual([])
  })
})

describe('healthAlerts', () => {
  it('FC de repouso subindo e SpO2 baixa', () => {
    const rows = []
    // 3 semanas anteriores: repouso ~55.
    for (let d = -26; d <= -8; d += 1) rows.push({ device: 'watch', metric: 'heartRate', timestamp: NOW + d * 86400000, value: 55 })
    // Última semana: repouso ~63, SpO2 baixa em 3 dias.
    for (let d = -6; d <= -1; d += 1) {
      rows.push({ device: 'watch', metric: 'heartRate', timestamp: NOW + d * 86400000, value: 63 })
      if (d >= -3) rows.push({ device: 'watch', metric: 'spo2', timestamp: NOW + d * 86400000, value: 90 })
    }
    const alerts = healthAlerts({ rows, now: NOW })
    expect(alerts.map((a) => a.level)).toEqual(['attention', 'attention'])
    expect(alerts[0].text).toMatch(/8 bpm acima/)
  })

  it('sem dados, sem avisos', () => {
    expect(healthAlerts({ rows: [], now: NOW })).toEqual([])
  })
})
