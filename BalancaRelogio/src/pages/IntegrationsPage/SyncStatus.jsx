// Confirmação da sincronização com o Health Connect (e, por ele, Samsung Health e Google):
// último envio e importação, o que foi lido de volta com a origem deste app e quais outros apps gravam lá.
import { useState } from 'react'
import ui from '../../styles/controls.module.css'
import { formatDate, formatTime } from '../../utils/format.js'
import styles from './IntegrationsPage.module.css'

// Apps cuja presença como origem mostra que a ponte deles com o Health Connect está ligada.
const BRIDGES = ['Samsung Health', 'Google Fit']

// Texto e estilo de cada status.
const STATUS = {
  ok: { text: '✓ confirmado', className: styles.ok },
  missing: { text: '⚠ enviado, não encontrado', className: styles.warn },
  none: { text: '— nada no período', className: styles.muted },
  error: { text: 'não conferido', className: styles.muted },
}

/** "16/10/2026 às 07:31". */
const when = (ms) => `${formatDate(ms)} às ${formatTime(ms)}`

/**
 * @param {object} props
 * @param {ReturnType<typeof import('../../hooks/useHealthConnect.js').useHealthConnect>} props.healthConnect
 */
export default function SyncStatus({ healthConnect }) {
  const { syncLog, verify, verifying, exportPending } = healthConnect
  const [sending, setSending] = useState(false)

  /** Manda o que ficou pendente e confere de novo. */
  const sendPending = async () => {
    setSending(true)
    try {
      await exportPending()
      await verify()
    } finally {
      setSending(false)
    }
  }
  const verification = syncLog.verification
  const rows = verification?.rows ?? []
  const sentTypes = rows.filter((row) => row.sent > 0)
  const confirmedTypes = rows.filter((row) => row.status === 'ok')
  // Outros apps que aparecem como origem em algum tipo.
  const otherApps = new Set(rows.flatMap((row) => row.others.map((other) => other.label)))

  return (
    <div className={ui.card}>
      <h3 className={ui.cardTitle}>Confirmação da sincronização</h3>

      <ul className={styles.summary}>
        <li>
          <strong>Envio (app → Health Connect):</strong>{' '}
          {syncLog.exportAt ? `último em ${when(syncLog.exportAt)} (${syncLog.exportCount} registro(s))` : 'nada enviado ainda'}
          {syncLog.exportError && <span className={styles.warn}> · {syncLog.exportError}</span>}
        </li>
        <li>
          <strong>Importação (Health Connect → app):</strong>{' '}
          {syncLog.importAt ? `última em ${when(syncLog.importAt)} (${syncLog.importCount} registro(s))` : 'nada importado ainda'}
          {syncLog.importError && <span className={styles.warn}> · {syncLog.importError}</span>}
        </li>
        {verification && !verification.error && (
          <li>
            <strong>Confirmado no Health Connect:</strong>{' '}
            <span className={confirmedTypes.length && confirmedTypes.length >= sentTypes.length ? styles.ok : styles.warn}>
              {confirmedTypes.length} de {sentTypes.length} tipo(s) enviados nos últimos 30 dias
            </span>
          </li>
        )}
        {verification &&
          !verification.error &&
          BRIDGES.map((app) => (
            <li key={app}>
              <strong>{app}:</strong>{' '}
              {otherApps.has(app) ? (
                <span className={styles.ok}>✓ grava no Health Connect (a sincronização dele está ligada)</span>
              ) : (
                <span className={styles.muted}>não apareceu como origem nos últimos 30 dias</span>
              )}
            </li>
          ))}
      </ul>

      <div className={ui.actions}>
        <button type="button" className={`${ui.button} ${ui.buttonPrimary}`} disabled={verifying || sending} onClick={verify}>
          {verifying ? 'Conferindo…' : 'Conferir agora'}
        </button>
        <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} disabled={verifying || sending} onClick={sendPending}>
          {sending ? 'Enviando…' : 'Enviar pendentes'}
        </button>
      </div>
      {verification?.checkedAt && <p className={ui.hint}>Conferido em {when(verification.checkedAt)} (também confere sozinho ao abrir o app).</p>}
      {verification?.error && <p className={ui.error}>Não foi possível conferir: {verification.error}</p>}

      {rows.length > 0 && (
        <div className={ui.tableWrapper}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Dado</th>
                <th>Enviados</th>
                <th>No Health Connect</th>
                <th>Outros apps</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.dataType}>
                  <td>{row.label}</td>
                  <td>{row.sent}</td>
                  <td>
                    {row.confirmed}
                    {row.truncated ? '+' : ''}
                  </td>
                  <td>{row.others.length ? row.others.map((other) => `${other.label} (${other.count})`).join(', ') : '—'}</td>
                  <td className={STATUS[row.status].className} title={row.error}>
                    {STATUS[row.status].text}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={ui.hint}>
        Últimos 30 dias. &quot;No Health Connect&quot; conta o que tem a origem deste app (prova de que chegou). FC, SpO2 e
        pressão só vão depois que a meia hora termina, e o sono 30 min depois de acordar, porque o Health Connect não deixa
        corrigir um registro já gravado. O que ficou para trás vai em &quot;Enviar pendentes&quot; (também roda ao abrir o app). O Samsung Health
        e o Google Fit leem do Health Connect; quando aparecem como origem de algum dado, a ponte deles está ligada. O que eles
        mostram por dentro não é visível para este app.
      </p>
    </div>
  )
}
