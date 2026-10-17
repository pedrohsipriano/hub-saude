import { describe, expect, it } from 'vitest'
import { workoutNotificationContent } from './liveNotification.js'
import { createRecording, pauseRecording } from './recording.js'

describe('workoutNotificationContent', () => {
  it('corrida gravando: distância, ritmo médio e atual, calorias com peso padrão', () => {
    const recording = createRecording('run', 0)
    // 2,15 km em 11:50 → 330 s/km = 5:30 /km; 9,8 MET × 70 kg × 0,197 h ≈ 135 kcal.
    const content = workoutNotificationContent(recording, { distanceM: 2150, speedNow: 3 }, { now: 710000 })
    expect(content.title).toBe('Corrida · gravando')
    expect(content.text).toBe('2,15 km · 5:30 /km · ~135 kcal')
    expect(content.lines).toEqual(['Distância: 2,15 km', 'Ritmo médio: 5:30 /km', 'Ritmo atual: 5:33 /km', 'Calorias: ~135 kcal'])
    expect(content.shortText).toBe('2,15 km')
    expect(content.elapsedMs).toBe(710000)
    expect(content.paused).toBe(false)
  })

  it('pausado: o tempo vai no título e some o ritmo atual', () => {
    const recording = pauseRecording(createRecording('run', 0), 600000)
    const content = workoutNotificationContent(recording, { distanceM: 2000, speedNow: 3 }, { now: 900000, weightKg: 70 })
    expect(content.title).toBe('Corrida · pausado em 10:00')
    expect(content.elapsedMs).toBe(600000)
    expect(content.paused).toBe(true)
    expect(content.lines.some((line) => line.startsWith('Ritmo atual'))).toBe(false)
    expect(content.text).toBe('2,00 km · 5:00 /km · 114 kcal')
  })

  it('pedalada mostra velocidade em km/h', () => {
    const recording = createRecording('ride', 0)
    const content = workoutNotificationContent(recording, { distanceM: 6000, speedNow: 5 }, { now: 1000000, weightKg: 80 })
    expect(content.text.startsWith('6,00 km · 21,6 km/h')).toBe(true)
    expect(content.lines).toContain('Velocidade atual: 18,0 km/h')
  })

  it('exercício sem GPS: só calorias, sem chip de distância', () => {
    const recording = createRecording('muaythai', 0)
    // 10,3 MET × 80 kg × 0,5 h = 412 kcal.
    const content = workoutNotificationContent(recording, null, { now: 1800000, weightKg: 80 })
    expect(content.title).toBe('Muay Thai · gravando')
    expect(content.text).toBe('412 kcal')
    expect(content.lines).toEqual(['Calorias: 412 kcal'])
    expect(content.shortText).toBeNull()
  })
})
