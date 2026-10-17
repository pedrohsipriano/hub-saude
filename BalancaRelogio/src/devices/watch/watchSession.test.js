// Testes da sessão do relógio usando o relógio simulado (quadros reais dos logs).
import { describe, expect, it, vi } from 'vitest'
import { createSimulatedWatchConnector } from '../../ble/simulatedWatchConnector.js'
import { bytesToHex } from '../../utils/hex.js'
import { OFFICIAL_APP_WRITES } from './fixtures.js'
import { CMD, encodeFrame } from './njjProtocol.js'
import { createWatchSession } from './watchSession.js'

/** Abre uma sessão com o relógio simulado. */
async function openSession(options = {}) {
  const connection = await createSimulatedWatchConnector({ delayMs: 0, emitEvents: false }).connect()
  const session = createWatchSession({ connection, ...options })
  session.start()
  return { connection, session }
}

describe('createWatchSession', () => {
  it('syncAll lê todos os dados do relógio', async () => {
    const { session } = await openSession()
    const data = await session.syncAll()

    expect(data.errors).toEqual([])
    expect(data.firmware).toBe('NJ-F2H-2.1.5')
    expect(data.battery.percent).toBe(88)
    expect(data.summary.heartRate).toBe(71)
    expect(data.heartRate[37]).toBe(68)
    expect(data.spo2[37]).toBe(97)
    expect(data.bloodPressure[37]).toEqual({ systolic: 116, diastolic: 76 })
    expect(data.hourSteps).toHaveLength(24)
    expect(data.sleep).toBeNull()
  })

  it('envia o peso preservando o resto do perfil — mesmo quadro do app oficial', async () => {
    const { connection, session } = await openSession()

    const result = await session.syncUserWeight(70.4)

    expect(result).toEqual({ changed: true, weightKg: 70, previousWeightKg: 67 })
    const lastWrite = bytesToHex(connection.writes.at(-1)).replaceAll(' ', '')
    expect(lastWrite).toBe(OFFICIAL_APP_WRITES.setUserInfoWeight70)
  })

  it('não reenvia quando o relógio já tem o mesmo peso', async () => {
    const { connection, session } = await openSession()
    await session.syncUserWeight(70)
    const writesBefore = connection.writes.length

    const result = await session.syncUserWeight(69.6)

    expect(result.changed).toBe(false)
    // Só a leitura do perfil foi enviada.
    expect(connection.writes.length).toBe(writesBefore + 1)
  })

  it('repassa eventos espontâneos e acusa falta de resposta', async () => {
    const onEvent = vi.fn()
    const listeners = new Set()
    const connection = {
      write: async () => {},
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }
    const session = createWatchSession({ connection, onEvent, timeoutMs: 20 })
    session.start()

    // Evento de bateria sem pedido pendente → onEvent.
    listeners.forEach((listener) => listener(encodeFrame(CMD.BATTERY, 0x03, [80, 0xa0, 0x0f, 0, 0])))
    expect(onEvent).toHaveBeenCalledTimes(1)

    // Pedido sem resposta → erro no syncAll, sem travar.
    const data = await session.syncAll()
    expect(data.firmware).toBeNull()
    expect(data.errors[0]).toMatch(/não respondeu/)
  })
})

describe('createWatchSession — sono', () => {
  /** Conexão falsa: responde a cada leitura com `reply(cmd, param)`, partindo a resposta em pedaços de `chunk` bytes. */
  function fakeConnection(reply, chunk = 20) {
    let listener = null
    return {
      subscribe(fn) {
        listener = fn
        return () => {}
      },
      async write(bytes) {
        const response = reply(bytes[1], bytes[4])
        if (!response) return
        for (let i = 0; i < response.length; i += chunk) listener(response.slice(i, i + chunk))
      },
    }
  }
  const noData = (cmd) => encodeFrame(cmd, 0x03, [0x00])

  it('junta uma resposta grande que chega em vários pedaços e tenta 00 antes de 03', async () => {
    const asked = []
    // Noite com 60 fases (140 bytes de dados): chega em 8 notificações de 20 bytes.
    const night = [...new Array(20).fill(0), ...Array.from({ length: 60 }, (_, i) => [1 + (i % 2), 5]).flat()]
    const connection = fakeConnection((cmd, param) => {
      if (cmd === CMD.SLEEP) {
        asked.push(param)
        return param === 0x03 ? encodeFrame(cmd, 0x03, night) : noData(cmd)
      }
      return noData(cmd)
    })
    const session = createWatchSession({ connection, timeoutMs: 200 })
    session.start()
    const data = await session.syncAll()
    expect(asked).toEqual([0x00, 0x03])
    expect(data.sleep.stages.length).toBeGreaterThan(0)
  })

  it('diagnóstico: devolve a resposta crua de cada parâmetro', async () => {
    const connection = fakeConnection((cmd, param) => (param === 2 ? encodeFrame(cmd, 0x03, [0x09, 0x08]) : noData(cmd)))
    const session = createWatchSession({ connection, timeoutMs: 200 })
    session.start()
    const results = await session.probe(CMD.SLEEP, [0, 1, 2])
    expect(results.map((result) => result.hex)).toEqual(['BC 4F 03 01 00', 'BC 4F 03 01 00', 'BC 4F 03 02 09 08'])
  })
})
