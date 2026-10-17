// Notificações do celular no relógio (app Android): preferências (ligado, texto ou só o nome do app,
// apps bloqueados, ícone de cada app), acesso às notificações, lista de apps, economia de bateria
// e envio das preferências ao serviço nativo, que repassa as notificações mesmo com o app fechado.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { HubBackground } from '../ble/watchServiceConnector.js'
import { DEFAULT_NOTIFICATION_SETTINGS, nativeNotificationConfig } from '../devices/watch/notificationTypes.js'
import { isNativeApp } from '../platform.js'
import { usePersistentState } from './usePersistentState.js'

/** Lê do Android: acesso às notificações, apps que já notificaram e economia de bateria. */
async function readAndroidStatus() {
  const [accessResult, appsResult, batteryResult] = await Promise.all([
    HubBackground.notificationAccess(),
    HubBackground.notificationApps(),
    HubBackground.batteryStatus(),
  ])
  return { access: accessResult.enabled, apps: [...appsResult.apps].sort((a, b) => b.count - a.count), battery: batteryResult }
}

export function useWatchNotifications() {
  const native = isNativeApp()
  const [stored, setStored] = usePersistentState('hubSaude.watchNotifications', DEFAULT_NOTIFICATION_SETTINGS)
  const settings = useMemo(() => ({ ...DEFAULT_NOTIFICATION_SETTINGS, ...stored }), [stored])
  const [access, setAccess] = useState(null) // null = verificando; true/false
  const [apps, setApps] = useState([]) // [{ packageName, appName, count, last }]
  const [battery, setBattery] = useState(null) // { ignoringOptimizations }
  const [lastForwarded, setLastForwarded] = useState(null) // { appName, at }

  /** Aplica o que foi lido do Android. */
  const applyStatus = useCallback((status) => {
    setAccess(status.access)
    setApps(status.apps)
    setBattery(status.battery)
  }, [])

  /** Lê de novo do Android e atualiza a tela. */
  const refresh = useCallback(() => readAndroidStatus().then(applyStatus).catch(() => {}), [applyStatus])

  // Ao abrir e ao voltar para o app (por exemplo, depois de liberar o acesso nas configurações).
  useEffect(() => {
    if (!native) return undefined
    readAndroidStatus().then(applyStatus).catch(() => {})
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [native, applyStatus, refresh])

  // As preferências vão para o serviço nativo sempre que mudam (ele as lê com o app fechado).
  useEffect(() => {
    if (!native) return
    HubBackground.configureNotifications(nativeNotificationConfig(settings)).catch(() => {})
  }, [native, settings])

  // Com o app aberto: a lista de apps se atualiza a cada notificação, e mostra a última enviada ao relógio.
  useEffect(() => {
    if (!native) return undefined
    let handle = null
    let cancelled = false
    HubBackground.addListener('notificationPosted', (event) => {
      if (event.forwarded) setLastForwarded({ appName: event.appName, at: event.postedAt })
      refresh()
    }).then((listener) => {
      if (cancelled) listener.remove()
      else handle = listener
    })
    return () => {
      cancelled = true
      handle?.remove()
    }
  }, [native, refresh])

  /** Atualiza as preferências. */
  const update = useCallback(
    (patch) => setStored((previous) => ({ ...DEFAULT_NOTIFICATION_SETTINGS, ...previous, ...patch })),
    [setStored],
  )

  /** Liga/desliga um app (enabled = vai para o relógio). */
  const toggleApp = useCallback(
    (packageName, enabled) =>
      setStored((previous) => {
        const blocked = new Set(previous.blocked ?? [])
        if (enabled) blocked.delete(packageName)
        else blocked.add(packageName)
        return { ...DEFAULT_NOTIFICATION_SETTINGS, ...previous, blocked: [...blocked] }
      }),
    [setStored],
  )

  /** Troca o ícone (tipo) de um app no relógio. */
  const setAppIcon = useCallback(
    (packageName, type) =>
      setStored((previous) => ({ ...DEFAULT_NOTIFICATION_SETTINGS, ...previous, types: { ...previous.types, [packageName]: type } })),
    [setStored],
  )

  return {
    native,
    settings,
    update,
    toggleApp,
    setAppIcon,
    access,
    apps,
    battery,
    lastForwarded,
    refresh,
    openAccessSettings: () => HubBackground.openNotificationAccessSettings(),
    requestBatteryExemption: () => HubBackground.requestIgnoreBatteryOptimizations(),
  }
}
