// Relógio → Diagnóstico da conexão (app Android): o estado do serviço e os últimos eventos da conexão
// (conectou, desconectou com o código do Android, novas tentativas, Bluetooth ligado/desligado),
// com "Copiar" para mandar e descobrir por que o relógio caiu.
import { useState } from 'react'
import { HubBackground } from '../../ble/watchServiceConnector.js'
import { isNativeApp } from '../../platform.js'
import ui from '../../styles/controls.module.css'
import styles from './WatchPage.module.css'

export default function ConnectionLogCard() {
  const [status, setStatus] = useState(null) // { state, address, name, running, log: string[] }
  const [copied, setCopied] = useState(false)

  if (!isNativeApp()) return null

  /** Lê o estado e o registro do serviço. */
  const load = async () => {
    setCopied(false)
    try {
      setStatus(await HubBackground.watchStatus())
    } catch (error) {
      setStatus({ state: 'erro', log: [error.message] })
    }
  }

  /** Texto para colar na conversa. */
  const toText = () => [`Estado: ${status.state} · serviço ${status.running ? 'ligado' : 'parado'} · ${status.name ?? ''} ${status.address ?? ''}`, ...(status.log ?? [])].join('\n')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toText())
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className={ui.card}>
      <h3 className={ui.cardTitle}>Diagnóstico da conexão</h3>
      <div className={ui.actions}>
        <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={load}>
          {status ? 'Atualizar' : 'Ver registro da conexão'}
        </button>
        {status && (
          <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={copy}>
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
        )}
      </div>
      {status && (
        <>
          <p className={ui.hint}>
            Estado do serviço: <strong>{status.state}</strong> · {status.running ? 'ligado' : 'parado'}
          </p>
          <pre className={styles.connectionLog}>{status.log?.length ? status.log.join('\n') : 'Sem eventos ainda.'}</pre>
          <p className={ui.hint}>
            &quot;status 0&quot; = queda normal (relógio longe ou desligado); 8 = tempo esgotado; 19 = o relógio encerrou; 133 = erro
            do Bluetooth do celular (comum na Samsung, ele tenta de novo sozinho).
          </p>
        </>
      )}
    </div>
  )
}
