// Cruzamento por semana (relatório de peso): peso médio e variação × dieta seguida × treinos × passos.
// Semanas de 7 dias inteiros terminando hoje (a mais recente por último), e as conclusões simples
// que comparam as semanas boas e as fracas de dieta e de treino. Funções puras.
import { WATCH_DEVICE } from '../devices/watch/watchMeasurements.js'
import { HEALTH_CONNECT_DEVICE } from '../integrations/healthConnect/healthConnectMapping.js'
import { formatNumber } from '../utils/format.js'
import { WORKOUT_DEVICE } from '../workouts/recording.js'
import { adherenceTotals, dailyAdherence } from '../diet/adherence.js'
import { prepareTrend } from './trend.js'

// Limiares das conclusões.
export const GOOD_DIET_PCT = 80
export const GOOD_TRAINING_MIN = 150 // recomendação da OMS: 150 min de atividade moderada por semana

const round2 = (value) => Math.round(value * 100) / 100
const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null)

/** Meia-noite local `offset` dias depois do dia de `timestamp`. */
function shiftDay(timestamp, offset) {
  const date = new Date(timestamp)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset).getTime()
}

/**
 * @param {object} params
 * @param {Array<{ timestamp: number, weightKg: number }>} params.weighings
 * @param {Array<object>} params.rows - linhas do banco do usuário
 * @param {object | null} params.plan - plano alimentar principal
 * @param {number} [params.weeks]
 * @param {number} [params.now]
 * @returns {Array<{ start: number, end: number, avgWeightKg: number | null, deltaKg: number | null,
 *   dietPct: number | null, offMeals: number, dietPlanned: number, workouts: number, workoutMinutes: number,
 *   distanceKm: number, avgSteps: number | null }>} só as semanas com algum dado
 */
export function weeklyRows({ weighings, rows, plan, weeks = 8, now = Date.now() }) {
  const { daily } = prepareTrend(weighings)
  const adherence = dailyAdherence({ plan, rows, days: weeks * 7, now })
  const tomorrow = shiftDay(now, 1)

  const result = []
  for (let w = weeks - 1; w >= 0; w -= 1) {
    const end = shiftDay(tomorrow, -7 * w) // exclusivo
    const start = shiftDay(end, -7)
    const inWeek = (timestamp) => timestamp >= start && timestamp < end
    const weights = daily.filter((point) => inWeek(point.timestamp)).map((point) => point.weightKg)
    const workoutRows = rows.filter((row) => row.device === WORKOUT_DEVICE && inWeek(row.timestamp))
    const durations = workoutRows.filter((row) => row.metric === 'workoutDuration')
    const distances = workoutRows.filter((row) => row.metric === 'workoutDistance')
    const diet = adherenceTotals(adherence.filter((day) => inWeek(day.day)))
    // Passos do dia: o relógio vem antes do Health Connect.
    const stepsByDay = new Map()
    rows
      .filter((row) => row.metric === 'steps' && inWeek(row.timestamp) && [WATCH_DEVICE, HEALTH_CONNECT_DEVICE].includes(row.device))
      .sort((a, b) => (a.device === WATCH_DEVICE ? 1 : 0) - (b.device === WATCH_DEVICE ? 1 : 0))
      .forEach((row) => stepsByDay.set(row.timestamp, row.value))
    const avgSteps = mean([...stepsByDay.values()])
    result.push({
      start,
      end,
      avgWeightKg: weights.length ? round2(mean(weights)) : null,
      deltaKg: null,
      dietPct: diet.pct,
      offMeals: diet.off,
      dietPlanned: diet.planned,
      workouts: durations.length,
      workoutMinutes: Math.round(durations.reduce((sum, row) => sum + row.value, 0) / 60),
      distanceKm: round2(distances.reduce((sum, row) => sum + row.value, 0) / 1000),
      avgSteps: avgSteps == null ? null : Math.round(avgSteps),
    })
  }
  // Variação do peso médio em relação à semana anterior.
  result.forEach((row, i) => {
    const previous = result[i - 1]
    if (previous && row.avgWeightKg != null && previous.avgWeightKg != null) row.deltaKg = round2(row.avgWeightKg - previous.avgWeightKg)
  })
  return result.filter((row) => row.avgWeightKg != null || row.dietPlanned > 0 || row.workouts > 0 || row.avgSteps != null)
}

/**
 * Conclusões simples: variação média do peso nas semanas boas × fracas de dieta e de treino.
 * Só aparece com pelo menos 2 semanas de cada lado.
 * @returns {string[]}
 */
export function weeklyFindings(weeksList) {
  const findings = []
  const withDelta = weeksList.filter((week) => week.deltaKg != null)

  /** Compara dois grupos de semanas. */
  const compare = (good, weak, goodLabel, weakLabel) => {
    if (good.length < 2 || weak.length < 2) return
    const goodDelta = mean(good.map((week) => week.deltaKg))
    const weakDelta = mean(weak.map((week) => week.deltaKg))
    const fmt = (value) => `${value > 0 ? '+' : ''}${formatNumber(value, 2)} kg`
    findings.push(`${goodLabel}: o peso variou em média ${fmt(goodDelta)} por semana; ${weakLabel}: ${fmt(weakDelta)}.`)
  }

  const dietWeeks = withDelta.filter((week) => week.dietPct != null)
  compare(
    dietWeeks.filter((week) => week.dietPct >= GOOD_DIET_PCT),
    dietWeeks.filter((week) => week.dietPct < GOOD_DIET_PCT),
    `Semanas com dieta seguida ≥ ${GOOD_DIET_PCT}%`,
    'abaixo disso',
  )
  compare(
    withDelta.filter((week) => week.workoutMinutes >= GOOD_TRAINING_MIN),
    withDelta.filter((week) => week.workoutMinutes < GOOD_TRAINING_MIN),
    `Semanas com ${GOOD_TRAINING_MIN} min ou mais de treino`,
    'com menos',
  )
  return findings
}
