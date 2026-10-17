// Converte uma sincronização do relógio no evento "measurement" do hub.
// Cada métrica leva o próprio horário (ex.: a FC das 18:30 fica com timestamp das 18:30),
// e o hub grava com chave determinística, então sincronizar de novo não duplica dados.
import { SLOT_MINUTES } from './njjProtocol.js'

export const WATCH_DEVICE = 'watch'

/** Meia-noite local do dia de um timestamp. */
export function startOfLocalDay(ms) {
  const date = new Date(ms)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Horário de uma posição do dia (ex.: posição 37 de 30 min = 18:30). */
export function slotTimestamp(dayStartMs, index, minutesPerSlot = SLOT_MINUTES) {
  const date = new Date(dayStartMs)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, index * minutesPerSlot).getTime()
}

/**
 * @param {object} data - resultado de watchSession.syncAll()
 * @param {string} userId
 * @returns {{ userId: string, device: string, timestamp: number,
 *             metrics: Array<{ metric: string, value: number, unit: string, timestamp: number }> }}
 */
export function watchSyncToMeasurement(data, userId) {
  // Os históricos do relógio são sempre do dia da sincronização.
  const dayStart = startOfLocalDay(data.syncedAt)
  const metrics = []
  const add = (metric, value, unit, timestamp) => metrics.push({ metric, value, unit, timestamp })

  // A bateria não é gravada: o app só mostra a bateria ao vivo (economiza uma linha por sincronização).
  // Passos do dia: um registro por dia (a próxima sincronização atualiza o mesmo).
  if (data.summary) add('steps', data.summary.steps, 'passos', dayStart)

  // Históricos de 30 min: só as posições com medição (0 = sem medição).
  data.heartRate?.forEach((bpm, index) => {
    if (bpm > 0) add('heartRate', bpm, 'bpm', slotTimestamp(dayStart, index))
  })
  data.spo2?.forEach((percent, index) => {
    if (percent > 0) add('spo2', percent, '%', slotTimestamp(dayStart, index))
  })
  data.bloodPressure?.forEach(({ systolic, diastolic }, index) => {
    if (systolic > 0) {
      add('bpSystolic', systolic, 'mmHg', slotTimestamp(dayStart, index))
      add('bpDiastolic', diastolic, 'mmHg', slotTimestamp(dayStart, index))
    }
  })

  // Passos por hora (posições de 60 min).
  data.hourSteps?.forEach(({ steps }, hour) => {
    if (steps > 0) add('stepsHour', steps, 'passos', slotTimestamp(dayStart, hour, 60))
  })

  // Sono: registrado no horário em que a pessoa acordou.
  if (data.sleep) {
    add('sleepMinutes', data.sleep.asleepMinutes, 'min', data.sleep.endMs)
    add('sleepDeepMinutes', data.sleep.deepMinutes, 'min', data.sleep.endMs)
    add('sleepLightMinutes', data.sleep.lightMinutes, 'min', data.sleep.endMs)
    add('sleepAwakeMinutes', data.sleep.awakeMinutes, 'min', data.sleep.endMs)
  }

  return { userId, device: WATCH_DEVICE, timestamp: data.syncedAt, metrics }
}

/**
 * Lista os pontos de uma métrica do relógio a partir das linhas do banco.
 * @param {Array<{ device: string, metric: string, timestamp: number, value: number }>} rows
 * @param {string} metric
 * @returns {Array<{ timestamp: number, value: number }>} em ordem cronológica
 */
export function watchSeries(rows, metric) {
  return rows
    .filter((row) => row.device === WATCH_DEVICE && row.metric === metric)
    .map(({ timestamp, value }) => ({ timestamp, value }))
    .sort((a, b) => a.timestamp - b.timestamp)
}
