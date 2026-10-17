// Conversão entre a leitura da balança e as linhas do banco local.
// O banco guarda séries temporais { userId, device, metric, timestamp, value, unit }
// (README, "Arquitetura pretendida"). Uma pesagem vira duas linhas: peso e impedância.

export const SCALE_DEVICE = 'scale';

/**
 * Monta o evento "measurement" do hub a partir de uma pesagem final.
 * @param {{ timestamp: number, weightKg: number, impedanceOhm: number }} reading
 * @param {string} userId
 */
export function weighingToMeasurement(reading, userId) {
  return {
    userId,
    device: SCALE_DEVICE,
    timestamp: reading.timestamp,
    metrics: [
      { metric: 'weight', value: reading.weightKg, unit: 'kg' },
      { metric: 'impedance', value: reading.impedanceOhm, unit: 'ohm' },
    ],
  };
}

/**
 * Último peso de cada usuário (linhas de todos os usuários).
 * @param {Array<{ userId: string, device: string, metric: string, timestamp: number, value: number }>} rows
 * @returns {Map<string, number>} userId → último peso (kg)
 */
export function latestWeightByUser(rows) {
  const latest = new Map()
  for (const row of rows) {
    if (row.device !== SCALE_DEVICE || row.metric !== 'weight') continue
    const current = latest.get(row.userId)
    if (!current || row.timestamp > current.timestamp) latest.set(row.userId, { timestamp: row.timestamp, value: row.value })
  }
  return new Map([...latest].map(([userId, entry]) => [userId, entry.value]))
}

/**
 * Reagrupa as linhas do banco em pesagens, da mais antiga para a mais recente.
 * @param {Array<{ device: string, metric: string, timestamp: number, value: number }>} rows
 * @returns {Array<{ timestamp: number, weightKg: number, impedanceOhm: number }>}
 */
export function groupWeighings(rows) {
  const byTimestamp = new Map();
  for (const row of rows) {
    // Só interessam as linhas da balança.
    if (row.device !== SCALE_DEVICE) continue;
    const weighing = byTimestamp.get(row.timestamp) ?? { timestamp: row.timestamp, weightKg: null, impedanceOhm: 0 };
    if (row.metric === 'weight') weighing.weightKg = row.value;
    if (row.metric === 'impedance') weighing.impedanceOhm = row.value;
    byTimestamp.set(row.timestamp, weighing);
  }
  // Descarta grupos sem peso e ordena pelo horário.
  return [...byTimestamp.values()]
    .filter((weighing) => weighing.weightKg != null)
    .sort((a, b) => a.timestamp - b.timestamp);
}
