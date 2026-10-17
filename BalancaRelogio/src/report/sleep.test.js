import { describe, expect, it } from 'vitest'
import { averageSleep, latestSleep, sleepByDay, sleepNights, sleepSessions } from './sleep.js'

const at = (day, hour, minute = 0) => new Date(2026, 9, day, hour, minute).getTime()
const watchRow = (metric, value, timestamp) => ({ device: 'watch', metric, value, timestamp })
const hcRow = (metric, value, timestamp) => ({ device: 'healthconnect', metric, value, timestamp })

// Noite do relógio (6h38, acordou às 6:50) e o mesmo sono registrado à mão no Samsung Health (7h10, até 7:10).
const watchNight = [
  watchRow('sleepMinutes', 398, at(17, 6, 50)),
  watchRow('sleepDeepMinutes', 95, at(17, 6, 50)),
  watchRow('sleepLightMinutes', 303, at(17, 6, 50)),
  watchRow('sleepAwakeMinutes', 12, at(17, 6, 50)),
  watchRow('sleepStart', at(16, 23, 40), at(17, 6, 50)),
]
const manualNight = [hcRow('sleepMinutes', 430, at(17, 7, 10))]

describe('sono por noite', () => {
  it('junta as linhas do relógio numa sessão com fases e início', () => {
    const [session] = sleepSessions(watchNight)
    expect(session).toMatchObject({ asleepMinutes: 398, deepMinutes: 95, lightMinutes: 303, awakeMinutes: 12, startMs: at(16, 23, 40), fromWatch: true })
  })

  it('na mesma noite, o relógio vence o registro importado do Health Connect', () => {
    const nights = sleepNights([...manualNight, ...watchNight])
    expect(nights).toHaveLength(1)
    expect(nights[0]).toMatchObject({ asleepMinutes: 398, fromWatch: true })
  })

  it('sem sono do relógio naquela noite, usa o do Health Connect', () => {
    const nights = sleepNights([...watchNight, hcRow('sleepMinutes', 420, at(18, 7, 0))])
    expect(nights.map((night) => night.asleepMinutes)).toEqual([398, 420])
  })

  it('gráfico: um item por dia (o último é hoje), com a noite ou vazio, e a média das noites', () => {
    const rows = [...watchNight, hcRow('sleepMinutes', 420, at(15, 7, 0))]
    const days = sleepByDay(rows, at(17, 12), 4)
    expect(days.map((day) => new Date(day.day).getDate())).toEqual([14, 15, 16, 17])
    expect(days.map((day) => day.night?.asleepMinutes ?? null)).toEqual([null, 420, null, 398])
    expect(averageSleep(days)).toBe(409)
    expect(averageSleep(sleepByDay([], at(17, 12), 4))).toBeNull()
  })

  it('sono mais recente: só a noite que passou (até 18 h atrás)', () => {
    const rows = [...watchNight, ...manualNight]
    expect(latestSleep(rows, at(17, 12)).asleepMinutes).toBe(398)
    expect(latestSleep(rows, at(18, 12))).toBeNull()
  })
})
