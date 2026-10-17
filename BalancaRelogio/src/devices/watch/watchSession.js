// Sessão do relógio: conversa com o relógio sobre uma conexão GATT já aberta.
//
// A conexão (adapter BLE) oferece: write(bytes), subscribe(listener) → cancelar.
// A sessão:
//   - envia um pedido por vez (fila) e espera a resposta com o mesmo comando;
//   - repassa os eventos espontâneos (bateria, passos e FC ao vivo) para onEvent;
//   - oferece as operações de alto nível: sincronizar tudo, acertar a hora, enviar o peso.
import { bytesToHex } from '../../utils/hex.js'
import {
  CMD,
  FRAME_HEADER,
  buildAlertMessage,
  SLEEP_QUERY_PARAMS,
  buildRead,
  concatBytes,
  buildSetPhoneType,
  buildSetStepGoal,
  buildSetTime,
  buildSetUserInfo,
  decodeFrame,
  isIncompleteFrame,
  mergeUserInfo,
  parseAscii,
  parseBattery,
  parseBpSlots,
  parseDaySlots,
  parseDaySummary,
  parseHourSteps,
  parseSleep,
  parseUserInfo,
} from './njjProtocol.js'

// Tempo máximo de espera por uma resposta.
const DEFAULT_TIMEOUT_MS = 3000

/**
 * @param {object} options
 * @param {{ write: (bytes: Uint8Array) => Promise<void>, subscribe: (listener: Function) => () => void }} options.connection
 * @param {(frame: { cmd: number, control: number, payload: Uint8Array }) => void} [options.onEvent]
 * @param {number} [options.timeoutMs]
 */
export function createWatchSession({ connection, onEvent, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  // Pedidos aguardando resposta, por comando.
  const pending = new Map()
  // Fila: garante uma operação por vez no canal.
  let queue = Promise.resolve()
  let unsubscribe = null
  // Começo de um quadro que ainda não chegou inteiro (respostas grandes vêm em várias notificações).
  let partial = null

  /** Coloca uma operação no fim da fila (mesmo que a anterior tenha falhado). */
  function enqueue(operation) {
    const result = queue.then(operation, operation)
    queue = result.catch(() => {})
    return result
  }

  /** Trata cada notificação: resposta de um pedido ou evento espontâneo. */
  function handleNotification(chunk) {
    let bytes = chunk
    // Continuação de um quadro partido (a não ser que a notificação nova já seja um quadro completo).
    if (partial && !(chunk[0] === FRAME_HEADER && decodeFrame(chunk))) bytes = concatBytes(partial, chunk)
    partial = null
    if (isIncompleteFrame(bytes)) {
      partial = bytes
      return
    }
    const frame = decodeFrame(bytes)
    if (!frame) return
    const waiting = pending.get(frame.cmd)
    if (waiting) {
      pending.delete(frame.cmd)
      clearTimeout(waiting.timer)
      waiting.resolve(frame)
      return
    }
    onEvent?.(frame)
  }

  /** Envia um quadro de leitura e espera a resposta do mesmo comando. */
  function read(cmd, param = 0) {
    return enqueue(
      () =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            pending.delete(cmd)
            reject(new Error(`o relógio não respondeu ao comando 0x${cmd.toString(16).toUpperCase()}`))
          }, timeoutMs)
          pending.set(cmd, { resolve, reject, timer })
          Promise.resolve(connection.write(buildRead(cmd, param))).catch((error) => {
            clearTimeout(timer)
            pending.delete(cmd)
            reject(error)
          })
        }),
    )
  }

  /** Envia um quadro de escrita (o relógio não responde a estes). */
  const send = (bytes) => enqueue(() => connection.write(bytes))

  /** Lê o perfil gravado no relógio (dentro da resposta de ajustes). */
  async function readUserInfo() {
    const frame = await read(CMD.SETTINGS)
    const info = parseUserInfo(frame.payload)
    if (!info) throw new Error('não foi possível ler o perfil do relógio')
    return info
  }

  return {
    /** Começa a escutar as notificações. */
    start() {
      unsubscribe = connection.subscribe(handleNotification)
    },

    /** Para de escutar e cancela os pedidos pendentes. */
    stop() {
      unsubscribe?.()
      unsubscribe = null
      pending.forEach(({ reject, timer }) => {
        clearTimeout(timer)
        reject(new Error('conexão com o relógio encerrada'))
      })
      pending.clear()
    },

    /** Mensagens iniciais que o app oficial envia ao conectar. */
    setPhoneType: () => send(buildSetPhoneType()),

    /** Acerta a hora do relógio (hora local do computador). */
    setTime: (date = new Date()) => send(buildSetTime(date)),

    /** Mostra uma notificação no relógio (0x0B): { type (ícone), title, text }. */
    sendAlert: (message) => send(buildAlertMessage(message)),

    /** Define a meta diária de passos no relógio (comando 0x49, confirmado no log). */
    setStepGoal: (steps) => send(buildSetStepGoal(steps)),

    readUserInfo,

    /**
     * Lê tudo o que o app usa. Cada item falha sozinho: o que não vier fica null
     * e o motivo vai para `errors`.
     */
    async syncAll() {
      const errors = []
      const safely = async (label, cmd, parse, param) => {
        try {
          return parse((await read(cmd, param)).payload)
        } catch (error) {
          errors.push(`${label}: ${error.message}`)
          return null
        }
      }
      // Pedidos em sequência (a fila já garante isso).
      const firmware = await safely('firmware', CMD.FIRMWARE_VERSION, parseAscii)
      const battery = await safely('bateria', CMD.BATTERY, parseBattery)
      const summary = await safely('resumo do dia', CMD.DAY_SUMMARY, parseDaySummary)
      const heartRate = await safely('FC do dia', CMD.HR_DAY, parseDaySlots)
      const spo2 = await safely('SpO2 do dia', CMD.SPO2_DAY, parseDaySlots)
      const bloodPressure = await safely('pressão do dia', CMD.BP_DAY, parseBpSlots)
      const hourSteps = await safely('passos por hora', CMD.HOUR_STEPS, parseHourSteps)
      // Sono: os dois parâmetros do app oficial (00 e 03), ficando com o primeiro que trouxer dados.
      let sleep = null
      for (const param of SLEEP_QUERY_PARAMS) {
        sleep = await safely('sono', CMD.SLEEP, parseSleep, param)
        if (sleep) break
      }
      return { syncedAt: Date.now(), firmware, battery, summary, heartRate, spo2, bloodPressure, hourSteps, sleep, errors }
    },

    /**
     * Diagnóstico: envia o mesmo pedido com vários parâmetros e devolve as respostas cruas (em hex),
     * para descobrir o significado do parâmetro com dados reais.
     * @returns {Promise<Array<{ param: number, payload?: Uint8Array, hex?: string, error?: string }>>}
     */
    async probe(cmd, params) {
      const results = []
      for (const param of params) {
        try {
          const frame = await read(cmd, param)
          const raw = [FRAME_HEADER, frame.cmd, frame.control, frame.payload.length, ...frame.payload]
          results.push({ param, payload: frame.payload, hex: bytesToHex(raw) })
        } catch (error) {
          results.push({ param, error: error.message })
        }
      }
      return results
    },

    /**
     * Envia o peso ao relógio, preservando os outros campos do perfil gravado nele.
     * O relógio só aceita kg inteiro.
     * @returns {Promise<{ changed: boolean, weightKg: number, previousWeightKg: number }>}
     */
    /**
     * Envia ao relógio o perfil do app (altura, sexo, nascimento, idade e peso), lendo antes o que ele tem
     * e só regravando se algo mudou.
     * @returns {Promise<{ changed: boolean }>}
     */
    async syncUserProfile(profile) {
      const current = await readUserInfo()
      const { info, changed } = mergeUserInfo(current, profile)
      if (changed) await send(buildSetUserInfo(info))
      return { changed }
    },

    async syncUserWeight(weightKg) {
      const current = await readUserInfo()
      const rounded = Math.round(weightKg)
      if (current.weightKg === rounded) return { changed: false, weightKg: rounded, previousWeightKg: current.weightKg }
      await send(buildSetUserInfo({ ...current, weightKg: rounded }))
      return { changed: true, weightKg: rounded, previousWeightKg: current.weightKg }
    },
  }
}
