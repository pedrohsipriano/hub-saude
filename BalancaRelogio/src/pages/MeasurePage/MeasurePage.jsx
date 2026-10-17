// Página de medição: conexão com a balança, peso ao vivo e composição da última pesagem.
import { useMemo } from 'react'
import AssignWeighing from '../../components/AssignWeighing/AssignWeighing.jsx'
import CompositionTable from '../../components/CompositionTable/CompositionTable.jsx'
import { SCALE_MODE } from '../../hooks/useScale.js'
import { evaluateWeighing } from '../../report/buildProgressReport.js'
import ui from '../../styles/controls.module.css'
import { formatDateTime, formatNumber } from '../../utils/format.js'
import styles from './MeasurePage.module.css'

// Textos do estado da conexão.
const STATUS_LABEL = {
  idle: 'Desconectado',
  connecting: 'Conectando…',
  listening: 'Escutando a balança',
  error: 'Erro na conexão',
}

// Fases de uma pesagem e seus textos.
const PHASE_LABEL = {
  waiting: 'Aguardando a balança',
  measuring: 'Medindo…',
  final: 'Pesagem concluída',
}

/** Descobre a fase da pesagem pela última leitura recebida. */
function phaseOf(reading) {
  if (!reading) return 'waiting'
  if (reading.final) return 'final'
  return reading.weightKg > 0 ? 'measuring' : 'waiting'
}

/**
 * @param {object} props
 * @param {ReturnType<typeof import('../../hooks/useScale.js').useScale>} props.scale
 * @param {object | null} props.profile
 * @param {() => void} props.onEditProfile
 */
export default function MeasurePage({ scale, profile, onEditProfile }) {
  const { status, error, live, lastFinal, support, connect, disconnect } = scale
  const phase = phaseOf(live)
  // Mostra o peso ao vivo; sem leitura nova, a última pesagem concluída.
  const shown = live ?? lastFinal

  // Composição da última pesagem com o perfil atual.
  const evaluated = useMemo(
    () => (lastFinal && profile ? evaluateWeighing(lastFinal, profile) : null),
    [lastFinal, profile],
  )

  const busy = status === 'connecting' || status === 'listening'

  return (
    <section>
      {/* Mais de uma pessoa usa a balança e o app não tem certeza de quem subiu. */}
      {scale.pending && (
        <AssignWeighing pending={scale.pending} onConfirm={scale.confirmPending} onDismiss={scale.dismissPending} />
      )}

      <div className={ui.card}>
        <h3 className={ui.cardTitle}>Balança</h3>
        <p className={styles.status}>
          Status: <strong>{STATUS_LABEL[status]}</strong>
        </p>

        <div className={ui.actions}>
          <button
            type="button"
            className={`${ui.button} ${ui.buttonPrimary}`}
            onClick={() => connect(SCALE_MODE.BLUETOOTH)}
            disabled={busy || !support.ok}
          >
            Conectar balança
          </button>
          <button
            type="button"
            className={`${ui.button} ${ui.buttonSecondary}`}
            onClick={() => connect(SCALE_MODE.SIMULATOR)}
            disabled={busy}
          >
            Simular pesagem
          </button>
          {busy && (
            <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={disconnect}>
              Parar
            </button>
          )}
        </div>

        {!support.ok && <p className={ui.error}>{support.reason}</p>}
        {error && <p className={ui.error}>{error}</p>}
        <p className={ui.hint}>
          Suba na balança para acordá-la antes de clicar em &quot;Conectar balança&quot; e escolha o aparelho
          sem nome. Para ler a balança, o Chrome/Edge precisa da flag
          chrome://flags/#enable-experimental-web-platform-features ligada.
        </p>
      </div>

      <div className={`${ui.card} ${styles.live}`}>
        <span className={`${styles.phase} ${styles[phase]}`}>{PHASE_LABEL[phase]}</span>
        <p className={styles.weight}>
          {shown ? formatNumber(shown.weightKg, 2) : '--,--'}
          <span className={styles.unit}>kg</span>
        </p>
        {lastFinal && <p className={ui.hint}>Última pesagem: {formatDateTime(lastFinal.timestamp)}</p>}
      </div>

      {lastFinal && !profile && (
        <div className={ui.card}>
          <p>Preencha o perfil (altura, idade e sexo) para ver o IMC e a composição corporal.</p>
          <button type="button" className={`${ui.button} ${ui.buttonPrimary}`} onClick={onEditProfile}>
            Ir para o perfil
          </button>
        </div>
      )}

      {evaluated && (
        <div className={ui.card}>
          <h3 className={ui.cardTitle}>Composição corporal</h3>
          <CompositionTable values={evaluated.values} profile={profile} />
        </div>
      )}
    </section>
  )
}
