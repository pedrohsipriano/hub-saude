// Hook do Health Connect (app Android): permissões, envio automático dos dados
// da balança e do relógio e importação dos dados de outros apps (Samsung Health, Google…).
//
// O envio segue a regra do hub: este hook escuta os eventos "measurement" e grava no
// Health Connect, sem que os módulos da balança ou do relógio saibam disso.
// Também guarda o último envio/importação e faz a confirmação: lê de volta o que foi gravado
// e mostra quais outros apps (Samsung Health, Google Fit…) também gravam no Health Connect.
import { useCallback, useEffect, useRef, useState } from 'react'
import { isAppActive, onAppStateChange, whenAppActive } from '../appState.js'
import { DEFAULT_USER_ID, hub } from '../hub/hub.js'
import {
  checkAvailability,
  checkPermissions,
  openSettings,
  readForVerification,
  readRecent,
  requestPermissions,
  saveSample,
  VERIFY_LIMIT,
} from '../integrations/healthConnect/healthConnectClient.js'
import {
  HEALTH_CONNECT_DEVICE,
  VERIFY_TYPES,
  buildSyncReport,
  catchUpEvents,
  measurementToSamples,
  readSamplesToMeasurement,
} from '../integrations/healthConnect/healthConnectMapping.js'
import { isNativeApp } from '../platform.js'
import { filterNotExported, listExports, listMeasurements, listWorkouts, markExported, pruneExports } from '../storage/db.js'

// Preferências do usuário (conveniência local; sem elas, valem os padrões).
const SETTINGS_KEY = 'hubSaude.healthConnect'
const DEFAULT_SETTINGS = { exportScale: true, exportWatch: true, exportWorkout: true, exportWater: true, importEnabled: true }
// Com o app aberto, o envio de recuperação roda de tempos em tempos (valores que ficaram finais, copos de água).
const CATCH_UP_EVERY_MS = 10 * 60 * 1000
// Ao voltar para o app, importa/confere de novo no máximo a cada 10 min.
const ON_RESUME_MIN_MS = 10 * 60 * 1000

/**
 * Mensagem clara para os erros do Health Connect. O mais comum: ele só deixa ler com o app na tela
 * ("must be in foreground … READ_HEALTH_DATA_IN_BACKGROUND").
 */
function describeHealthError(error) {
  const text = error?.message ?? String(error)
  if (/foreground|IN_BACKGROUND/i.test(text)) {
    return 'o Health Connect só deixa ler com o app aberto na tela; tenta de novo quando você voltar ao app'
  }
  return text
}

/** Lê as preferências salvas (tolerante a armazenamento bloqueado). */
function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }
  } catch {
    return DEFAULT_SETTINGS
  }
}

/** Salva as preferências (ignora falhas de armazenamento). */
function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Sem armazenamento local, as preferências valem só nesta sessão.
  }
}

// Registro da sincronização neste aparelho: último envio, última importação e última confirmação.
const SYNC_LOG_KEY = 'hubSaude.healthConnect.syncLog'
// Período lido de volta na confirmação (o Health Connect limita a leitura a ~30 dias sem permissão de histórico).
const VERIFY_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

/** Lê o registro da sincronização. */
function loadSyncLog() {
  try {
    return JSON.parse(localStorage.getItem(SYNC_LOG_KEY) ?? '{}')
  } catch {
    return {}
  }
}

/** Salva o registro da sincronização (ignora falhas). */
function saveSyncLog(log) {
  try {
    localStorage.setItem(SYNC_LOG_KEY, JSON.stringify(log))
  } catch {
    // Sem armazenamento local, o registro vale só nesta sessão.
  }
}

/**
 * @param {{ profile: object | null }} params - dono do celular (o Health Connect é dele)
 */
export function useHealthConnect({ profile }) {
  const native = isNativeApp()
  const [availability, setAvailability] = useState(
    native ? { checking: true } : { available: false, reason: 'O Health Connect só existe no app Android.' },
  )
  const [permissions, setPermissions] = useState(null)
  const [settings, setSettingsState] = useState(loadSettings)
  const [message, setMessage] = useState(null)
  // { exportAt, exportCount, exportError, importAt, importCount, importError, verification: { checkedAt, rows, error } }
  const [syncLog, setSyncLog] = useState(loadSyncLog)
  const [verifying, setVerifying] = useState(false)

  /** Atualiza e persiste o registro da sincronização. */
  const updateSyncLog = useCallback((patch) => {
    setSyncLog((previous) => {
      const next = { ...previous, ...patch }
      saveSyncLog(next)
      return next
    })
  }, [])

  // Valores lidos dentro do ouvinte do hub (refs: atualizados em efeitos e callbacks).
  const profileRef = useRef(profile)
  const settingsRef = useRef(settings)
  const permissionsRef = useRef(null)

  useEffect(() => {
    profileRef.current = profile
  }, [profile])

  /** Atualiza e persiste as preferências. */
  const setSettings = useCallback((patch) => {
    const next = { ...settingsRef.current, ...patch }
    settingsRef.current = next
    saveSettings(next)
    setSettingsState(next)
  }, [])

  /** Guarda o resultado das permissões no estado e na ref. */
  const applyPermissions = useCallback((status) => {
    permissionsRef.current = status
    setPermissions(status)
  }, [])

  /** Importa os últimos 7 dias de passos, FC e sono de outros apps. */
  const importNow = useCallback(async () => {
    try {
      // Leitura só com o app na tela (regra do Health Connect); com o app em segundo plano, espera voltar.
      const read = await whenAppActive(() => readRecent(7))
      const event = readSamplesToMeasurement(read, profileRef.current?.userId ?? DEFAULT_USER_ID)
      hub.emit('measurement', event)
      updateSyncLog({ importAt: Date.now(), importCount: event.metrics.length, importError: null })
      setMessage(`${event.metrics.length} registro(s) importados do Health Connect.`)
    } catch (error) {
      const message = describeHealthError(error)
      updateSyncLog({ importError: message })
      setMessage(`Não foi possível importar: ${message}`)
    }
  }, [updateSyncLog])

  /**
   * Confirmação: lê de volta os últimos 30 dias de cada tipo que o app grava e compara com os envios.
   * Mostra também quais outros apps gravam no Health Connect (prova de que a ponte deles está ligada).
   */
  const verify = useCallback(async () => {
    setVerifying(true)
    try {
      const allowed = new Set(permissionsRef.current?.readAuthorized ?? [])
      const readable = VERIFY_TYPES.filter((type) => allowed.has(type))
      const read = await whenAppActive(() => readForVerification(readable, VERIFY_DAYS))
      VERIFY_TYPES.filter((type) => !allowed.has(type)).forEach((type) => {
        read[type] = { error: 'sem permissão de leitura (toque em "Revisar permissões")' }
      })
      const userId = profileRef.current?.userId ?? DEFAULT_USER_ID
      const [exports, rows] = await Promise.all([listExports(), listMeasurements(userId)])
      const report = buildSyncReport({
        exports,
        read,
        importedRows: rows.filter((row) => row.device === HEALTH_CONNECT_DEVICE),
        since: Date.now() - VERIFY_DAYS * DAY_MS,
        limit: VERIFY_LIMIT,
      })
      updateSyncLog({ verification: { checkedAt: Date.now(), rows: report, error: null } })
    } catch (error) {
      updateSyncLog({ verification: { checkedAt: Date.now(), rows: [], error: describeHealthError(error) } })
    } finally {
      setVerifying(false)
    }
  }, [updateSyncLog])

  /** Grava as amostras de um evento, pulando as já enviadas. */
  const exportEvent = useCallback(async (event) => {
    const status = permissionsRef.current
    if (!status || event.device === HEALTH_CONNECT_DEVICE) return
    // Com o app fora da tela (sincronização do relógio em segundo plano), o envio de recuperação
    // manda isso quando o app voltar.
    if (!isAppActive()) return
    // Só os dados do dono do celular vão para o Health Connect dele.
    if (event.userId !== (profileRef.current?.userId ?? DEFAULT_USER_ID)) return
    const allowed = new Set(status.writeAuthorized ?? [])
    const samples = measurementToSamples(event, { profile: profileRef.current, ...settingsRef.current }).filter((sample) =>
      allowed.has(sample.options.dataType),
    )
    const pendingKeys = new Set(await filterNotExported(samples.map((sample) => sample.key)))
    const sent = []
    for (const sample of samples) {
      if (!pendingKeys.has(sample.key)) continue
      try {
        await saveSample(sample.options)
        sent.push(sample.key)
      } catch (error) {
        console.error('Falha ao gravar no Health Connect', sample, error)
      }
    }
    await markExported(sent)
    if (sent.length) {
      updateSyncLog({ exportAt: Date.now(), exportCount: sent.length, exportError: null })
      setMessage(`${sent.length} registro(s) enviados ao Health Connect.`)
    }
    // Algum registro recusado: fica anotado para a tela de confirmação.
    if (sent.length < pendingKeys.size) {
      updateSyncLog({ exportError: `${pendingKeys.size - sent.length} registro(s) não foram aceitos pelo Health Connect.` })
    }
  }, [updateSyncLog])

  /**
   * Envio de recuperação: manda o que ficou pendente nos últimos 30 dias (pesagens, relógio e treinos).
   * Roda ao abrir o app e pelo botão "Enviar pendentes"; as chaves de envio evitam duplicar.
   */
  const exportPending = useCallback(async () => {
    const userId = profileRef.current?.userId ?? DEFAULT_USER_ID
    const since = Date.now() - VERIFY_DAYS * DAY_MS
    const [rows, workouts] = await Promise.all([listMeasurements(userId), listWorkouts(userId)])
    const events = catchUpEvents({
      rows: rows.filter((row) => row.timestamp >= since),
      workouts: workouts.filter((workout) => workout.startedAt >= since),
      userId,
    })
    for (const event of events) await exportEvent(event)
  }, [exportEvent])

  // Ao abrir o app: verifica se o Health Connect existe, o que já foi autorizado
  // e, se a importação estiver ligada, já traz os dados de outros apps.
  useEffect(() => {
    if (!native) return undefined
    let active = true
    checkAvailability()
      .then(async (result) => {
        if (!active) return
        setAvailability(result)
        if (!result.available) return
        const status = await checkPermissions()
        if (!active) return
        applyPermissions(status)
        if (settingsRef.current.importEnabled && status.readAuthorized?.length) await importNow()
        // Manda o que ficou pendente (ex.: pesagens feitas no PC, valores que só agora são finais).
        if (active && status.writeAuthorized?.length) await exportPending()
        // Confirmação automática ao abrir o app.
        if (active && status.readAuthorized?.length) await verify()
        // Registros de envio com mais de 45 dias não servem mais (a recuperação olha 30): libera espaço.
        if (active) await pruneExports(Date.now() - 45 * DAY_MS)
      })
      .catch((error) => active && setAvailability({ available: false, reason: error.message }))
    return () => {
      active = false
    }
  }, [native, applyPermissions, importNow, exportPending, verify])

  /** Abre a tela de permissões do Health Connect. */
  const connect = useCallback(async () => {
    try {
      const status = await requestPermissions()
      applyPermissions(status)
      const denied = status.writeDenied?.length ?? 0
      setMessage(denied ? `Permissões negadas: ${status.writeDenied.join(', ')}.` : 'Health Connect autorizado.')
    } catch (error) {
      setMessage(`Não foi possível pedir as permissões: ${error.message}`)
    }
  }, [applyPermissions])

  // Envio de recuperação periódico enquanto o app está aberto e autorizado a gravar.
  const canWrite = Boolean(permissions?.writeAuthorized?.length)
  useEffect(() => {
    if (!native || !canWrite) return undefined
    const id = setInterval(() => {
      if (isAppActive()) void exportPending()
    }, CATCH_UP_EVERY_MS)
    return () => clearInterval(id)
  }, [native, canWrite, exportPending])

  // Ao voltar para o app: importa, manda o pendente e confere (no máximo a cada 10 min).
  const lastResumeRef = useRef(0)
  useEffect(() => {
    if (!native) return undefined
    return onAppStateChange((isActive) => {
      const status = permissionsRef.current
      if (!isActive || !status || Date.now() - lastResumeRef.current < ON_RESUME_MIN_MS) return
      lastResumeRef.current = Date.now()
      ;(async () => {
        if (settingsRef.current.importEnabled && status.readAuthorized?.length) await importNow()
        if (status.writeAuthorized?.length) await exportPending()
        if (status.readAuthorized?.length) await verify()
      })().catch(() => {})
    })
  }, [native, importNow, exportPending, verify])

  // Integração pelo hub: cada medição nova (balança ou relógio) vai para o Health Connect.
  useEffect(() => hub.on('measurement', (event) => void exportEvent(event)), [exportEvent])

  return {
    native,
    availability,
    permissions,
    settings,
    message,
    connect,
    importNow,
    setSettings,
    openSettings,
    syncLog,
    verify,
    verifying,
    exportPending,
  }
}
