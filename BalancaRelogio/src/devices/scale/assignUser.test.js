// Testes da atribuição de pesagens e das medidas corporais.
import { describe, expect, it } from 'vitest'
import { groupMeasurements, measurementsToEvent, waistHipRatio } from '../../report/bodyMeasurements.js'
import { assignWeighing } from './assignUser.js'

describe('assignWeighing', () => {
  it('um usuário só: sempre dele', () => {
    expect(assignWeighing({ weightKg: 90, users: [{ userId: 'a', lastWeightKg: 60 }] })).toMatchObject({
      userId: 'a',
      needsConfirmation: false,
    })
  })

  it('escolhe o mais próximo quando a diferença é clara', () => {
    const result = assignWeighing({
      weightKg: 70.2,
      users: [
        { userId: 'a', lastWeightKg: 70 },
        { userId: 'b', lastWeightKg: 58 },
      ],
    })
    expect(result).toMatchObject({ userId: 'a', needsConfirmation: false })
  })

  it('pergunta quando os pesos estão próximos ou alguém não tem histórico', () => {
    expect(
      assignWeighing({ weightKg: 70, users: [{ userId: 'a', lastWeightKg: 69.5 }, { userId: 'b', lastWeightKg: 70.8 }] })
        .needsConfirmation,
    ).toBe(true)
    expect(
      assignWeighing({ weightKg: 70, users: [{ userId: 'a', lastWeightKg: null }, { userId: 'b', lastWeightKg: null }] })
        .needsConfirmation,
    ).toBe(true)
  })
})

describe('medidas corporais', () => {
  it('RCQ e agrupamento por registro', () => {
    expect(waistHipRatio(80, 100)).toBe(0.8)
    expect(waistHipRatio(80, null)).toBeNull()
    const event = measurementsToEvent({ waistCm: 82, hipCm: 98, armCm: null }, 'u', 1000)
    expect(event.metrics.map((m) => m.metric)).toEqual(['waistCm', 'hipCm'])
    const rows = event.metrics.map((m) => ({ device: event.device, timestamp: 1000, ...m }))
    expect(groupMeasurements(rows)).toEqual([{ timestamp: 1000, waistCm: 82, hipCm: 98, whr: 0.84 }])
  })
})
