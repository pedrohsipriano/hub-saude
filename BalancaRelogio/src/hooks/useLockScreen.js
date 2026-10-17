// Treino por cima da tela bloqueada (app Android), como a navegação do Google Maps.
// Durante um treino o app pode aparecer por cima do bloqueio: ao bloquear com o app aberto, a tela volta
// direto no painel do treino, sem desbloquear. Como não é uma notificação, funciona mesmo com as
// notificações escondidas na tela bloqueada. Bloqueado, o app mostra só o painel (LockScreenWorkout).
import { useCallback, useEffect, useState } from 'react'
import { HubBackground } from '../native/hubBackground.js'
import { isNativeApp } from '../platform.js'

/**
 * @param {boolean} active - há um treino em andamento
 * @returns {{ locked: boolean, unlock: () => void }} locked: mostrar só o painel do treino
 */
export function useLockScreen(active) {
  const native = isNativeApp()
  const [locked, setLocked] = useState(false)

  // Só durante o treino o app pode aparecer por cima da tela bloqueada.
  useEffect(() => {
    if (native) HubBackground.setShowOverLock({ enabled: active }).catch(() => {})
  }, [native, active])

  // Estado do bloqueio: avisos do Android (tela apagou, ligou, desbloqueou) e o estado ao abrir.
  useEffect(() => {
    if (!native) return undefined
    let cancelled = false
    let listener = null
    HubBackground.addListener('lockState', (event) => setLocked(Boolean(event.locked))).then((handle) => {
      if (cancelled) handle.remove()
      else listener = handle
    })
    HubBackground.lockStatus()
      .then((status) => {
        if (!cancelled) setLocked(Boolean(status.locked))
      })
      .catch(() => {})
    return () => {
      cancelled = true
      listener?.remove()
    }
  }, [native])

  /** Pede o desbloqueio (senha, digital ou rosto); depois dele o app volta ao normal. */
  const unlock = useCallback(() => {
    HubBackground.unlock().catch(() => {})
  }, [])

  return { locked: native && active && locked, unlock }
}
