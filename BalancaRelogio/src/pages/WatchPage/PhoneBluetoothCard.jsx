// Relógio → Bluetooth do celular (app Android): mostra se o relógio do app está pareado no Bluetooth do
// celular e ligado a ele agora, lista os relógios pareados (para usar um deles direto, sem busca) e
// permite parear pelo Bluetooth do celular — com o pareamento, o Android mantém e refaz a ligação sozinho.
import { useEffect, useState } from 'react'
import { HubBackground } from '../../ble/watchServiceConnector.js'
import { WATCH_MODE } from '../../hooks/useWatch.js'
import { isNativeApp } from '../../platform.js'
import ui from '../../styles/controls.module.css'
import styles from './WatchPage.module.css'

// De quanto em quanto tempo a tela confere o Bluetooth do celular.
const REFRESH_MS = 5000

/** Situação do relógio do app e os aparelhos pareados no celular. */
async function readBluetoothInfo() {
  const [status, bonded] = await Promise.all([HubBackground.watchStatus(), HubBackground.bondedDevices()])
  // Parecem relógios: nome com "watch" e Bluetooth de baixo consumo (LE ou duplo).
  const watches = bonded.devices.filter((device) => /watch/i.test(device.name ?? '') || device.address === status.address)
  return { status, watches }
}

/** "✓ sim" / "✕ não". */
const yesNo = (value) => (value ? '✓ sim' : '✕ não')

/**
 * @param {object} props
 * @param {object} props.watch - hook do relógio
 */
export default function PhoneBluetoothCard({ watch }) {
  const [info, setInfo] = useState(null)
  const [message, setMessage] = useState(null)
  const native = isNativeApp()

  // Confere ao abrir e a cada 5 s (pareamento e ligação mudam fora do app).
  useEffect(() => {
    if (!native) return undefined
    const load = () => readBluetoothInfo().then(setInfo).catch((error) => setMessage(error.message))
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => clearInterval(id)
  }, [native])

  if (!native) return null

  const status = info?.status

  /** Pede ao Android para parear o relógio do app. */
  const pair = async () => {
    setMessage(null)
    try {
      const { started } = await HubBackground.pairWatch({ address: status.address })
      setMessage(started ? 'Confirme o pareamento na janela do Android (e no relógio, se ele pedir).' : 'O Android não iniciou o pareamento.')
    } catch (error) {
      setMessage(error.message)
    }
  }

  return (
    <div className={ui.card}>
      <h3 className={ui.cardTitle}>Bluetooth do celular</h3>
      {status?.address ? (
        <ul className={styles.btList}>
          <li>
            Relógio do app: <strong>{status.name ?? 'relógio'}</strong> <span className={styles.appCount}>({status.address})</span>
          </li>
          <li>Pareado no Bluetooth do celular: {status.bond ? yesNo(status.bonded) : '--'}</li>
          <li>Ligado ao celular agora: {status.systemConnected == null ? '--' : yesNo(status.systemConnected)}</li>
        </ul>
      ) : (
        <p className={ui.hint}>Nenhum relógio escolhido ainda.</p>
      )}

      <div className={ui.actions}>
        {status?.address && status.bonded === false && (
          <button type="button" className={`${ui.button} ${ui.buttonPrimary}`} onClick={pair}>
            Parear pelo Bluetooth do celular
          </button>
        )}
        <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={() => HubBackground.openBluetoothSettings()}>
          Abrir Bluetooth do celular
        </button>
      </div>

      {/* Relógios pareados no celular: usar um deles direto (não precisa estar anunciando). */}
      {info?.watches.length > 0 && (
        <>
          <p className={ui.label}>Relógios pareados no celular</p>
          <ul className={styles.appList}>
            {info.watches.map((device) => (
              <li key={device.address} className={styles.appRow}>
                <span>
                  {device.name ?? 'Sem nome'} <span className={styles.appCount}>({device.address} · {device.type}{device.connected ? ' · ligado' : ''})</span>
                </span>
                {device.address !== status?.address && (
                  <button
                    type="button"
                    className={`${ui.button} ${ui.buttonSecondary}`}
                    onClick={() => watch.connect(WATCH_MODE.BLUETOOTH, { address: device.address, name: device.name })}
                  >
                    Usar este
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {message && <p className={ui.hint}>{message}</p>}
      <p className={ui.hint}>
        Pareado no celular, o Android mantém a ligação com o relógio sozinho e o app se junta a ela — mais estável que a
        busca. Se o relógio não aparece na lista, pareie em Configurações → Bluetooth (com o MActivePro fechado) e volte aqui.
      </p>
    </div>
  )
}
