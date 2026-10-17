// Resumo semanal em frases e avisos informativos, a partir das pesagens e dos dados de atividade.
// Os avisos são informação, não diagnóstico: a UI sempre mostra essa ressalva.
import { WATCH_DEVICE } from '../devices/watch/watchMeasurements.js'
import { HEALTH_CONNECT_DEVICE } from '../integrations/healthConnect/healthConnectMapping.js'
import { DAY_MS } from '../utils/date.js'
import { WORKOUT_DEVICE } from '../workouts/recording.js'
import { adherenceTotals, dailyAdherence } from '../diet/adherence.js'
import { formatWater, waterByDay } from '../water/water.js'
import { formatMinutes, formatNumber } from '../utils/format.js'
import { buildCrossRows } from './crossMetrics.js'

// Fontes de atividade aceitas (relógio primeiro).
const ACTIVITY_SOURCES = [WATCH_DEVICE, HEALTH_CONNECT_DEVICE]

/** Linhas de uma métrica de atividade dentro de [from, to). */
function activityRows(rows, metric, from, to) {
  return rows.filter(
    (row) => ACTIVITY_SOURCES.includes(row.device) && row.metric === metric && row.timestamp >= from && row.timestamp < to,
  )
}

/** Média simples (null se vazio). */
const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null)

/** Um valor por dia (o do relógio, se houver os dois). */
function perDay(rows, pick) {
  const byDay = new Map()
  for (const row of rows) {
    const date = new Date(row.timestamp)
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    const list = byDay.get(key) ?? []
    list.push(row)
    byDay.set(key, list)
  }
  return [...byDay.values()].map(pick)
}

/** FC de repouso diária = menor FC registrada no dia. */
function dailyRestingHeartRate(rows, from, to) {
  return perDay(
    activityRows(rows, 'heartRate', from, to).filter((row) => row.value > 0),
    (list) => Math.min(...list.map((row) => row.value)),
  )
}

/**
 * Frases do resumo dos últimos 7 dias.
 * @returns {string[]}
 */
export function weeklySummary({ weighings, rows, plan = null, now = Date.now() }) {
  const sentences = []
  const weekStart = now - 7 * DAY_MS
  const previousStart = now - 14 * DAY_MS

  // Peso: média da semana e diferença para a semana anterior.
  const thisWeek = weighings.filter((w) => w.timestamp >= weekStart && w.timestamp <= now).map((w) => w.weightKg)
  const lastWeek = weighings.filter((w) => w.timestamp >= previousStart && w.timestamp < weekStart).map((w) => w.weightKg)
  if (thisWeek.length) {
    let text = `Peso médio da semana: ${formatNumber(mean(thisWeek), 2)} kg (${thisWeek.length} ${thisWeek.length > 1 ? 'pesagens' : 'pesagem'})`
    if (lastWeek.length) {
      const delta = mean(thisWeek) - mean(lastWeek)
      text += `, ${delta <= 0 ? '' : '+'}${formatNumber(delta, 2)} kg em relação à semana anterior`
    }
    sentences.push(`${text}.`)
  }

  // Sono: média por noite.
  const nights = perDay(activityRows(rows, 'sleepMinutes', weekStart, now), (list) => list[0].value)
  if (nights.length) sentences.push(`Sono: média de ${formatMinutes(Math.round(mean(nights)))} por noite (${nights.length} noite${nights.length > 1 ? 's' : ''}).`)

  // Passos: média por dia.
  const steps = perDay(activityRows(rows, 'steps', weekStart, now), (list) => {
    const watch = list.find((row) => row.device === WATCH_DEVICE)
    return (watch ?? list[0]).value
  })
  if (steps.length) sentences.push(`Passos: média de ${formatNumber(Math.round(mean(steps)), 0)} por dia.`)

  // Treinos gravados na aba Treino (GPS do celular): quantidade, tempo e distância.
  const workoutRows = rows.filter((row) => row.device === WORKOUT_DEVICE && row.timestamp >= weekStart && row.timestamp <= now)
  const durations = workoutRows.filter((row) => row.metric === 'workoutDuration')
  if (durations.length) {
    const minutes = Math.round(durations.reduce((sum, row) => sum + row.value, 0) / 60)
    const km = workoutRows.filter((row) => row.metric === 'workoutDistance').reduce((sum, row) => sum + row.value, 0) / 1000
    const count = `${durations.length} ${durations.length > 1 ? 'treinos' : 'treino'}`
    sentences.push(`Treinos: ${count}, ${formatMinutes(minutes)} em movimento${km > 0 ? `, ${formatNumber(km, 1)} km` : ''}.`)
  }

  // Dieta: refeições do plano feitas nos últimos 7 dias (e quantas ficaram fora do plano).
  const diet = adherenceTotals(dailyAdherence({ plan, rows, days: 7, now }))
  if (diet.planned) {
    let text = `Dieta: ${diet.pct}% das refeições seguidas (${diet.done} de ${diet.planned})`
    if (diet.off) text += `, ${diet.off} fora do plano`
    sentences.push(`${text}.`)
  }

  // Água: média por dia nos dias com registro.
  const waterDays = waterByDay(rows, { days: 7, now }).filter((day) => day.totalMl > 0)
  if (waterDays.length) {
    const average = waterDays.reduce((sum, day) => sum + day.totalMl, 0) / waterDays.length
    sentences.push(`Água: média de ${formatWater(average)} por dia (${waterDays.length} dia${waterDays.length > 1 ? 's' : ''} com registro).`)
  }

  // FC de repouso.
  const resting = dailyRestingHeartRate(rows, weekStart, now)
  if (resting.length) sentences.push(`FC de repouso média: ${Math.round(mean(resting))} bpm.`)

  // Cruzamento sono × peso da manhã seguinte (precisa de pelo menos 2 manhãs de cada lado).
  const cross = buildCrossRows({ weighings, rows, limit: 60 }).filter((row) => row.sleepMinutes != null)
  const short = cross.filter((row) => row.sleepMinutes < 360).map((row) => row.weightKg)
  const enough = cross.filter((row) => row.sleepMinutes >= 360).map((row) => row.weightKg)
  if (short.length >= 2 && enough.length >= 2) {
    const delta = mean(short) - mean(enough)
    sentences.push(
      `Nas manhãs depois de noites com menos de 6 h de sono, o peso veio em média ${formatNumber(Math.abs(delta), 2)} kg ${delta >= 0 ? 'maior' : 'menor'}.`,
    )
  }

  return sentences
}

/**
 * Avisos informativos (nunca diagnóstico).
 * @returns {Array<{ level: 'info' | 'attention', text: string }>}
 */
export function healthAlerts({ rows, now = Date.now() }) {
  const alerts = []

  // FC de repouso subindo: média dos últimos 7 dias × média das 3 semanas anteriores.
  const recent = dailyRestingHeartRate(rows, now - 7 * DAY_MS, now)
  const baseline = dailyRestingHeartRate(rows, now - 28 * DAY_MS, now - 7 * DAY_MS)
  if (recent.length >= 3 && baseline.length >= 7 && mean(recent) - mean(baseline) >= 5) {
    alerts.push({
      level: 'attention',
      text: `Sua FC de repouso está ${Math.round(mean(recent) - mean(baseline))} bpm acima da média das 3 semanas anteriores. Cansaço, estresse, pouco sono ou doença podem causar isso.`,
    })
  }

  // SpO2 baixa em vários dias.
  const lowDays = perDay(activityRows(rows, 'spo2', now - 7 * DAY_MS, now), (list) => Math.min(...list.map((row) => row.value))).filter(
    (value) => value < 92,
  )
  if (lowDays.length >= 3) {
    alerts.push({
      level: 'attention',
      text: `O relógio registrou SpO2 abaixo de 92 % em ${lowDays.length} dias desta semana. Leituras de pulso podem falhar; se repetir, vale conversar com um médico.`,
    })
  }

  // Pouco sono na média.
  const nights = perDay(activityRows(rows, 'sleepMinutes', now - 7 * DAY_MS, now), (list) => list[0].value)
  if (nights.length >= 3 && mean(nights) < 360) {
    alerts.push({ level: 'info', text: `Você dormiu em média ${formatMinutes(Math.round(mean(nights)))} por noite nesta semana, menos de 6 h.` })
  }

  return alerts
}
