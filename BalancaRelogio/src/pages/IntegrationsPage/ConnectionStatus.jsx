// Cartão de status da conexão com o Health Connect (topo da tela Integrações):
// indicação grande e colorida (conectado / em parte / não conectado) e o botão que abre direto
// a tela de permissões do Health Connect, onde ficam as chaves "Permitir tudo" e por tipo de dado.
import { connectionState } from '../../integrations/healthConnect/healthConnectMapping.js'
import ui from '../../styles/controls.module.css'
import { formatDate, formatTime } from '../../utils/format.js'
import styles from './IntegrationsPage.module.css'

/** Ícone, cor, título e explicação de cada estado. */
function describe(status) {
  switch (status.state) {
    case 'unsupported':
      return {
        tone: styles.toneOff,
        icon: '✕',
        title: 'Não conectado',
        text: 'O Health Connect só existe no celular Android. Neste PC os dados ficam só no banco local: abra o app Hub de Saúde no celular para conectar.',
      }
    case 'checking':
      return { tone: styles.tonePending, icon: '…', title: 'Verificando o Health Connect…', text: 'Um instante.' }
    case 'unavailable':
      return {
        tone: styles.toneError,
        icon: '!',
        title: 'Health Connect não encontrado',
        text: `${status.reason ? `${status.reason} ` : ''}Instale o "Health Connect" pela Play Store (no Android 14 ou mais novo ele já vem no sistema).`,
      }
    case 'disconnected':
      return {
        tone: styles.toneError,
        icon: '✕',
        title: 'Não conectado',
        text: 'Toque em "Conectar ao Health Connect" e, na tela que abrir, ative "Permitir tudo".',
      }
    case 'partial':
      return {
        tone: styles.toneWarn,
        icon: '!',
        title: 'Conectado em parte',
        text: `${status.granted} de ${status.total} permissões. Faltam: ${status.missing.join(', ')}. Toque em "Conectar ao Health Connect" e ative as que faltam.`,
      }
    default:
      return {
        tone: styles.toneOk,
        icon: '✓',
        title: 'Conectado',
        text: `Todas as ${status.total} permissões ativas: o app envia e lê os dados de saúde.`,
      }
  }
}

/**
 * @param {object} props
 * @param {ReturnType<typeof import('../../hooks/useHealthConnect.js').useHealthConnect>} props.healthConnect
 */
export default function ConnectionStatus({ healthConnect }) {
  const status = connectionState(healthConnect)
  const view = describe(status)
  const canConnect = ['disconnected', 'partial', 'connected'].includes(status.state)
  const verification = healthConnect.syncLog?.verification
  const confirmed = verification?.rows?.filter((row) => row.status === 'ok').length ?? 0

  return (
    <div className={`${ui.card} ${styles.statusCard} ${view.tone}`} role="status" aria-live="polite">
      <div className={styles.statusHeader}>
        <span className={styles.statusIcon} aria-hidden="true">
          {view.icon}
        </span>
        <div>
          <p className={styles.statusTitle}>{view.title}</p>
          <p className={styles.statusService}>Health Connect · Samsung Health · Google</p>
        </div>
      </div>
      <p className={styles.statusText}>{view.text}</p>

      {/* Confirmação mais recente (quando já conectado). */}
      {status.state === 'connected' && verification?.checkedAt && (
        <p className={ui.hint}>
          Última confirmação: {formatDate(verification.checkedAt)} às {formatTime(verification.checkedAt)} · {confirmed} tipo(s) de
          dado confirmados no Health Connect (detalhes abaixo).
        </p>
      )}

      <div className={ui.actions}>
        {canConnect && (
          <button type="button" className={`${ui.button} ${ui.buttonPrimary}`} onClick={healthConnect.connect}>
            {status.state === 'connected' ? 'Revisar permissões' : 'Conectar ao Health Connect'}
          </button>
        )}
        {status.state === 'unavailable' && (
          <button type="button" className={`${ui.button} ${ui.buttonPrimary}`} onClick={healthConnect.openSettings}>
            Abrir o Health Connect
          </button>
        )}
        {status.state === 'unsupported' && (
          <button type="button" className={`${ui.button} ${ui.buttonPrimary}`} disabled>
            Conectar (só no app Android)
          </button>
        )}
      </div>
    </div>
  )
}
