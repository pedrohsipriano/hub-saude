// Hook da balança: liga um adapter de scan (real ou simulado) à sessão da balança
// e publica no hub cada pesagem concluída. Fica no App para a conexão continuar
// ativa enquanto o usuário navega entre as páginas.
import { useCallback, useEffect, useRef, useState } from 'react'
import { createNativeScanner } from '../ble/nativeScanner.js'
import { createSimulatedScanner } from '../ble/simulatedScanner.js'
import { createWebBluetoothScanner, describeBleError, getWebBluetoothSupport } from '../ble/webBluetoothScanner.js'
import { isNativeApp } from '../platform.js'
import { createScaleSession } from '../devices/scale/scaleSession.js'
import { weighingToMeasurement } from '../devices/scale/weighings.js'
import { DEFAULT_USER_ID, hub } from '../hub/hub.js'

// Modos de conexão aceitos por connect().
export const SCALE_MODE = { BLUETOOTH: 'bluetooth', SIMULATOR: 'simulator' }

/**
 * @param {object} [options]
 * @param {(reading: object) => Promise<{ userId: string | null, needsConfirmation: boolean, candidates: Array<object> }>} [options.resolveOwner]
 *   decide de quem é a pesagem (vários usuários na mesma balança); sem ele, vai para o usuário padrão
 * @returns {{
 *   status: 'idle' | 'connecting' | 'listening' | 'error',
 *   error: string | null,
 *   live: object | null,
 *   lastFinal: object | null,
 *   pending: { reading: object, candidates: Array<object> } | null,
 *   support: { ok: boolean, reason: string | null },
 *   connect: (mode: string) => Promise<void>,
 *   disconnect: () => void,
 *   confirmPending: (userId: string) => void,
 *   dismissPending: () => void,
 * }}
 */
export function useScale({ resolveOwner } = {}) {
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  // Última leitura recebida (peso ao vivo) e última pesagem concluída.
  const [live, setLive] = useState(null)
  const [lastFinal, setLastFinal] = useState(null)
  // Pesagem esperando o usuário dizer de quem é.
  const [pending, setPending] = useState(null)
  // O suporte não muda durante a sessão (no app Android o Bluetooth é nativo).
  const [support] = useState(() => (isNativeApp() ? { ok: true, reason: null } : getWebBluetoothSupport()))
  // Adapter em uso no momento.
  const scannerRef = useRef(null)
  // Função de atribuição mais recente (muda quando a lista de usuários muda).
  const resolverRef = useRef(resolveOwner)
  useEffect(() => {
    resolverRef.current = resolveOwner
  }, [resolveOwner])

  /** Pesagem concluída: decide de quem é (na dúvida, pergunta na tela) e publica no hub. */
  const handleFinal = useCallback(async (reading) => {
    setLastFinal(reading)
    const assignment = (await resolverRef.current?.(reading)) ?? { userId: DEFAULT_USER_ID, needsConfirmation: false }
    if (assignment.needsConfirmation) {
      setPending({ reading, candidates: assignment.candidates })
      return
    }
    // O hub grava no banco e avisa as outras telas.
    hub.emit('measurement', weighingToMeasurement(reading, assignment.userId))
  }, [])

  // A sessão filtra os pacotes repetidos e avisa uma vez por pesagem.
  // É criada na primeira conexão (fora da renderização) e reaproveitada depois.
  const sessionRef = useRef(null)
  const getSession = useCallback(() => {
    if (!sessionRef.current) sessionRef.current = createScaleSession({ onLive: setLive, onFinal: handleFinal })
    return sessionRef.current
  }, [handleFinal])

  /** Confirma de quem é a pesagem pendente. */
  const confirmPending = useCallback(
    (userId) => {
      if (!pending) return
      hub.emit('measurement', weighingToMeasurement(pending.reading, userId))
      setPending(null)
    },
    [pending],
  )

  /** Descarta a pesagem pendente (ex.: alguém subiu na balança sem querer). */
  const dismissPending = useCallback(() => setPending(null), [])

  /** Para o adapter atual, se houver. */
  const stopScanner = useCallback(() => {
    scannerRef.current?.stop()
    scannerRef.current = null
  }, [])

  /** Conecta à balança real (Web Bluetooth) ou ao simulador. */
  const connect = useCallback(
    async (mode) => {
      stopScanner()
      const session = getSession()
      session.reset()
      setError(null)
      setLive(null)
      setStatus('connecting')

      // Simulador, Bluetooth nativo (app Android) ou Web Bluetooth (navegador).
      const scanner =
        mode === SCALE_MODE.SIMULATOR
          ? createSimulatedScanner()
          : isNativeApp()
            ? createNativeScanner()
            : createWebBluetoothScanner()
      scannerRef.current = scanner

      try {
        await scanner.start((advertisement) => session.handleAdvertisement(advertisement), {
          // O simulador termina sozinho ao fim da pesagem.
          onEnd: () => {
            if (scannerRef.current === scanner) {
              scannerRef.current = null
              setStatus('idle')
            }
          },
        })
        if (scannerRef.current === scanner) setStatus('listening')
      } catch (err) {
        if (scannerRef.current === scanner) scannerRef.current = null
        setStatus('error')
        setError(describeBleError(err))
      }
    },
    [getSession, stopScanner],
  )

  /** Para de escutar a balança. */
  const disconnect = useCallback(() => {
    stopScanner()
    setStatus('idle')
  }, [stopScanner])

  // Ao desmontar o App, solta o Bluetooth.
  useEffect(() => stopScanner, [stopScanner])

  return { status, error, live, lastFinal, pending, support, connect, disconnect, confirmPending, dismissPending }
}
