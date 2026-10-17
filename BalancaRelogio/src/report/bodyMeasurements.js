// Medidas corporais registradas à mão (fita métrica) e a relação cintura-quadril (RCQ).
// Ficam no banco local como séries temporais com origem "manual".

export const MANUAL_DEVICE = 'manual'

// Campos do formulário de medidas (cm).
export const MEASUREMENT_FIELDS = [
  { key: 'waistCm', label: 'Cintura' },
  { key: 'hipCm', label: 'Quadril' },
  { key: 'armCm', label: 'Braço' },
  { key: 'neckCm', label: 'Pescoço' },
]

/**
 * Evento "measurement" do hub para um registro de medidas.
 * @param {Record<string, number | null>} values - centímetros (campos vazios são ignorados)
 */
export function measurementsToEvent(values, userId, timestamp) {
  const metrics = MEASUREMENT_FIELDS.filter((field) => values[field.key] > 0).map((field) => ({
    metric: field.key,
    value: values[field.key],
    unit: 'cm',
  }))
  return { userId, device: MANUAL_DEVICE, timestamp, metrics }
}

/** Relação cintura-quadril com 2 casas (null se faltar uma das medidas). */
export function waistHipRatio(waistCm, hipCm) {
  if (!(waistCm > 0) || !(hipCm > 0)) return null
  return Math.round((waistCm / hipCm) * 100) / 100
}

/**
 * Agrupa as linhas manuais por registro, da mais recente para a mais antiga.
 * @returns {Array<{ timestamp: number, waistCm?: number, hipCm?: number, armCm?: number, neckCm?: number, whr: number | null }>}
 */
export function groupMeasurements(rows) {
  const byTimestamp = new Map()
  for (const row of rows) {
    if (row.device !== MANUAL_DEVICE) continue
    const entry = byTimestamp.get(row.timestamp) ?? { timestamp: row.timestamp }
    entry[row.metric] = row.value
    byTimestamp.set(row.timestamp, entry)
  }
  return [...byTimestamp.values()]
    .map((entry) => ({ ...entry, whr: waistHipRatio(entry.waistCm, entry.hipCm) }))
    .sort((a, b) => b.timestamp - a.timestamp)
}
