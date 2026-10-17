// Relógio → Notificações do celular: ligar, liberar o acesso, escolher os apps e o ícone de cada um,
// texto completo ou só o nome do app, testes e o funcionamento em segundo plano (economia de bateria).
import { useRef, useState } from 'react'
import { WATCH_ICON_TYPES, iconTypeFor } from '../../devices/watch/notificationTypes.js'
import { useWatchNotifications } from '../../hooks/useWatchNotifications.js'
import ui from '../../styles/controls.module.css'
import { formatTime } from '../../utils/format.js'
import styles from './WatchPage.module.css'

// Intervalo entre as notificações do "Testar ícones".
const ICON_TEST_INTERVAL_MS = 3000

/**
 * @param {object} props
 * @param {object} props.watch - hook do relógio (sendAlert)
 * @param {boolean} props.connected
 */
export default function WatchNotificationsCard({ watch, connected }) {
  const notifications = useWatchNotifications()
  const { native, settings, access, apps, battery, lastForwarded } = notifications
  const [testMessage, setTestMessage] = useState(null)
  const [iconTest, setIconTest] = useState(null) // número do tipo sendo testado
  const iconTimer = useRef(null)

  /** Notificação de teste no relógio. */
  const sendTest = async () => {
    try {
      await watch.sendAlert({ type: 10, title: 'Hub de Saúde', text: 'Teste: as notificações do celular vão aparecer assim.' })
      setTestMessage('Enviada! Confira o relógio.')
    } catch (error) {
      setTestMessage(error.message)
    }
  }

  /** Manda uma notificação de cada tipo (0 a 31), para ver qual ícone o relógio mostra para cada número. */
  const startIconTest = () => {
    clearTimeout(iconTimer.current)
    const step = (index) => {
      const type = WATCH_ICON_TYPES[index]
      if (!type) {
        setIconTest(null)
        return
      }
      setIconTest(type.id)
      watch.sendAlert({ type: type.id, title: `Tipo ${type.id}`, text: `Ícone: ${type.label}` }).catch(() => {})
      iconTimer.current = setTimeout(() => step(index + 1), ICON_TEST_INTERVAL_MS)
    }
    step(0)
  }

  const stopIconTest = () => {
    clearTimeout(iconTimer.current)
    setIconTest(null)
  }

  if (!native) {
    return (
      <div className={ui.card}>
        <h3 className={ui.cardTitle}>Notificações do celular no relógio</h3>
        <p className={ui.hint}>Funciona no app Android: ele lê as notificações do celular e as mostra no relógio, mesmo com o app fechado.</p>
      </div>
    )
  }

  return (
    <>
      <div className={ui.card}>
        <h3 className={ui.cardTitle}>Notificações do celular no relógio</h3>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={settings.enabled} onChange={(event) => notifications.update({ enabled: event.target.checked })} />
          Mostrar as notificações do celular no relógio (WhatsApp, chamadas, SMS…)
        </label>

        {/* Acesso às notificações (o usuário libera uma vez nas configurações do Android). */}
        <p className={access ? styles.ok : styles.warn}>
          {access == null ? 'Verificando o acesso…' : access ? '✓ Acesso às notificações liberado' : '✕ O app ainda não pode ler as notificações'}
        </p>
        {access === false && (
          <div className={ui.actions}>
            <button type="button" className={`${ui.button} ${ui.buttonPrimary}`} onClick={notifications.openAccessSettings}>
              Liberar acesso às notificações
            </button>
          </div>
        )}

        <fieldset className={styles.options}>
          <legend className={ui.label}>O que aparece no relógio</legend>
          <label className={styles.checkbox}>
            <input type="radio" name="content-mode" checked={settings.contentMode === 'full'} onChange={() => notifications.update({ contentMode: 'full' })} />
            Quem mandou e a mensagem
          </label>
          <label className={styles.checkbox}>
            <input type="radio" name="content-mode" checked={settings.contentMode === 'appOnly'} onChange={() => notifications.update({ contentMode: 'appOnly' })} />
            Só o nome do app (mais privacidade)
          </label>
        </fieldset>

        <div className={ui.actions}>
          <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} disabled={!connected} onClick={sendTest}>
            Enviar notificação de teste
          </button>
          {iconTest == null ? (
            <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} disabled={!connected} onClick={startIconTest}>
              Testar ícones (tipos 0 a 31)
            </button>
          ) : (
            <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={stopIconTest}>
              Parar teste (tipo {iconTest})
            </button>
          )}
        </div>
        {testMessage && <p className={ui.hint}>{testMessage}</p>}
        {lastForwarded && (
          <p className={ui.hint}>
            Última enviada ao relógio: {lastForwarded.appName} às {formatTime(lastForwarded.at)}
          </p>
        )}
        <p className={ui.hint}>
          O &quot;Testar ícones&quot; manda uma notificação de cada tipo (uma a cada 3 s): veja no relógio qual ícone aparece e
          escolha o ícone de cada app abaixo. Chamadas tocando vão sempre como &quot;Chamada&quot;.
        </p>
      </div>

      {/* Apps que já mandaram notificação neste celular. */}
      <div className={ui.card}>
        <h3 className={ui.cardTitle}>Apps</h3>
        {apps.length ? (
          <ul className={styles.appList}>
            {apps.map((app) => (
              <li key={app.packageName} className={styles.appRow}>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={!settings.blocked.includes(app.packageName)}
                    onChange={(event) => notifications.toggleApp(app.packageName, event.target.checked)}
                  />
                  <span>
                    {app.appName} <span className={styles.appCount}>({app.count})</span>
                  </span>
                </label>
                <select
                  className={ui.input}
                  aria-label={`Ícone de ${app.appName} no relógio`}
                  value={iconTypeFor(app.packageName, settings.types)}
                  onChange={(event) => notifications.setAppIcon(app.packageName, Number(event.target.value))}
                >
                  {WATCH_ICON_TYPES.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.id} · {type.label}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        ) : (
          <p className={ui.hint}>Os apps aparecem aqui conforme mandam notificações (depois de liberar o acesso).</p>
        )}
      </div>

      {/* Segundo plano: o que mantém tudo funcionando com o app fechado. */}
      <div className={ui.card}>
        <h3 className={ui.cardTitle}>Funcionar com o app fechado</h3>
        <p className={ui.hint}>
          A conexão com o relógio fica num serviço do Android (notificação fixa &quot;Conectado ao relógio&quot;): continua com o
          app fechado, reconecta sozinha quando o relógio volta ao alcance ou o Bluetooth é religado, e volta depois de
          reiniciar o celular.
        </p>
        <p className={battery?.ignoringOptimizations ? styles.ok : styles.warn}>
          {battery == null
            ? 'Verificando a bateria…'
            : battery.ignoringOptimizations
              ? '✓ Liberado da economia de bateria'
              : '✕ A economia de bateria pode fechar a conexão'}
        </p>
        {battery && !battery.ignoringOptimizations && (
          <div className={ui.actions}>
            <button type="button" className={`${ui.button} ${ui.buttonPrimary}`} onClick={notifications.requestBatteryExemption}>
              Liberar da economia de bateria
            </button>
          </div>
        )}
        <p className={ui.hint}>
          No Samsung, confira também: Configurações → Bateria → Limites de uso em segundo plano → &quot;Apps que nunca são
          suspensos&quot; → adicione o Hub de Saúde. Só &quot;Forçar parada&quot; nas configurações do app desliga tudo.
        </p>
      </div>
    </>
  )
}
