// Linha "Relógio: atualizado às 10:32 ✓" (Perfil e Metas): mostra se o perfil e a meta salvos
// já foram para o relógio — o envio é automático ao salvar e sempre que o relógio conecta.
import { formatTime } from '../../utils/format.js'
import styles from './WatchSyncStatus.module.css'

/**
 * @param {object} props
 * @param {object} props.watch - hook do relógio (status, profileSync)
 * @param {boolean} props.isWatchOwner - o perfil mostrado é o do dono do relógio
 */
export default function WatchSyncStatus({ watch, isWatchOwner }) {
  if (!isWatchOwner) return null
  const connected = watch.status === 'connected' || watch.status === 'syncing'
  const sync = watch.profileSync

  if (!connected) {
    return <p className={styles.pending}>Relógio desconectado: os dados salvos vão para ele assim que conectar.</p>
  }
  if (!sync) return <p className={styles.pending}>Enviando ao relógio…</p>
  if (!sync.ok) return <p className={styles.error}>Não foi possível atualizar o relógio: {sync.message}</p>
  return (
    <p className={styles.ok}>
      ✓ Relógio atualizado às {formatTime(sync.at)}
      {sync.steps ? ` · meta de ${sync.steps.toLocaleString('pt-BR')} passos` : ''}
    </p>
  )
}
