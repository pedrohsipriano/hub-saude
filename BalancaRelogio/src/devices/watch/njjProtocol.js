// Protocolo BLE do relógio (NJJ / MActivePro, firmware NJ-F2H), quadro "BC".
// Fontes: logs HCI de 16/10/2026 e SDK NJJ (github.com/SoarY/NJJBle) — README, Módulo 2.
//
// Quadro: BC <cmd> <controle> <tam> <dados…> <checksum>
//   controle: 01 leitura, 02 escrita, 03 resposta/evento do relógio, 04 resposta
//   tam: nº de bytes de dados; checksum: soma dos dados & 0xFF
// Este módulo é puro (sem BLE nem React): só monta e interpreta quadros.

export const FRAME_HEADER = 0xbc

// Tipos de controle (byte 2 do quadro).
export const CONTROL = { READ: 0x01, WRITE: 0x02, SYNC: 0x03, RESPONSE: 0x04 }

// Comandos usados pelo app (nomes do SDK entre parênteses quando existem).
export const CMD = {
  ALERT_MSG: 0x0b, // notificação (ALERT_MSG)
  PRODUCT_ID: 0x3c, // modelo, ASCII (PRODUCT_ID)
  FIRMWARE_VERSION: 0x3e, // firmware, ASCII (FIRMWARE_VER)
  USER_INFO: 0x41, // perfil do usuário (USER_INFO)
  DATE_TIME: 0x43, // acertar a hora (DATE_TIME)
  BATTERY: 0x48, // bateria (BAT)
  STEP_GOAL: 0x49, // meta de passos
  HOUR_STEPS: 0x4a, // passos por hora (HOUR_STEP)
  SETTINGS: 0x4e, // perfil + ajustes (200 bytes)
  SLEEP: 0x4f, // sono (SLEEP_DATA)
  SPORT_RECORD: 0x50, // treinos feitos no relógio (SPORT_RECORD); o app oficial pede logo depois do sono
  SPORT_REALTIME: 0x51, // passos ao vivo (SPORT_DATA)
  HR_DAY: 0x5f, // FC do dia, 48 × 30 min (HR_DAY)
  SPO2_DAY: 0x60, // SpO2 do dia, 48 × 30 min (BO_DAY)
  PHONE_TYPE: 0x67, // tipo de celular (PHONE_SYSTEM_TYPE)
  DAY_SUMMARY: 0x69, // resumo do dia (APP_REQUEST_SYNC)
  BP_DAY: 0x6b, // pressão do dia, 48 × 30 min
  LIVE_HR: 0x78, // FC ao vivo durante ECG
}

// O dia é dividido em 48 posições de 30 min a partir da meia-noite local.
export const SLOTS_PER_DAY = 48
export const SLOT_MINUTES = 30

// Valor enviado no comando PHONE_TYPE pelo app oficial no Android.
export const PHONE_ANDROID = 0x02

// Parâmetro do pedido de sono (o SDK chama de "weekDay", sem documentar o significado).
// Nos logs, o app oficial manda 00 ao conectar e 03 em cada sincronização.
export const SLEEP_QUERY_DAY = 0x03
// A sincronização tenta os dois, nessa ordem, e fica com o primeiro que trouxer dados.
export const SLEEP_QUERY_PARAMS = [0x00, SLEEP_QUERY_DAY]
// Diagnóstico: 0 a 6, para descobrir o significado com uma noite real gravada.
export const SLEEP_PROBE_PARAMS = [0, 1, 2, 3, 4, 5, 6]

// Fases de sono (SDK): 0 acordado, 1 leve, 2 profundo.
export const SLEEP_STAGE = { AWAKE: 0, LIGHT: 1, DEEP: 2 }

/** Soma dos bytes & 0xFF. */
const checksum = (payload) => payload.reduce((sum, byte) => (sum + byte) & 0xff, 0)

/** Inteiros little-endian. */
const u16le = (bytes, offset) => bytes[offset] | (bytes[offset + 1] << 8)
const u32le = (bytes, offset) =>
  (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
const u32Bytes = (value) => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]

// ---------- Montagem e leitura de quadros ----------

/**
 * Monta um quadro completo.
 * @param {number} cmd
 * @param {number} control
 * @param {number[] | Uint8Array} [payload]
 * @returns {Uint8Array}
 */
export function encodeFrame(cmd, control, payload = []) {
  const data = Uint8Array.from(payload)
  if (data.length > 0xff) throw new RangeError('Dados maiores que 255 bytes não cabem em um quadro.')
  return Uint8Array.from([FRAME_HEADER, cmd, control, data.length, ...data, checksum(data)])
}

/** Quadro de leitura: BC <cmd> 01 01 <parâmetro> <checksum>. */
export function buildRead(cmd, param = 0) {
  return encodeFrame(cmd, CONTROL.READ, [param])
}

/**
 * Valida e separa um quadro recebido.
 * @param {Uint8Array} bytes
 * @returns {{ cmd: number, control: number, payload: Uint8Array } | null} null se o quadro for inválido
 */
// ---------- Notificação (0x0B, ALERT_MSG) ----------

// Limites da notificação (SDK: texto de até 120 bytes); o título fica curto para caber na tela do relógio.
export const ALERT_MAX_TITLE_BYTES = 60
export const ALERT_MAX_TEXT_BYTES = 120

/** Texto em UTF-8 com no máximo `max` bytes, sem cortar um caractere ao meio. */
export function truncateUtf8(text, max) {
  const bytes = new TextEncoder().encode(String(text).replace(/\n/g, ' '))
  if (bytes.length <= max) return bytes
  let end = max
  // Volta enquanto o byte no ponto de corte for continuação de um caractere (10xxxxxx).
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end -= 1
  return bytes.slice(0, end)
}

/**
 * Notificação para o relógio: [tipo][tam. título][tam. texto][título]["3A 20"][texto], em UTF-8.
 * Igual ao SDK (sendMessage), ao que o MActivePro envia (logs HCI) e ao serviço nativo (NjjFrames.java).
 * @param {{ type: number, title: string, text: string }} message - type = ícone (notificationTypes.js)
 */
export function buildAlertMessage({ type, title, text }) {
  const titleBytes = truncateUtf8(title ?? '', ALERT_MAX_TITLE_BYTES)
  const textBytes = truncateUtf8(text && text.trim() ? text : ' ', ALERT_MAX_TEXT_BYTES)
  return encodeFrame(CMD.ALERT_MSG, CONTROL.WRITE, [type, titleBytes.length, textBytes.length, ...titleBytes, 0x3a, 0x20, ...textBytes])
}

/**
 * true quando os bytes começam um quadro que ainda não chegou inteiro (respostas grandes, como uma noite
 * com muitas fases, podem vir em mais de uma notificação Bluetooth).
 */
export function isIncompleteFrame(bytes) {
  return Boolean(bytes) && bytes.length >= 1 && bytes[0] === FRAME_HEADER && (bytes.length < 4 || bytes.length < 4 + bytes[3] + 1)
}

/** Junta dois pedaços de bytes. */
export function concatBytes(a, b) {
  const joined = new Uint8Array(a.length + b.length)
  joined.set(a, 0)
  joined.set(b, a.length)
  return joined
}

export function decodeFrame(bytes) {
  if (!bytes || bytes.length < 5 || bytes[0] !== FRAME_HEADER) return null
  const length = bytes[3]
  if (bytes.length < 4 + length + 1) return null
  const payload = bytes.slice(4, 4 + length)
  if (checksum(payload) !== bytes[4 + length]) return null
  return { cmd: bytes[1], control: bytes[2], payload }
}

// ---------- Hora local ----------

/**
 * Segundos desde 1970 contando a hora LOCAL como se fosse UTC — é assim que o relógio guarda a hora.
 * Ex.: 16/10/2026 18:12:49 (horário de Brasília) → 1792174369.
 */
export function localEpochSeconds(date) {
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()) /
      1000,
  )
}

/** Inverso de localEpochSeconds: hora do relógio → timestamp real (ms). */
export function fromLocalEpochSeconds(seconds) {
  const wallClock = new Date(seconds * 1000)
  return new Date(
    wallClock.getUTCFullYear(),
    wallClock.getUTCMonth(),
    wallClock.getUTCDate(),
    wallClock.getUTCHours(),
    wallClock.getUTCMinutes(),
    wallClock.getUTCSeconds(),
  ).getTime()
}

// ---------- Comandos enviados ao relógio ----------

/** Acerta a hora do relógio. */
export const buildSetTime = (date) => encodeFrame(CMD.DATE_TIME, CONTROL.WRITE, u32Bytes(localEpochSeconds(date)))

/** Informa o tipo de celular (o app oficial envia isso ao conectar). */
export const buildSetPhoneType = (type = PHONE_ANDROID) => encodeFrame(CMD.PHONE_TYPE, CONTROL.WRITE, [type])

/** Define a meta de passos. */
export const buildSetStepGoal = (steps) => encodeFrame(CMD.STEP_GOAL, CONTROL.WRITE, u32Bytes(steps))

/**
 * Grava o perfil do usuário (comando 0x41). Todos os campos são enviados juntos,
 * por isso quem chama deve partir do perfil atual do relógio (parseUserInfo).
 * @param {{ sex: number, heightCm: number, weightKg: number, age: number,
 *           birthDay: number, birthMonth: number, birthYear: number, skinTone: number }} info
 */
/**
 * Junta o perfil do app com o que está gravado no relógio (0x41): altura, sexo, nascimento, idade e peso
 * vêm do app; o resto (tom de pele) fica como está no relógio. Campos ausentes no app não mudam.
 * @param {object} current - parseUserInfo do relógio
 * @param {{ heightCm?: number, sex?: number, birthDate?: string, age?: number, weightKg?: number | null }} profile
 *   sex: 1 = masculino, 0 = feminino (mesmo código da balança)
 * @returns {{ info: object, changed: boolean }}
 */
export function mergeUserInfo(current, profile) {
  const info = { ...current }
  if (profile.heightCm >= 50 && profile.heightCm <= 250) info.heightCm = Math.round(profile.heightCm)
  if (profile.sex === 0 || profile.sex === 1) info.sex = profile.sex
  if (profile.weightKg >= 10 && profile.weightKg <= 250) info.weightKg = Math.round(profile.weightKg)
  if (profile.age >= 1 && profile.age <= 120) info.age = profile.age
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(profile.birthDate ?? '')
  if (match) {
    info.birthYear = Number(match[1])
    info.birthMonth = Number(match[2])
    info.birthDay = Number(match[3])
  }
  const changed = Object.keys(info).some((key) => info[key] !== current[key])
  return { info, changed }
}

export function buildSetUserInfo(info) {
  const { sex, heightCm, weightKg, age, birthDay, birthMonth, birthYear, skinTone } = info
  // Limites de segurança: valores fora disso indicam erro de quem chamou.
  if (!(heightCm >= 50 && heightCm <= 250)) throw new RangeError('Altura fora do intervalo (50–250 cm).')
  if (!(Number.isInteger(weightKg) && weightKg >= 10 && weightKg <= 250)) {
    throw new RangeError('O relógio aceita peso em kg inteiro, entre 10 e 250.')
  }
  if (!(age >= 1 && age <= 120)) throw new RangeError('Idade fora do intervalo (1–120).')
  return encodeFrame(CMD.USER_INFO, CONTROL.WRITE, [
    sex,
    heightCm,
    weightKg,
    age,
    birthDay,
    birthMonth,
    birthYear & 0xff,
    (birthYear >> 8) & 0xff,
    skinTone,
  ])
}

// ---------- Interpretação das respostas (recebem só os dados do quadro) ----------

/** Texto ASCII (firmware, modelo). */
export function parseAscii(payload) {
  return new TextDecoder().decode(payload).replace(/\0+$/, '')
}

/** Bateria: [%][tensão mV u16 LE]. */
export function parseBattery(payload) {
  return { percent: payload[0], millivolts: u16le(payload, 1) }
}

/**
 * Resumo do dia (0x69): passos, kcal, distância e as últimas medições.
 * 0 nas medições = sem medição. A unidade da distância ainda não foi confirmada.
 */
export function parseDaySummary(payload) {
  if (payload.length < 17) return null
  const orNull = (value) => (value > 0 ? value : null)
  return {
    steps: u32le(payload, 0),
    kcal: u32le(payload, 4) / 10,
    distance: u32le(payload, 8) / 10,
    heartRate: orNull(payload[12]),
    spo2: orNull(payload[13]),
    systolic: orNull(payload[14]),
    diastolic: orNull(payload[15]),
    ecgHeartRate: orNull(payload[16]),
  }
}

/** FC ou SpO2 do dia: 48 valores (1 byte cada); 0 = sem medição. */
export function parseDaySlots(payload) {
  return Array.from(payload.slice(0, SLOTS_PER_DAY))
}

/** Pressão do dia: 48 pares [máxima][mínima]. */
export function parseBpSlots(payload) {
  const slots = []
  for (let i = 0; i < SLOTS_PER_DAY && i * 2 + 1 < payload.length; i += 1) {
    slots.push({ systolic: payload[i * 2], diastolic: payload[i * 2 + 1] })
  }
  return slots
}

/** Passos por hora (SDK): 24 × [passos u16 LE][kcal÷10 u16 LE]. */
export function parseHourSteps(payload) {
  const hours = []
  for (let hour = 0; hour < 24 && hour * 4 + 3 < payload.length; hour += 1) {
    hours.push({ steps: u16le(payload, hour * 4), kcal: u16le(payload, hour * 4 + 2) / 10 })
  }
  return hours
}

/**
 * Sono, no formato do SDK da NJJ (NjjAnalysisData.parserSleepData), ainda não conferido com uma noite real.
 * - Resposta com 1 byte = sem dados.
 * - [0..11]: três totais u32 (acordado, leve, profundo, em minutos) que o SDK deixou comentados;
 *   ficam em `reported` só para conferência.
 * - [12..15] início e [16..19] fim (segundos, hora local, little-endian).
 * - Depois, pares [fase][minutos]: 0 acordado, 1 leve, 2 profundo. Como no SDK, as fases "acordado"
 *   antes de pegar no sono não contam, e a leitura para quando a linha do tempo chega ao fim.
 * @returns {null | { startMs: number, endMs: number, stages: Array<{ stage: number, minutes: number, startMs: number }>,
 *                    deepMinutes: number, lightMinutes: number, awakeMinutes: number, asleepMinutes: number,
 *                    reported: { awakeMinutes: number, lightMinutes: number, deepMinutes: number } }}
 */
export function parseSleep(payload) {
  if (payload.length < 22) return null
  const startMs = fromLocalEpochSeconds(u32le(payload, 12))
  const endMs = fromLocalEpochSeconds(u32le(payload, 16))
  const stages = []
  let cursor = startMs
  for (let i = 20; i + 1 < payload.length; i += 2) {
    const stage = payload[i]
    const minutes = payload[i + 1]
    if (stage === SLEEP_STAGE.AWAKE && !stages.length) continue
    stages.push({ stage, minutes, startMs: cursor })
    cursor += minutes * 60000
    if (cursor >= endMs) break
  }
  const total = (stage) => stages.filter((entry) => entry.stage === stage).reduce((sum, entry) => sum + entry.minutes, 0)
  const deepMinutes = total(SLEEP_STAGE.DEEP)
  const lightMinutes = total(SLEEP_STAGE.LIGHT)
  return {
    startMs,
    endMs,
    stages,
    deepMinutes,
    lightMinutes,
    awakeMinutes: total(SLEEP_STAGE.AWAKE),
    asleepMinutes: deepMinutes + lightMinutes,
    reported: { awakeMinutes: u32le(payload, 0), lightMinutes: u32le(payload, 4), deepMinutes: u32le(payload, 8) },
  }
}

/** Passos ao vivo (evento 0x51): o 1º campo são os passos; os outros 3 ainda não foram identificados. */
export function parseSportRealtime(payload) {
  return { steps: u32le(payload, 0), unknown: [u32le(payload, 4), u32le(payload, 8), u32le(payload, 12)] }
}

/** FC ao vivo durante o ECG (evento 0x78): [estado][bpm]; estado 02 = fim. */
export function parseLiveHeartRate(payload) {
  return { heartRate: payload[1], finished: payload[0] === 0x02 }
}

/**
 * Perfil do usuário dentro da resposta de ajustes (0x4E):
 * [hora u32][sexo][altura][peso][idade][dia][mês][ano u16 LE][tom de pele]…
 */
export function parseUserInfo(settingsPayload) {
  if (settingsPayload.length < 13) return null
  return {
    sex: settingsPayload[4],
    heightCm: settingsPayload[5],
    weightKg: settingsPayload[6],
    age: settingsPayload[7],
    birthDay: settingsPayload[8],
    birthMonth: settingsPayload[9],
    birthYear: u16le(settingsPayload, 10),
    skinTone: settingsPayload[12],
  }
}
