// Água (funções puras): registro dos copos, total por dia e a meta recomendada pela altura e pelo peso.
// Cada copo é uma linha do banco: device "water", métrica "waterMl", valor em ml, no horário em que bebeu.

export const WATER_DEVICE = 'water'
export const WATER_METRIC = 'waterMl'
// Botões rápidos (ml).
export const GLASS_SIZES = [200, 250, 500]

const round50 = (ml) => Math.round(ml / 50) * 50
const isWaterRow = (row) => row.device === WATER_DEVICE && row.metric === WATER_METRIC

/** Meia-noite local do dia. */
function localDay(timestamp) {
  const date = new Date(timestamp)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Meia-noite local `offset` dias depois. */
function shiftDay(dayMs, offset) {
  const date = new Date(dayMs)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset).getTime()
}

/**
 * Meta diária de água: orientação geral para adultos saudáveis (não substitui orientação médica;
 * quem tem doença renal ou cardíaca deve seguir o médico).
 * - pelo peso: 35 ml por kg;
 * - pela altura e pelo peso: 1,5 L por m² de superfície corporal (Mosteller: √(altura cm × peso kg ÷ 3600));
 * - meta = média das duas (só a do peso, se faltar a altura) + 500 ml por hora de treino no dia.
 * @returns {{ goalMl: number, byWeightMl: number | null, byBodySurfaceMl: number | null,
 *             bodySurfaceM2: number | null, trainingMl: number, estimated: boolean }}
 *   estimated = true quando não há peso (meta padrão de 2 L)
 */
export function recommendedWater({ weightKg, heightCm, workoutMinutes = 0 }) {
  const trainingMl = round50((workoutMinutes / 60) * 500)
  if (!weightKg) return { goalMl: 2000 + trainingMl, byWeightMl: null, byBodySurfaceMl: null, bodySurfaceM2: null, trainingMl, estimated: true }
  const byWeightMl = round50(35 * weightKg)
  const bodySurfaceM2 = heightCm ? Math.round(Math.sqrt((heightCm * weightKg) / 3600) * 100) / 100 : null
  const byBodySurfaceMl = bodySurfaceM2 ? round50(1500 * bodySurfaceM2) : null
  const base = byBodySurfaceMl ? (byWeightMl + byBodySurfaceMl) / 2 : byWeightMl
  return { goalMl: round50(base) + trainingMl, byWeightMl, byBodySurfaceMl, bodySurfaceM2, trainingMl, estimated: false }
}

/**
 * Copos de um dia (mais antigos primeiro) e o total.
 * @returns {{ totalMl: number, drinks: Array<{ id: string, at: number, ml: number }> }}
 */
export function waterOfDay(rows, dayMs) {
  const start = localDay(dayMs)
  const end = shiftDay(start, 1)
  const drinks = rows
    .filter((row) => isWaterRow(row) && row.timestamp >= start && row.timestamp < end)
    .map((row) => ({ id: row.id, at: row.timestamp, ml: row.value }))
    .sort((a, b) => a.at - b.at)
  return { totalMl: drinks.reduce((sum, drink) => sum + drink.ml, 0), drinks }
}

/** Total por dia dos últimos `days` dias (o mais antigo primeiro). */
export function waterByDay(rows, { days = 7, now = Date.now() } = {}) {
  const today = localDay(now)
  return Array.from({ length: days }, (_, i) => {
    const day = shiftDay(today, i - days + 1)
    return { day, totalMl: waterOfDay(rows, day).totalMl }
  })
}

/** Evento "measurement" do hub para um copo. */
export function waterToMeasurement(userId, ml, at = Date.now()) {
  return { userId, device: WATER_DEVICE, timestamp: at, metrics: [{ metric: WATER_METRIC, value: ml, unit: 'ml' }] }
}

/** 2600 → "2,6 L"; 250 → "250 ml". */
export function formatWater(ml) {
  if (ml == null) return '--'
  if (ml < 1000) return `${Math.round(ml)} ml`
  return `${(ml / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} L`
}
