// Cruzamentos balança × atividade × treinos × dieta (README, "Integração balança ↔ relógio").
// Cada pesagem é ligada ao "dia do usuário" em que aconteceu:
//   - passos do dia anterior;
//   - sono que terminou nas 18 h antes da pesagem (a noite anterior, para pesagens de manhã);
//   - FC de repouso = menor FC registrada nas 24 h antes da pesagem;
//   - minutos de treino do dia anterior (aba Treino);
//   - dieta do dia anterior: % das refeições feitas e quantas ficaram fora do plano.
// Fontes de atividade: o relógio e, como reserva, o que foi importado do Health Connect (Samsung Health, Google…).
import { WATCH_DEVICE, startOfLocalDay } from '../devices/watch/watchMeasurements.js'
import { dailyAdherence } from '../diet/adherence.js'
import { HEALTH_CONNECT_DEVICE } from '../integrations/healthConnect/healthConnectMapping.js'
import { WORKOUT_DEVICE } from '../workouts/recording.js'

const HOUR_MS = 60 * 60 * 1000
const SLEEP_WINDOW_MS = 18 * HOUR_MS
const RESTING_HR_WINDOW_MS = 24 * HOUR_MS

// Ordem de preferência das fontes: o relógio vem antes do Health Connect.
const SOURCES = [WATCH_DEVICE, HEALTH_CONNECT_DEVICE]
const sourceRank = (row) => SOURCES.indexOf(row.device)

/**
 * @param {object} params
 * @param {Array<{ timestamp: number, weightKg: number }>} params.weighings
 * @param {Array<{ device: string, metric: string, timestamp: number, value: number }>} params.rows - linhas do banco
 * @param {object | null} [params.plan] - plano alimentar principal (para a dieta do dia anterior)
 * @param {number} [params.limit] - quantas pesagens (as mais recentes)
 * @param {number} [params.now]
 * @returns {Array<{ timestamp: number, weightKg: number, stepsPreviousDay: number | null,
 *                   sleepMinutes: number | null, restingHeartRate: number | null,
 *                   workoutMinutesPreviousDay: number | null, dietPreviousDay: { pct: number | null, off: number } | null }>}
 */
export function buildCrossRows({ weighings, rows, plan = null, limit = 7, now = Date.now() }) {
  // Só as linhas de atividade, de fontes conhecidas.
  const activityRows = rows.filter((row) => sourceRank(row) >= 0)
  const byMetric = (metric) => activityRows.filter((row) => row.metric === metric)
  const steps = byMetric('steps')
  const sleep = byMetric('sleepMinutes')
  const heartRate = byMetric('heartRate').filter((row) => row.value > 0)
  const workoutDurations = rows.filter((row) => row.device === WORKOUT_DEVICE && row.metric === 'workoutDuration')
  // Dieta por dia (até 120 dias para trás).
  const dietByDay = new Map(dailyAdherence({ plan, rows, days: 120, now }).map((day) => [day.day, day]))

  return [...weighings]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit)
    .map((weighing) => {
      // Meia-noite do dia anterior (calculada pelo calendário, seguro em horário de verão).
      const previousDay = startOfLocalDay(startOfLocalDay(weighing.timestamp) - 1)
      const stepsRow = steps.filter((row) => row.timestamp === previousDay).sort((a, b) => sourceRank(a) - sourceRank(b))[0]

      // Sono mais recente que terminou antes da pesagem, dentro da janela (relógio primeiro).
      const sleepRow = sleep
        .filter((row) => row.timestamp <= weighing.timestamp && weighing.timestamp - row.timestamp <= SLEEP_WINDOW_MS)
        .sort((a, b) => sourceRank(a) - sourceRank(b) || b.timestamp - a.timestamp)[0]

      // FC de repouso: a menor FC das 24 h anteriores, de qualquer fonte.
      const recentHr = heartRate
        .filter((row) => row.timestamp <= weighing.timestamp && weighing.timestamp - row.timestamp <= RESTING_HR_WINDOW_MS)
        .map((row) => row.value)

      // Treinos do dia anterior (minutos em movimento).
      const workoutSeconds = workoutDurations
        .filter((row) => startOfLocalDay(row.timestamp) === previousDay)
        .reduce((sum, row) => sum + row.value, 0)
      const diet = dietByDay.get(previousDay)

      return {
        timestamp: weighing.timestamp,
        weightKg: weighing.weightKg,
        stepsPreviousDay: stepsRow ? stepsRow.value : null,
        sleepMinutes: sleepRow ? sleepRow.value : null,
        restingHeartRate: recentHr.length ? Math.min(...recentHr) : null,
        workoutMinutesPreviousDay: workoutSeconds ? Math.round(workoutSeconds / 60) : null,
        dietPreviousDay: diet && diet.planned ? { pct: diet.pct, off: diet.off } : null,
      }
    })
}

/** Indica se algum cruzamento tem dado (relógio, treino ou dieta), para decidir se a tabela aparece. */
export function hasWatchData(crossRows) {
  return crossRows.some(
    (row) =>
      row.stepsPreviousDay != null ||
      row.sleepMinutes != null ||
      row.restingHeartRate != null ||
      row.workoutMinutesPreviousDay != null ||
      row.dietPreviousDay != null,
  )
}
