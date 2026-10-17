// Conversão entre os eventos do hub e as amostras do Health Connect (plugin @capgo/capacitor-health).
// Função pura, testável sem celular.
//
// O Health Connect não aceita uma chave definida pelo app, então cada amostra leva uma `key` estável
// e o app guarda as chaves já enviadas (storage/db.js) para não duplicar no Samsung Health / Google.
import { computeBodyComposition } from '../../devices/scale/bodyComposition.js'
import { SCALE_DEVICE } from '../../devices/scale/weighings.js'
import { WATCH_DEVICE, startOfLocalDay } from '../../devices/watch/watchMeasurements.js'
import { WATER_DEVICE, WATER_METRIC } from '../../water/water.js'
import { WORKOUT_DEVICE, workoutToMeasurement } from '../../workouts/recording.js'

// Origem das linhas importadas do Health Connect no banco local.
export const HEALTH_CONNECT_DEVICE = 'healthconnect'

// ID do app Android (capacitor.config.json); usado para não reimportar o que o próprio app gravou.
export const APP_PACKAGE_ID = 'com.hubsaude.app'

// Tipos pedidos ao Health Connect (nomes do plugin).
export const HEALTH_TYPES = {
  writeScale: ['weight', 'bodyFat', 'basalCalories'],
  writeWatch: ['steps', 'heartRate', 'oxygenSaturation', 'bloodPressure', 'sleep'],
  writeWorkout: ['distance', 'calories'],
  writeWater: ['dietaryWater'],
  read: ['steps', 'heartRate', 'sleep'],
}

const HOUR_MS = 60 * 60 * 1000
// O Health Connect (pelo plugin) não deixa corrigir nem apagar um registro depois de gravado. Por isso só vão
// valores finais: a meia hora de FC/SpO2/pressão já terminou e o sono acabou há pelo menos 30 min.
const SLOT_MS = 30 * 60 * 1000
const SLEEP_SETTLE_MS = 30 * 60 * 1000
// Copo de água: espera 5 min antes de enviar (dá tempo de desfazer um toque errado).
const WATER_SETTLE_MS = 5 * 60 * 1000
const iso = (ms) => new Date(ms).toISOString()

/**
 * Amostras a gravar no Health Connect para um evento "measurement" do hub.
 * @param {object} event - { device, timestamp, metrics: [{ metric, value, unit, timestamp? }] }
 * @param {object} options
 * @param {object | null} options.profile - perfil (altura, idade, sexo) para % de gordura e TMB
 * @param {boolean} [options.exportScale]
 * @param {boolean} [options.exportWatch]
 * @param {boolean} [options.exportWorkout]
 * @param {boolean} [options.exportWater]
 * @param {number} [options.now]
 * @returns {Array<{ key: string, options: object }>} `options` vai direto para Health.saveSample()
 */
export function measurementToSamples(
  event,
  { profile, exportScale = true, exportWatch = true, exportWorkout = true, exportWater = true, now = Date.now() },
) {
  const at = (metric) => metric.timestamp ?? event.timestamp
  const samples = []

  // ---- Balança: peso, % de gordura e TMB ----
  if (event.device === SCALE_DEVICE && exportScale) {
    const weight = event.metrics.find((m) => m.metric === 'weight')
    const impedance = event.metrics.find((m) => m.metric === 'impedance')
    if (weight) {
      const time = at(weight)
      samples.push({ key: `weight|${time}`, options: { dataType: 'weight', value: weight.value, startDate: iso(time) } })
      // Composição estimada (mesmas fórmulas do OKOK) só com perfil preenchido.
      if (profile) {
        const composition = computeBodyComposition({
          weightKg: weight.value,
          heightCm: profile.heightCm,
          age: profile.age,
          sex: profile.sex,
          impedanceOhm: impedance?.value ?? 0,
        })
        if (composition.fatPercent != null) {
          samples.push({ key: `bodyFat|${time}`, options: { dataType: 'bodyFat', value: composition.fatPercent, startDate: iso(time) } })
        }
        if (composition.bmrKcal != null) {
          samples.push({
            key: `basalCalories|${time}`,
            options: { dataType: 'basalCalories', value: composition.bmrKcal, startDate: iso(time) },
          })
        }
      }
    }
  }

  // ---- Relógio: passos por hora, FC, SpO2, pressão e sono ----
  if (event.device === WATCH_DEVICE && exportWatch) {
    const byTimestamp = (metric) => new Map(event.metrics.filter((m) => m.metric === metric).map((m) => [at(m), m.value]))

    for (const m of event.metrics) {
      const time = at(m)
      // Passos: intervalos de 1 h, só depois que a hora terminou (a hora atual ainda está mudando).
      if (m.metric === 'stepsHour' && time + HOUR_MS <= now) {
        samples.push({
          key: `steps|${time}`,
          options: { dataType: 'steps', value: m.value, startDate: iso(time), endDate: iso(time + HOUR_MS) },
        })
      }
      // FC e SpO2: posições de 30 min, só depois que a meia hora terminou (o valor ainda pode mudar).
      if (time + SLOT_MS > now) continue
      if (m.metric === 'heartRate') {
        samples.push({ key: `heartRate|${time}`, options: { dataType: 'heartRate', value: m.value, startDate: iso(time) } })
      }
      if (m.metric === 'spo2') {
        samples.push({
          key: `oxygenSaturation|${time}`,
          options: { dataType: 'oxygenSaturation', value: m.value, startDate: iso(time) },
        })
      }
    }

    // Pressão: máxima e mínima viram uma amostra só.
    const diastolic = byTimestamp('bpDiastolic')
    for (const [time, systolic] of byTimestamp('bpSystolic')) {
      if (!diastolic.has(time) || time + SLOT_MS > now) continue
      samples.push({
        key: `bloodPressure|${time}`,
        options: { dataType: 'bloodPressure', value: systolic, systolic, diastolic: diastolic.get(time), startDate: iso(time) },
      })
    }

    // Sono: sessão do início ao fim (fim = horário em que acordou; duração = dormindo + acordado).
    const awake = byTimestamp('sleepAwakeMinutes')
    const starts = byTimestamp('sleepStart')
    for (const [endTime, asleepMinutes] of byTimestamp('sleepMinutes')) {
      // Sono recém-terminado ainda pode mudar (a pessoa volta a dormir): espera assentar.
      if (endTime + SLEEP_SETTLE_MS > now) continue
      // Início gravado pelo relógio; sem ele (dados antigos), estimado pela duração.
      const startTime = starts.get(endTime) ?? endTime - (asleepMinutes + (awake.get(endTime) ?? 0)) * 60 * 1000
      samples.push({
        key: `sleep|${endTime}`,
        options: { dataType: 'sleep', value: asleepMinutes, startDate: iso(startTime), endDate: iso(endTime) },
      })
    }
  }

  // ---- Água: cada copo vira um registro de hidratação (em litros) ----
  if (event.device === WATER_DEVICE && exportWater) {
    for (const m of event.metrics) {
      const time = at(m)
      if (m.metric !== WATER_METRIC || time + WATER_SETTLE_MS > now) continue
      samples.push({
        key: `dietaryWater|${time}`,
        options: { dataType: 'dietaryWater', value: m.value / 1000, startDate: iso(time), endDate: iso(time + 60000) },
      })
    }
  }

  // ---- Treinos gravados pelo GPS do celular: distância e calorias ativas do início ao fim ----
  if (event.device === WORKOUT_DEVICE && exportWorkout && event.workout?.endedAt) {
    const startDate = iso(event.timestamp)
    const endDate = iso(event.workout.endedAt)
    const distance = event.metrics.find((m) => m.metric === 'workoutDistance')
    const calories = event.metrics.find((m) => m.metric === 'workoutCalories')
    if (distance?.value > 0) {
      samples.push({ key: `distance|${event.timestamp}`, options: { dataType: 'distance', value: distance.value, startDate, endDate } })
    }
    if (calories?.value > 0) {
      samples.push({ key: `calories|${event.timestamp}`, options: { dataType: 'calories', value: calories.value, startDate, endDate } })
    }
  }

  return samples
}

/**
 * Eventos para o envio de recuperação: o que está no banco local, no formato dos eventos do hub.
 * Manda ao Health Connect o que não foi enviado na hora (pesagem feita no PC, Health Connect ainda sem
 * permissão, valores que ainda não eram finais). As chaves de envio evitam duplicar.
 * @param {{ rows: Array<object>, workouts?: Array<object>, userId: string }} params
 * @returns {Array<object>} eventos "measurement"
 */
export function catchUpEvents({ rows, workouts = [], userId }) {
  const events = []
  // Balança: um evento por pesagem (peso e impedância no mesmo horário).
  const weighings = new Map()
  for (const row of rows) {
    if (row.device !== SCALE_DEVICE) continue
    const list = weighings.get(row.timestamp) ?? []
    list.push(row)
    weighings.set(row.timestamp, list)
  }
  for (const [timestamp, list] of weighings) {
    events.push({ userId, device: SCALE_DEVICE, timestamp, metrics: list.map(({ metric, value, unit }) => ({ metric, value, unit, timestamp })) })
  }
  // Relógio: um evento com todas as linhas (cada uma com o próprio horário).
  const watchRows = rows.filter((row) => row.device === WATCH_DEVICE)
  if (watchRows.length) {
    events.push({
      userId,
      device: WATCH_DEVICE,
      timestamp: Math.max(...watchRows.map((row) => row.timestamp)),
      metrics: watchRows.map(({ metric, value, unit, timestamp }) => ({ metric, value, unit, timestamp })),
    })
  }
  // Água: um evento com todos os copos.
  const waterRows = rows.filter((row) => row.device === WATER_DEVICE)
  if (waterRows.length) {
    events.push({
      userId,
      device: WATER_DEVICE,
      timestamp: Math.max(...waterRows.map((row) => row.timestamp)),
      metrics: waterRows.map(({ metric, value, unit, timestamp }) => ({ metric, value, unit, timestamp })),
    })
  }
  // Treinos: o resumo de cada um (distância e calorias).
  for (const workout of workouts) events.push(workoutToMeasurement(workout, userId))
  return events
}

/**
 * Converte o que foi lido do Health Connect em um evento "measurement" do hub
 * (origem "healthconnect"), ignorando o que o próprio app gravou.
 * @param {{ steps: Array<object>, heartRate: Array<object>, sleep: Array<object> }} read
 * @param {string} userId
 * @param {number} [now]
 */
export function readSamplesToMeasurement(read, userId, now = Date.now()) {
  const fromOtherApps = (sample) => sample.sourceId !== APP_PACKAGE_ID
  const metrics = []

  // Passos somados por dia (buckets do queryAggregated), na meia-noite local.
  for (const bucket of read.steps ?? []) {
    metrics.push({
      metric: 'steps',
      value: Math.round(bucket.value),
      unit: 'passos',
      timestamp: startOfLocalDay(Date.parse(bucket.startDate)),
    })
  }
  for (const sample of (read.heartRate ?? []).filter(fromOtherApps)) {
    metrics.push({ metric: 'heartRate', value: Math.round(sample.value), unit: 'bpm', timestamp: Date.parse(sample.startDate) })
  }
  for (const sample of (read.sleep ?? []).filter(fromOtherApps)) {
    metrics.push({ metric: 'sleepMinutes', value: Math.round(sample.value), unit: 'min', timestamp: Date.parse(sample.endDate) })
  }

  return { userId, device: HEALTH_CONNECT_DEVICE, timestamp: now, metrics }
}

// ---------------------------------------------------------------------------
// Confirmação da sincronização (tela Integrações): o que o app enviou, o que o Health Connect
// devolve quando lido de volta e quais outros apps (Samsung Health, Google Fit…) também gravam lá.

// Tudo o que o app grava é lido de volta para confirmar.
export const VERIFY_TYPES = [...HEALTH_TYPES.writeScale, ...HEALTH_TYPES.writeWatch, ...HEALTH_TYPES.writeWorkout, ...HEALTH_TYPES.writeWater]

// Nomes em português de cada tipo do Health Connect.
export const DATA_TYPE_LABELS = {
  weight: 'Peso',
  bodyFat: '% de gordura',
  basalCalories: 'Metabolismo basal',
  steps: 'Passos',
  heartRate: 'Frequência cardíaca',
  oxygenSaturation: 'SpO2',
  bloodPressure: 'Pressão arterial',
  sleep: 'Sono',
  distance: 'Distância (treinos)',
  calories: 'Calorias ativas (treinos)',
  dietaryWater: 'Água',
}

// Apps conhecidos pelo pacote Android (a origem que o Health Connect informa em cada dado).
const KNOWN_SOURCES = {
  [APP_PACKAGE_ID]: 'Hub de Saúde',
  'com.sec.android.app.shealth': 'Samsung Health',
  'com.google.android.apps.fitness': 'Google Fit',
  'com.google.android.apps.healthdata': 'Health Connect',
  'com.njj.mactivepro': 'MActivePro',
  'com.chipsea.btcontrol.en': 'OKOK',
}

/** Nome do app de origem (o pacote, se for desconhecido). */
export function sourceLabel(sourceId) {
  return KNOWN_SOURCES[sourceId] ?? sourceId ?? 'origem desconhecida'
}

// Métricas importadas para o banco local → tipo do Health Connect de onde vieram.
const IMPORTED_METRIC_TYPES = { steps: 'steps', heartRate: 'heartRate', sleepMinutes: 'sleep' }

/**
 * Monta a confirmação por tipo de dado.
 * @param {object} params
 * @param {Array<{ key: string, exportedAt: number }>} params.exports - envios registrados (chave "tipo|horário")
 * @param {Record<string, Array<{ sourceId?: string }> | { error: string }>} params.read - lido de volta, por tipo
 * @param {Array<{ metric: string }>} [params.importedRows] - linhas do banco com origem "healthconnect"
 * @param {number} params.since - início do período lido (ms); só os envios desse período entram na comparação
 * @param {number} [params.limit] - limite de amostras por leitura (contagens no limite viram "pelo menos")
 * @returns {Array<object>} uma linha por tipo, com status 'ok' | 'missing' | 'none' | 'error'
 */
export function buildSyncReport({ exports, read, importedRows = [], since, limit = Infinity }) {
  const imported = {}
  for (const row of importedRows) {
    const type = IMPORTED_METRIC_TYPES[row.metric]
    if (type) imported[type] = (imported[type] ?? 0) + 1
  }

  return VERIFY_TYPES.map((dataType) => {
    // Envios deste tipo no período (o horário do dado está na chave).
    const sentKeys = exports.filter((record) => record.key.split('|')[0] === dataType)
    const sentInPeriod = sentKeys.filter((record) => Number(record.key.split('|')[1]) >= since)
    const lastSentAt = sentKeys.reduce((latest, record) => Math.max(latest, record.exportedAt ?? 0), 0) || null

    const base = { dataType, label: DATA_TYPE_LABELS[dataType] ?? dataType, sent: sentInPeriod.length, lastSentAt, imported: imported[dataType] ?? 0 }
    const samples = read[dataType]
    if (!Array.isArray(samples)) return { ...base, status: 'error', error: samples?.error ?? 'não lido', confirmed: 0, others: [] }

    // Agrupa o que foi lido por app de origem.
    const bySource = new Map()
    for (const sample of samples) bySource.set(sample.sourceId, (bySource.get(sample.sourceId) ?? 0) + 1)
    const confirmed = bySource.get(APP_PACKAGE_ID) ?? 0
    const others = [...bySource]
      .filter(([sourceId]) => sourceId !== APP_PACKAGE_ID)
      .map(([sourceId, count]) => ({ sourceId, label: sourceLabel(sourceId), count }))
      .sort((a, b) => b.count - a.count)

    let status = 'none'
    if (confirmed > 0) status = 'ok'
    else if (base.sent > 0) status = 'missing'
    return { ...base, status, confirmed, truncated: samples.length >= limit, others }
  })
}

// ---------------------------------------------------------------------------
// Estado da conexão (cartão de status da tela Integrações).

/** Permissões pedidas ao usuário: leitura (inclui o que o app grava, para confirmar) e escrita. */
export const PERMISSION_SCOPES = {
  read: [...new Set([...HEALTH_TYPES.read, ...VERIFY_TYPES])],
  write: [...HEALTH_TYPES.writeScale, ...HEALTH_TYPES.writeWatch, ...HEALTH_TYPES.writeWorkout, ...HEALTH_TYPES.writeWater],
}

/**
 * Estado da conexão com o Health Connect, para o cartão de status.
 * @param {{ native: boolean, availability: object, permissions: object | null }} params
 * @returns {{ state: 'unsupported' | 'checking' | 'unavailable' | 'disconnected' | 'partial' | 'connected',
 *             granted?: number, total?: number, missing?: string[], reason?: string }}
 */
export function connectionState({ native, availability, permissions }) {
  if (!native) return { state: 'unsupported' }
  if (availability?.checking) return { state: 'checking' }
  if (!availability?.available) return { state: 'unavailable', reason: availability?.reason }
  const readOk = new Set(permissions?.readAuthorized ?? [])
  const writeOk = new Set(permissions?.writeAuthorized ?? [])
  const missingRead = PERMISSION_SCOPES.read.filter((type) => !readOk.has(type))
  const missingWrite = PERMISSION_SCOPES.write.filter((type) => !writeOk.has(type))
  const total = PERMISSION_SCOPES.read.length + PERMISSION_SCOPES.write.length
  const granted = total - missingRead.length - missingWrite.length
  // Tipos que faltam (em português, sem repetir quando faltam leitura e escrita do mesmo tipo).
  const missing = [...new Set([...missingWrite, ...missingRead])].map((type) => DATA_TYPE_LABELS[type] ?? type)
  if (granted === 0) return { state: 'disconnected', granted, total, missing }
  if (granted < total) return { state: 'partial', granted, total, missing }
  return { state: 'connected', granted, total, missing: [] }
}
