// Tendência de peso: o peso oscila 0,5–1 kg de um dia para o outro, então a direção real
// aparece na média móvel e no ritmo semanal (regressão linear), não na pesagem isolada.
// Antes da média: pesagens fora da curva (outra pessoa, mochila, pesagem incompleta) são ignoradas
// e várias pesagens no mesmo dia viram um ponto só (a mediana do dia).
import { DAY_MS } from '../utils/date.js'

/** Mediana de uma lista de números. */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** Meia-noite local do dia de um horário. */
function localDay(timestamp) {
  const date = new Date(timestamp)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/**
 * Marca as pesagens fora da curva: mais longe que max(3 kg, 4 %) da mediana das vizinhas (±7 dias).
 * Precisa de pelo menos 2 vizinhas para julgar; com menos, nada é marcado.
 * @returns {Array<object>} as mesmas pesagens, com `outlier: boolean`
 */
export function flagOutliers(weighings, { windowDays = 7, minKg = 3, minFraction = 0.04 } = {}) {
  return weighings.map((weighing) => {
    const neighbors = weighings.filter(
      (other) => other !== weighing && Math.abs(other.timestamp - weighing.timestamp) <= windowDays * DAY_MS,
    )
    if (neighbors.length < 2) return { ...weighing, outlier: false }
    const reference = median(neighbors.map((other) => other.weightKg))
    return { ...weighing, outlier: Math.abs(weighing.weightKg - reference) > Math.max(minKg, reference * minFraction) }
  })
}

/**
 * Um ponto por dia: a mediana das pesagens do dia (sem as fora da curva), no horário da primeira delas.
 * @returns {Array<{ timestamp: number, weightKg: number, count: number }>} em ordem cronológica
 */
export function dailyWeights(weighings) {
  const byDay = new Map()
  for (const weighing of [...weighings].sort((a, b) => a.timestamp - b.timestamp)) {
    if (weighing.outlier) continue
    const day = localDay(weighing.timestamp)
    const entry = byDay.get(day) ?? { timestamp: weighing.timestamp, values: [] }
    entry.values.push(weighing.weightKg)
    byDay.set(day, entry)
  }
  return [...byDay.values()].map((entry) => ({
    timestamp: entry.timestamp,
    weightKg: Math.round(median(entry.values) * 100) / 100,
    count: entry.values.length,
  }))
}

/**
 * Prepara as pesagens para a tendência.
 * @returns {{ daily: Array<object>, outliers: Array<object> }}
 */
export function prepareTrend(weighings) {
  const flagged = flagOutliers(weighings)
  return { daily: dailyWeights(flagged), outliers: flagged.filter((weighing) => weighing.outlier) }
}

/**
 * Média móvel por tempo: para cada pesagem, a média das pesagens dos `windowDays` dias anteriores (inclusive).
 * @param {Array<{ timestamp: number, weightKg: number }>} weighings
 * @param {number} [windowDays]
 * @returns {Array<{ timestamp: number, weightKg: number, average: number }>} em ordem cronológica
 */
export function movingAverage(weighings, windowDays = 7) {
  const sorted = [...weighings].sort((a, b) => a.timestamp - b.timestamp)
  return sorted.map((weighing) => {
    const window = sorted.filter(
      (other) => other.timestamp <= weighing.timestamp && weighing.timestamp - other.timestamp < windowDays * DAY_MS,
    )
    const average = window.reduce((sum, other) => sum + other.weightKg, 0) / window.length
    return { ...weighing, average: Math.round(average * 100) / 100 }
  })
}

/**
 * Ritmo em kg por semana: inclinação da reta (mínimos quadrados) das pesagens dos últimos `days` dias.
 * Precisa de 3 pesagens que cubram pelo menos 7 dias; senão devolve null.
 */
export function weeklyRate(weighings, { days = 28, now = Date.now() } = {}) {
  const recent = weighings.filter((w) => w.timestamp <= now && now - w.timestamp <= days * DAY_MS)
  if (recent.length < 3) return null
  const xs = recent.map((w) => w.timestamp / DAY_MS)
  const span = Math.max(...xs) - Math.min(...xs)
  if (span < 7) return null
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length
  const meanY = recent.reduce((a, w) => a + w.weightKg, 0) / recent.length
  let numerator = 0
  let denominator = 0
  recent.forEach((w, i) => {
    numerator += (xs[i] - meanX) * (w.weightKg - meanY)
    denominator += (xs[i] - meanX) ** 2
  })
  return Math.round((numerator / denominator) * 7 * 100) / 100
}

/**
 * Projeção até o peso-alvo no ritmo atual.
 * @returns {{ reachable: boolean, weeks: number | null, dateMs: number | null }}
 *   reachable = false quando o ritmo vai na direção contrária ou é praticamente zero
 */
export function projectGoal({ currentKg, targetKg, ratePerWeek, now = Date.now() }) {
  if (currentKg == null || targetKg == null || ratePerWeek == null) return { reachable: false, weeks: null, dateMs: null }
  const remaining = targetKg - currentKg
  if (Math.abs(remaining) < 0.1) return { reachable: true, weeks: 0, dateMs: now }
  // Abaixo de 50 g/semana, considera estável.
  if (Math.abs(ratePerWeek) < 0.05 || Math.sign(remaining) !== Math.sign(ratePerWeek)) {
    return { reachable: false, weeks: null, dateMs: null }
  }
  const weeks = remaining / ratePerWeek
  return { reachable: true, weeks: Math.round(weeks * 10) / 10, dateMs: now + weeks * 7 * DAY_MS }
}

/**
 * Resumo para a tela inicial e a de tendência.
 * @returns {null | { latest: object, average7: number, ratePerWeek: number | null,
 *                    projection: object, changeInPeriod: number | null, outlierCount: number }}
 */
export function weightTrendSummary(weighings, { targetKg = null, periodDays = 30, now = Date.now() } = {}) {
  if (!weighings.length) return null
  // Um ponto por dia, sem as pesagens fora da curva.
  const { daily, outliers } = prepareTrend(weighings)
  if (!daily.length) return null
  const series = movingAverage(daily)
  const latest = series.at(-1)
  const ratePerWeek = weeklyRate(daily, { now })
  const inPeriod = series.filter((w) => now - w.timestamp <= periodDays * DAY_MS)
  return {
    latest,
    average7: latest.average,
    ratePerWeek,
    projection: projectGoal({ currentKg: latest.average, targetKg, ratePerWeek, now }),
    changeInPeriod: inPeriod.length >= 2 ? Math.round((inPeriod.at(-1).average - inPeriod[0].average) * 100) / 100 : null,
    outlierCount: outliers.length,
  }
}
