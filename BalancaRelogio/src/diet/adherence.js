// Adesão à dieta (funções puras). Cada refeição do plano pode ser marcada como:
//   - "feita": seguiu o plano;
//   - "fora do plano": comeu, mas não fez a refeição corretamente.
// O registro fica no banco como "mealDone:<id da refeição>" no horário da refeição,
// com valor 1 (feita) ou -1 (fora do plano). Sem registro = não marcada.
import { DIET_DEVICE, MEAL_DONE_METRIC, mealDoneKey, mealsOfDay } from './dietPlan.js'

export const MEAL_STATUS = { DONE: 'done', OFF: 'off' }

// Valor gravado no banco para cada situação.
const STATUS_VALUE = { [MEAL_STATUS.DONE]: 1, [MEAL_STATUS.OFF]: -1 }

/** Situação → valor gravado. */
export function statusValue(status) {
  return STATUS_VALUE[status]
}

/** Valor gravado → situação (registros antigos têm valor 1 = feita). */
export function statusFromValue(value) {
  return value < 0 ? MEAL_STATUS.OFF : MEAL_STATUS.DONE
}

/** Linha do banco é um registro de refeição? */
const isMealRow = (row) => row.device === DIET_DEVICE && row.metric.startsWith(`${MEAL_DONE_METRIC}:`)
/** Id da refeição a partir da métrica "mealDone:<id>". */
const mealIdOf = (row) => row.metric.slice(MEAL_DONE_METRIC.length + 1)

/** Meia-noite local do dia. */
function localDay(timestamp) {
  const date = new Date(timestamp)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Meia-noite local `offset` dias depois de `dayMs` (seguro em horário de verão). */
function shiftDay(dayMs, offset) {
  const date = new Date(dayMs)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset).getTime()
}

/**
 * Situação de cada refeição marcada.
 * @returns {Map<string, 'done' | 'off'>} chave "idDaRefeição@horário" (mealDoneKey)
 */
export function mealStatuses(rows) {
  const map = new Map()
  for (const row of rows) {
    if (isMealRow(row)) map.set(mealDoneKey(mealIdOf(row), row.timestamp), statusFromValue(row.value))
  }
  return map
}

/**
 * Adesão por dia, do primeiro dia com algum registro até hoje (no máximo `days` dias).
 * Só contam as refeições cujo horário já passou; as que passaram sem marcação ficam como "sem registro".
 * A ligação é por refeição e dia (não pelo horário exato), para mudar o horário no plano não apagar o histórico.
 * @returns {Array<{ day: number, planned: number, done: number, off: number, missing: number, pct: number | null }>}
 */
export function dailyAdherence({ plan, rows, days = 14, now = Date.now() }) {
  const mealRows = rows.filter(isMealRow)
  if (!plan?.meals?.length || !mealRows.length) return []
  // Situação por "refeição|dia".
  const byMealDay = new Map(mealRows.map((row) => [`${mealIdOf(row)}|${localDay(row.timestamp)}`, statusFromValue(row.value)]))
  const firstDay = localDay(Math.min(...mealRows.map((row) => row.timestamp)))
  const today = localDay(now)

  const result = []
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = shiftDay(today, -offset)
    if (day < firstDay) continue
    const entries = mealsOfDay(plan, day).filter((entry) => entry.at <= now)
    let done = 0
    let off = 0
    for (const entry of entries) {
      const status = byMealDay.get(`${entry.meal.id}|${day}`)
      if (status === MEAL_STATUS.DONE) done += 1
      else if (status === MEAL_STATUS.OFF) off += 1
    }
    const planned = entries.length
    result.push({ day, planned, done, off, missing: planned - done - off, pct: planned ? Math.round((done / planned) * 100) : null })
  }
  return result
}

/** Soma de uma lista de dias de dailyAdherence. */
export function adherenceTotals(daysList) {
  const sum = (key) => daysList.reduce((total, day) => total + day[key], 0)
  const planned = sum('planned')
  const done = sum('done')
  return { planned, done, off: sum('off'), missing: sum('missing'), pct: planned ? Math.round((done / planned) * 100) : null }
}

/**
 * Refeições marcadas como "fora do plano" desde `since` (mais recentes primeiro), com o nome do plano.
 * @returns {Array<{ at: number, name: string }>}
 */
export function offPlanMeals({ plan, rows, since = 0 }) {
  const names = new Map((plan?.meals ?? []).map((meal) => [meal.id, meal.name]))
  return rows
    .filter((row) => isMealRow(row) && row.value < 0 && row.timestamp >= since)
    .map((row) => ({ at: row.timestamp, name: names.get(mealIdOf(row)) ?? 'Refeição' }))
    .sort((a, b) => b.at - a.at)
}

