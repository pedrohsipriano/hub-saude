// Sono por noite a partir das linhas do banco (lógica pura, testada).
// As linhas vêm do relógio (device "watch") e da importação do Health Connect (sono que outro app gravou,
// como um registro manual no Samsung Health). Na mesma noite, o relógio tem prioridade: é a medição de
// verdade, e o Health Connect fica só de reserva (mesma regra dos cruzamentos do relatório).
import { WATCH_DEVICE } from '../devices/watch/watchMeasurements.js'

// Métricas de sono → campo da noite.
const SLEEP_FIELDS = {
  sleepMinutes: 'asleepMinutes',
  sleepDeepMinutes: 'deepMinutes',
  sleepLightMinutes: 'lightMinutes',
  sleepAwakeMinutes: 'awakeMinutes',
  sleepStart: 'startMs',
}

const HOUR_MS = 3600000

/** Dia local (AAAA-MM-DD) de um horário: a noite é contada pelo dia em que a pessoa acordou. */
function localDay(timestamp) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * Sessões de sono: as linhas de cada origem juntadas pelo horário em que a pessoa acordou.
 * @param {Array<{ device: string, metric: string, timestamp: number, value: number }>} rows
 * @returns {Array<{ endMs: number, device: string, asleepMinutes: number, deepMinutes: number | null,
 *   lightMinutes: number | null, awakeMinutes: number | null, startMs: number | null, fromWatch: boolean }>} em ordem cronológica
 */
export function sleepSessions(rows) {
  const sessions = new Map()
  for (const row of rows) {
    const field = SLEEP_FIELDS[row.metric]
    if (!field) continue
    const key = `${row.device}|${row.timestamp}`
    const session = sessions.get(key) ?? {
      endMs: row.timestamp,
      device: row.device,
      asleepMinutes: null,
      deepMinutes: null,
      lightMinutes: null,
      awakeMinutes: null,
      startMs: null,
      fromWatch: row.device === WATCH_DEVICE,
    }
    session[field] = row.value
    sessions.set(key, session)
  }
  return [...sessions.values()].filter((session) => session.asleepMinutes != null).sort((a, b) => a.endMs - b.endMs)
}

/**
 * Uma noite por dia (o dia em que acordou). Se houver sono do relógio naquele dia, ele vence o do Health Connect.
 * @param {Array<object>} rows - linhas do banco
 * @returns {Array<object>} sessões escolhidas, em ordem cronológica
 */
export function sleepNights(rows) {
  const nights = new Map()
  for (const session of sleepSessions(rows)) {
    const day = localDay(session.endMs)
    const current = nights.get(day)
    // O relógio vence; entre sessões da mesma origem, fica a mais recente (sessões já vêm em ordem).
    if (!current || session.fromWatch || !current.fromWatch) nights.set(day, session)
  }
  return [...nights.values()].sort((a, b) => a.endMs - b.endMs)
}

/**
 * Últimos `count` dias (o último é hoje), cada um com a noite que terminou nele ou null: base do gráfico do sono.
 * @param {Array<object>} rows
 * @param {number} now
 * @param {number} [count]
 * @returns {Array<{ day: number, night: object | null }>} day = meia-noite local do dia
 */
export function sleepByDay(rows, now, count = 14) {
  const byDay = new Map(sleepNights(rows).map((night) => [localDay(night.endMs), night]))
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const days = []
  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(today.getDate() - i)
    days.push({ day: date.getTime(), night: byDay.get(localDay(date.getTime())) ?? null })
  }
  return days
}

/**
 * Média do tempo dormido (min) das noites registradas, ou null sem nenhuma.
 * @param {Array<{ night: object | null }>} days - de sleepByDay()
 */
export function averageSleep(days) {
  const nights = days.filter((day) => day.night).map((day) => day.night.asleepMinutes)
  return nights.length ? Math.round(nights.reduce((sum, minutes) => sum + minutes, 0) / nights.length) : null
}

/**
 * Sono mais recente que terminou há no máximo `maxAgeMs` (padrão 18 h: a noite que passou).
 * @param {Array<object>} rows
 * @param {number} now
 * @param {number} [maxAgeMs]
 * @returns {object | null}
 */
export function latestSleep(rows, now, maxAgeMs = 18 * HOUR_MS) {
  const recent = sleepNights(rows).filter((night) => night.endMs <= now && now - night.endMs <= maxAgeMs)
  return recent.at(-1) ?? null
}
