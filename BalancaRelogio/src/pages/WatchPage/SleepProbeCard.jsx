// Teste do sono e dos treinos do relógio: pede o sono com cada parâmetro (00 a 06) e os treinos (0x50),
// mostra o que veio (legível e em bytes) e permite copiar tudo para analisar o protocolo.
import { useState } from 'react'
import ui from '../../styles/controls.module.css'
import { formatDateTime, formatMinutes, formatTime } from '../../utils/format.js'
import styles from './WatchPage.module.css'

/** Parâmetro em hex de 2 dígitos ("03"). */
const hex2 = (value) => value.toString(16).padStart(2, '0').toUpperCase()

/** Resumo legível de uma resposta. */
function describe(item) {
  if (item.error) return `erro: ${item.error}`
  if (item.sleep) {
    const { startMs, endMs, asleepMinutes, deepMinutes, lightMinutes, awakeMinutes } = item.sleep
    return `${formatDateTime(startMs)} → ${formatTime(endMs)} · dormiu ${formatMinutes(asleepMinutes)} (profundo ${formatMinutes(deepMinutes)}, leve ${formatMinutes(lightMinutes)}, acordado ${formatMinutes(awakeMinutes)})`
  }
  return item.hex && item.hex.split(' ').length <= 5 ? 'sem dados' : 'veio com dados (ver bytes)'
}

/** Texto para copiar e colar na conversa. */
function toText(probe) {
  const lines = probe.items.map((item) => `${item.kind} ${hex2(item.param)}: ${describe(item)}\n  ${item.hex ?? '-'}`)
  return [`Diagnóstico de ${formatDateTime(probe.at)}`, ...lines].join('\n')
}

/**
 * @param {object} props
 * @param {object} props.watch - hook do relógio
 * @param {boolean} props.connected
 */
export default function SleepProbeCard({ watch, connected }) {
  const { probe, probing } = watch
  const [copied, setCopied] = useState(false)

  /** Copia o resultado para a área de transferência. */
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toText(probe))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className={ui.card}>
      <h3 className={ui.cardTitle}>Teste do sono e dos treinos</h3>
      <p className={ui.hint}>
        Pede o sono ao relógio com os parâmetros 00 a 06 e os treinos feitos no relógio (comando 50). Faça de manhã,
        depois de dormir com o relógio, <strong>antes</strong> de abrir o MActivePro.
      </p>
      <div className={ui.actions}>
        <button type="button" className={`${ui.button} ${ui.buttonPrimary}`} disabled={!connected || probing} onClick={watch.diagnoseSleep}>
          {probing ? 'Lendo…' : 'Fazer o teste'}
        </button>
        {probe && (
          <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={copy}>
            {copied ? 'Copiado!' : 'Copiar resultado'}
          </button>
        )}
      </div>
      {probe && (
        <>
          <p className={ui.hint}>Último teste: {formatDateTime(probe.at)}</p>
          <ul className={styles.probeList}>
            {probe.items.map((item) => (
              <li key={`${item.kind}-${item.param}`}>
                <strong>
                  {item.kind} {hex2(item.param)}:
                </strong>{' '}
                {describe(item)}
                <code className={styles.probeHex}>{item.hex ?? '—'}</code>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
