// Hook do relógio: conecta (real ou simulado), sincroniza, publica os dados no hub
// e envia ao relógio o peso de cada pesagem nova da balança (integração pelo hub).
// Fica no App para a conexão continuar ativa enquanto o usuário navega.
// No app Android a conexão é do serviço nativo (WatchService): continua com o app fechado, reconecta
// sozinha (queda, Bluetooth desligado e ligado, celular reiniciado) e o app só "pega carona" quando abre.
import { useCallback, useEffect, useRef, useState } from 'react'
import { createSimulatedWatchConnector } from '../ble/simulatedWatchConnector.js'
import { createWatchServiceConnector } from '../ble/watchServiceConnector.js'
import { createWebBluetoothWatchConnector, describeWatchError } from '../ble/webBluetoothWatchConnector.js'
import { isNativeApp } from '../platform.js'
import { SCALE_DEVICE } from '../devices/scale/weighings.js'
import { CMD, SLEEP_PROBE_PARAMS, parseBattery, parseLiveHeartRate, parseSleep, parseSportRealtime } from '../devices/watch/njjProtocol.js'
import { watchSyncToMeasurement } from '../devices/watch/watchMeasurements.js'
import { createWatchSession } from '../devices/watch/watchSession.js'
import { groupWeighings } from '../devices/scale/weighings.js'
import { DEFAULT_USER_ID, hub } from '../hub/hub.js'
import { listMeasurements } from '../storage/db.js'

// Modos de conexão aceitos por connect().
export const WATCH_MODE = { BLUETOOTH: 'bluetooth', SIMULATOR: 'simulator' }

// Com o app aberto e o relógio conectado, lê os dados do relógio de tempos em tempos.
const AUTO_SYNC_MS = 15 * 60 * 1000

/**
 * Envia ao relógio o perfil do dono (altura, sexo, nascimento, idade e o último peso da balança)
 * e a meta de passos. Não mexe no estado da tela: devolve o resultado.
 */
async function pushOwnerProfile(session, owner) {
  const weighings = groupWeighings(await listMeasurements(owner.userId))
  const { changed } = await session.syncUserProfile({
    heightCm: owner.heightCm,
    sex: owner.sex,
    birthDate: owner.birthDate,
    age: owner.age,
    weightKg: weighings.at(-1)?.weightKg ?? null,
  })
  const steps = Number(owner.goals?.dailySteps)
  if (steps > 0) await session.setStepGoal(Math.round(steps))
  return { at: Date.now(), ok: true, changed, steps: steps > 0 ? Math.round(steps) : null }
}

// Estado do serviço nativo → estado mostrado na tela.
const SERVICE_STATUS = {
  connecting: 'reconnecting',
  reconnecting: 'reconnecting',
  'bluetooth-off': 'bluetooth-off',
  'no-permission': 'no-permission',
}

/**
 * @returns {{
 *   status: 'idle' | 'connecting' | 'connected' | 'syncing' | 'error',
 *   error: string | null, deviceName: string | null, data: object | null,
 *   battery: object | null, liveSteps: number | null, liveHeartRate: object | null,
 *   autoWeight: boolean, weightMessage: string | null,
 *   connect: (mode: string) => Promise<void>, disconnect: () => Promise<void>, sync: () => Promise<void>,
 *   sendWeight: (weightKg: number) => Promise<void>, setAutoWeight: (enabled: boolean) => void,
 * }}
 */
// Diagnóstico do sono guardado no aparelho (localStorage).
const PROBE_KEY = 'hubSaude.watch.sleepProbe'

/** Lê o último diagnóstico salvo. */
function loadProbe() {
  try {
    return JSON.parse(localStorage.getItem(PROBE_KEY) ?? 'null')
  } catch {
    return null
  }
}

/** Salva o diagnóstico (ignora falhas de armazenamento). */
function storeProbe(probe) {
  try {
    localStorage.setItem(PROBE_KEY, JSON.stringify(probe))
  } catch {
    // Sem armazenamento local, o diagnóstico vale só nesta sessão.
  }
}

/**
 * @param {{ ownerId?: string, owner?: object | null }} [params] - dono do relógio (perfil e metas vão para o relógio)
 */
export function useWatch({ ownerId, owner = null } = {}) {
  const [status, setStatus] = useState('idle')
  // Dono do relógio: os dados sincronizados são gravados para ele, e só as pesagens dele vão para o relógio.
  const ownerRef = useRef(ownerId ?? DEFAULT_USER_ID)
  useEffect(() => {
    ownerRef.current = ownerId ?? DEFAULT_USER_ID
  }, [ownerId])
  const [error, setError] = useState(null)
  const [deviceName, setDeviceName] = useState(null)
  // Resultado da última sincronização completa.
  const [data, setData] = useState(null)
  // Valores ao vivo, atualizados pelos eventos espontâneos do relógio.
  const [battery, setBattery] = useState(null)
  const [liveSteps, setLiveSteps] = useState(null)
  const [liveHeartRate, setLiveHeartRate] = useState(null)
  // Envio automático do peso da balança.
  const [autoWeight, setAutoWeightState] = useState(true)
  const [weightMessage, setWeightMessage] = useState(null)
  // Último diagnóstico do sono/treinos (guardado neste aparelho para poder copiar depois).
  const [probe, setProbe] = useState(loadProbe)
  const [probing, setProbing] = useState(false)
  // Relógio lembrado pelo serviço nativo ({ address, name }; só no app Android).
  const [remembered, setRemembered] = useState(null)
  // Último envio automático do perfil e da meta ao relógio ({ at, ok, changed, steps } ou { ok: false, message }).
  const [profileSync, setProfileSync] = useState(null)

  // Conexão e sessão abertas no momento (refs: usadas só em callbacks).
  const connectionRef = useRef(null)
  const sessionRef = useRef(null)
  const autoWeightRef = useRef(true)

  /** Eventos espontâneos do relógio. */
  const handleEvent = useCallback((frame) => {
    if (frame.cmd === CMD.BATTERY) setBattery(parseBattery(frame.payload))
    if (frame.cmd === CMD.SPORT_REALTIME) setLiveSteps(parseSportRealtime(frame.payload).steps)
    if (frame.cmd === CMD.LIVE_HR) setLiveHeartRate(parseLiveHeartRate(frame.payload))
  }, [])

  /**
   * Fecha a sessão e solta a conexão atual. No serviço nativo, só solta a tela (o relógio continua
   * conectado) — a não ser com stop = true (o usuário pediu para desconectar).
   */
  const closeCurrent = useCallback(async ({ stop = false } = {}) => {
    const connection = connectionRef.current
    sessionRef.current?.stop()
    sessionRef.current = null
    connectionRef.current = null
    if (!connection) return
    const release = !stop && connection.detach ? connection.detach() : connection.disconnect()
    await release.catch(() => {})
  }, [])

  /** Lê tudo do relógio e publica no hub (que grava no banco). */
  const sync = useCallback(async () => {
    const session = sessionRef.current
    if (!session) return
    setStatus('syncing')
    const result = await session.syncAll()
    setData(result)
    if (result.battery) setBattery(result.battery)
    hub.emit('measurement', watchSyncToMeasurement(result, ownerRef.current))
    setError(result.errors.length ? `Alguns dados não vieram: ${result.errors.join('; ')}` : null)
    if (sessionRef.current === session) setStatus('connected')
  }, [])

  /**
   * Conecta ao relógio real (serviço nativo no Android, Web Bluetooth no PC) ou ao simulador e já sincroniza.
   * @param {string} mode - WATCH_MODE
   * @param {{ chooseNew?: boolean, address?: string, name?: string }} [options] - chooseNew: buscar outro relógio;
   *   address/name: usar este relógio (escolhido entre os pareados no Bluetooth do celular)
   */
  const connect = useCallback(
    async (mode, { chooseNew = false, address = null, name = null } = {}) => {
      await closeCurrent()
      setStatus('connecting')
      setError(null)
      setWeightMessage(null)
      try {
        // Simulador, Bluetooth nativo (app Android) ou Web Bluetooth (navegador).
        const connector =
          mode === WATCH_MODE.SIMULATOR
            ? createSimulatedWatchConnector()
            : isNativeApp()
              ? createWatchServiceConnector()
              : createWebBluetoothWatchConnector()
        const connection = await connector.connect({ chooseNew, address, name })
        const session = createWatchSession({ connection, onEvent: handleEvent })
        session.start()
        connectionRef.current = connection
        sessionRef.current = session
        setDeviceName(connection.name)
        if (connection.address) setRemembered({ address: connection.address, name: connection.name })

        // Se a conexão acabar de vez, volta ao estado desconectado.
        connection.onDisconnect(() => {
          if (connectionRef.current !== connection) return
          sessionRef.current?.stop()
          sessionRef.current = null
          connectionRef.current = null
          setStatus('idle')
        })

        // Serviço nativo: quedas e reconexões não encerram a sessão; ao reconectar, sincroniza de novo
        // (o serviço já mandou o tipo de celular e a hora).
        connection.onState?.((state) => {
          if (connectionRef.current !== connection) return
          if (state === 'connected') {
            setStatus('connected')
            void sync()
          } else if (SERVICE_STATUS[state]) {
            setStatus(SERVICE_STATUS[state])
          }
        })
        if (connection.state && connection.state !== 'connected') {
          // O relógio ainda não respondeu (longe, desligado ou com o MActivePro): o serviço segue tentando.
          setStatus(SERVICE_STATUS[connection.state] ?? 'reconnecting')
          return
        }

        // Mesmo início do app oficial: tipo de celular e hora.
        await session.setPhoneType()
        await session.setTime(new Date())
        setStatus('connected')
        await sync()
      } catch (err) {
        await closeCurrent()
        setStatus('error')
        setError(describeWatchError(err))
      }
    },
    [closeCurrent, handleEvent, sync],
  )

  /** Desconecta do relógio (no Android, o serviço para e não reconecta mais até conectar de novo). */
  const disconnect = useCallback(async () => {
    await closeCurrent({ stop: true })
    setStatus('idle')
  }, [closeCurrent])

  /** Esquece o relógio lembrado (a próxima conexão abre a lista para escolher). */
  const forgetWatch = useCallback(async () => {
    await closeCurrent({ stop: true })
    if (isNativeApp()) await createWatchServiceConnector().forget().catch(() => {})
    setRemembered(null)
    setStatus('idle')
  }, [closeCurrent])

  /** Mostra uma notificação no relógio (teste das notificações e dos ícones). */
  const sendAlert = useCallback(async (message) => {
    const session = sessionRef.current
    if (!session) throw new Error('Conecte o relógio primeiro.')
    await session.sendAlert(message)
  }, [])

  // Envio automático: perfil e meta do dono vão para o relógio quando são salvos e a cada (re)conexão.
  // A "assinatura" muda quando altura, sexo, nascimento ou meta de passos mudam.
  const signature = owner ? JSON.stringify([owner.userId, owner.heightCm, owner.sex, owner.birthDate, owner.goals?.dailySteps]) : null
  const ownerProfileRef = useRef(owner)
  const pushedRef = useRef(null)
  useEffect(() => {
    ownerProfileRef.current = owner
  }, [owner])
  useEffect(() => {
    if (status !== 'connected') {
      // Desconectou: na próxima conexão manda tudo de novo (o relógio pode ter sido mexido pelo MActivePro).
      if (status !== 'syncing') pushedRef.current = null
      return
    }
    const session = sessionRef.current
    const profile = ownerProfileRef.current
    if (!session || !profile || pushedRef.current === signature) return
    pushedRef.current = signature
    pushOwnerProfile(session, profile)
      .then(setProfileSync)
      .catch((error) => setProfileSync({ at: Date.now(), ok: false, message: error.message }))
  }, [status, signature])

  // Esperando o serviço (reconectando, Bluetooth desligado…): confere o estado real a cada 5 s,
  // para a tela não ficar presa em "Procurando o relógio…" se um aviso de "conectado" se perder.
  useEffect(() => {
    if (!['reconnecting', 'bluetooth-off', 'no-permission'].includes(status)) return undefined
    const connection = connectionRef.current
    if (!connection?.refreshState) return undefined
    const id = setInterval(() => {
      connection
        .refreshState()
        .then((state) => {
          if (connectionRef.current !== connection) return
          if (state === 'connected') {
            setStatus('connected')
            void sync()
          } else if (SERVICE_STATUS[state]) {
            setStatus(SERVICE_STATUS[state])
          }
        })
        .catch(() => {})
    }, 5000)
    return () => clearInterval(id)
  }, [status, sync])

  // Leitura automática a cada 15 min enquanto o app está aberto e o relógio conectado.
  useEffect(() => {
    if (status !== 'connected') return undefined
    const id = setInterval(() => void sync(), AUTO_SYNC_MS)
    return () => clearInterval(id)
  }, [status, sync])

  // App Android: ao abrir, volta a usar a conexão do serviço (que pode estar ligada com o app fechado).
  useEffect(() => {
    if (!isNativeApp()) return undefined
    let active = true
    createWatchServiceConnector()
      .status()
      .then((service) => {
        if (!active) return
        if (service.address) setRemembered({ address: service.address, name: service.name })
        if (service.keepConnected && service.address) void connect(WATCH_MODE.BLUETOOTH)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [connect])

  /** Envia um peso ao perfil do relógio (kg inteiro). */
  const sendWeight = useCallback(async (weightKg) => {
    const session = sessionRef.current
    if (!session) {
      setWeightMessage('Conecte o relógio para enviar o peso.')
      return
    }
    try {
      const result = await session.syncUserWeight(weightKg)
      setWeightMessage(
        result.changed
          ? `Peso enviado ao relógio: ${result.weightKg} kg (antes: ${result.previousWeightKg} kg).`
          : `O relógio já estava com ${result.weightKg} kg.`,
      )
    } catch (err) {
      setWeightMessage(`Não foi possível enviar o peso: ${err.message}`)
    }
  }, [])

  /** Liga/desliga o envio automático do peso. */
  const setAutoWeight = useCallback((enabled) => {
    autoWeightRef.current = enabled
    setAutoWeightState(enabled)
  }, [])

  // Integração pelo hub: cada pesagem nova da balança vai para o perfil do relógio.
  useEffect(
    () =>
      hub.on('measurement', (event) => {
        if (event.device !== SCALE_DEVICE || !autoWeightRef.current || !sessionRef.current) return
        // Só a pesagem do dono do relógio vai para o perfil dele.
        if (event.userId !== ownerRef.current) return
        const weight = event.metrics.find((metric) => metric.metric === 'weight')?.value
        if (weight) sendWeight(weight)
      }),
    [sendWeight],
  )

  // Ao desmontar o App, solta a conexão (no Android o serviço continua com o relógio conectado).
  useEffect(() => () => void closeCurrent(), [closeCurrent])

  /**
   * Diagnóstico do sono e dos treinos do relógio: pede o sono com cada parâmetro (0 a 6) e os treinos (0x50),
   * guarda as respostas cruas e, se alguma trouxer uma noite, grava o sono como numa sincronização.
   */
  const diagnoseSleep = useCallback(async () => {
    const session = sessionRef.current
    if (!session) return
    setProbing(true)
    try {
      const at = Date.now()
      const sleepResults = await session.probe(CMD.SLEEP, SLEEP_PROBE_PARAMS)
      const sportResults = await session.probe(CMD.SPORT_RECORD, [0])
      const items = [
        ...sleepResults.map((result) => ({ kind: 'sono', param: result.param, hex: result.hex ?? null, error: result.error ?? null, sleep: result.payload ? parseSleep(result.payload) : null })),
        ...sportResults.map((result) => ({ kind: 'treinos', param: result.param, hex: result.hex ?? null, error: result.error ?? null, sleep: null })),
      ]
      const next = { at, items }
      setProbe(next)
      storeProbe(next)
      const found = items.find((item) => item.sleep)
      if (found) hub.emit('measurement', watchSyncToMeasurement({ syncedAt: at, sleep: found.sleep }, ownerRef.current))
    } finally {
      setProbing(false)
    }
  }, [])

  return {
    status,
    error,
    deviceName,
    data,
    battery,
    liveSteps,
    liveHeartRate,
    autoWeight,
    weightMessage,
    connect,
    disconnect,
    sync,
    sendWeight,
    setAutoWeight,
    probe,
    probing,
    diagnoseSleep,
    remembered,
    forgetWatch,
    sendAlert,
    profileSync,
  }
}
