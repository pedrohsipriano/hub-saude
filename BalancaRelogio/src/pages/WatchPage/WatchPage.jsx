// Página do relógio: conexão, valores de agora, gráficos do dia, sono e envio do peso.
import { useMemo } from 'react'
import LineChart from '../../components/LineChart/LineChart.jsx'
import { WATCH_MODE } from '../../hooks/useWatch.js'
import { useWeighings } from '../../hooks/useWeighings.js'
import { slotTimestamp, startOfLocalDay } from '../../devices/watch/watchMeasurements.js'
import ui from '../../styles/controls.module.css'
import { formatDateTime, formatMinutes, formatNumber, formatTime } from '../../utils/format.js'
import ConnectionLogCard from './ConnectionLogCard.jsx'
import PhoneBluetoothCard from './PhoneBluetoothCard.jsx'
import SleepProbeCard from './SleepProbeCard.jsx'
import WatchNotificationsCard from './WatchNotificationsCard.jsx'
import { APP_VERSION_LABEL } from '../../appVersion.js'
import styles from './WatchPage.module.css'

// Textos do estado da conexão.
const STATUS_LABEL = {
  idle: 'Desconectado',
  connecting: 'Conectando…',
  connected: 'Conectado',
  syncing: 'Sincronizando…',
  reconnecting: 'Procurando o relógio… (reconecta sozinho)',
  'bluetooth-off': 'Bluetooth desligado (reconecta ao ligar)',
  'no-permission': 'Sem permissão de Bluetooth',
  error: 'Erro na conexão',
}

/** Converte as 48 posições do dia em pontos de gráfico (só as que têm medição). */
function slotsToPoints(slots, syncedAt) {
  if (!slots) return []
  const dayStart = startOfLocalDay(syncedAt)
  return slots
    .map((value, index) => ({ timestamp: slotTimestamp(dayStart, index), value }))
    .filter((point) => point.value > 0)
}

/**
 * @param {object} props
 * @param {ReturnType<typeof import('../../hooks/useWatch.js').useWatch>} props.watch
 */
export default function WatchPage({ watch, owner, users, onOwnerChange }) {
  const { status, error, deviceName, data, battery, liveSteps, liveHeartRate, autoWeight, weightMessage } = watch
  // As pesagens do dono do relógio são as que vão para o perfil dele.
  const { weighings } = useWeighings(owner?.userId)
  const lastWeighing = weighings.at(-1)

  const connected = status === 'connected' || status === 'syncing'
  const busy = status === 'connecting' || status === 'syncing'
  // Serviço nativo tentando reconectar (relógio longe, desligado ou Bluetooth desligado).
  const waiting = ['reconnecting', 'bluetooth-off', 'no-permission'].includes(status)
  const remembered = watch.remembered
  const summary = data?.summary

  // Pontos dos gráficos do dia.
  const heartRatePoints = useMemo(() => slotsToPoints(data?.heartRate, data?.syncedAt), [data])
  const spo2Points = useMemo(() => slotsToPoints(data?.spo2, data?.syncedAt), [data])

  // Pressão mais recente do dia.
  const lastPressure = useMemo(() => {
    const index = data?.bloodPressure?.findLastIndex((slot) => slot.systolic > 0) ?? -1
    return index >= 0 ? data.bloodPressure[index] : null
  }, [data])

  // Cartões de "agora".
  const tiles = [
    ['Bateria', battery ? `${battery.percent} %` : '--'],
    ['Passos hoje', formatNumber(liveSteps ?? summary?.steps, 0)],
    ['FC', summary?.heartRate ? `${summary.heartRate} bpm` : '--'],
    ['SpO2', summary?.spo2 ? `${summary.spo2} %` : '--'],
    [
      'Pressão',
      summary?.systolic ? `${summary.systolic}/${summary.diastolic}` : lastPressure ? `${lastPressure.systolic}/${lastPressure.diastolic}` : '--',
    ],
    ['FC do ECG', liveHeartRate ? `${liveHeartRate.heartRate} bpm` : summary?.ecgHeartRate ? `${summary.ecgHeartRate} bpm` : '--'],
  ]

  return (
    <section>
      {/* Com mais de uma pessoa, escolhe de quem é o relógio. */}
      {users.length > 1 && (
        <label className={`${ui.field} ${styles.owner}`}>
          <span className={ui.label}>Dono do relógio</span>
          <select className={ui.input} value={owner?.userId ?? ''} onChange={(event) => onOwnerChange(event.target.value)}>
            {users.map((user) => (
              <option key={user.userId} value={user.userId}>
                {user.name || 'Sem nome'}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Conexão */}
      <div className={ui.card}>
        <h3 className={ui.cardTitle}>{deviceName ?? 'WATCH X PRO'}</h3>
        <p className={styles.status}>
          Status: <strong>{STATUS_LABEL[status]}</strong>
          {data?.firmware && ` · firmware ${data.firmware}`}
          {data?.syncedAt && ` · sincronizado em ${formatDateTime(data.syncedAt)}`}
        </p>
        <div className={ui.actions}>
          {!connected && !waiting && (
            <>
              <button
                type="button"
                className={`${ui.button} ${ui.buttonPrimary}`}
                onClick={() => watch.connect(WATCH_MODE.BLUETOOTH)}
                disabled={busy}
              >
                {remembered ? `Conectar ao ${remembered.name ?? 'relógio'}` : 'Conectar relógio'}
              </button>
              <button
                type="button"
                className={`${ui.button} ${ui.buttonSecondary}`}
                onClick={() => watch.connect(WATCH_MODE.SIMULATOR)}
                disabled={busy}
              >
                Simular relógio
              </button>
            </>
          )}
          {connected && (
            <button type="button" className={`${ui.button} ${ui.buttonPrimary}`} onClick={watch.sync} disabled={busy}>
              Sincronizar
            </button>
          )}
          {(connected || waiting) && (
            <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={watch.disconnect}>
              Desconectar
            </button>
          )}
          {remembered && !busy && (
            <>
              <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={() => watch.connect(WATCH_MODE.BLUETOOTH, { chooseNew: true })}>
                Trocar de relógio
              </button>
              <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={watch.forgetWatch}>
                Esquecer relógio
              </button>
            </>
          )}
        </div>
        {error && <p className={ui.error}>{error}</p>}
        <p className={ui.hint}>
          Para a conexão mais estável: pareie o relógio no Bluetooth do celular (cartão &quot;Bluetooth do celular&quot;, abaixo) e
          feche o MActivePro — o relógio aceita um app por vez. No app Android a conexão continua com o app fechado.
        </p>
        <p className={ui.hint}>App {APP_VERSION_LABEL}</p>
      </div>

      {/* Valores de agora */}
      <div className={styles.tiles}>
        {tiles.map(([label, value]) => (
          <div key={label} className={styles.tile}>
            <span className={styles.tileLabel}>{label}</span>
            <span className={styles.tileValue}>{value}</span>
          </div>
        ))}
      </div>

      {/* Gráficos do dia */}
      {data && (
        <div className={styles.charts}>
          <div className={ui.card}>
            <h3 className={ui.cardTitle}>FC hoje (bpm)</h3>
            {heartRatePoints.length ? (
              <LineChart points={heartRatePoints} decimals={0} label="FC" formatLabel={formatTime} showValues={false} labelEvery={6} />
            ) : (
              <p className={ui.hint}>Sem medições hoje.</p>
            )}
          </div>
          <div className={ui.card}>
            <h3 className={ui.cardTitle}>SpO2 hoje (%)</h3>
            {spo2Points.length ? (
              <LineChart points={spo2Points} decimals={0} label="SpO2" formatLabel={formatTime} showValues={false} labelEvery={6} />
            ) : (
              <p className={ui.hint}>Sem medições hoje.</p>
            )}
          </div>
        </div>
      )}

      {/* Sono */}
      {data && (
        <div className={ui.card}>
          <h3 className={ui.cardTitle}>Sono</h3>
          {data.sleep ? (
            <p className={styles.sleep}>
              {formatTime(data.sleep.startMs)} → {formatTime(data.sleep.endMs)} · dormiu{' '}
              <strong>{formatMinutes(data.sleep.asleepMinutes)}</strong> (profundo {formatMinutes(data.sleep.deepMinutes)},
              leve {formatMinutes(data.sleep.lightMinutes)}, acordado {formatMinutes(data.sleep.awakeMinutes)})
            </p>
          ) : (
            <p className={ui.hint}>
              O relógio não tem sono registrado. Durma com ele e sincronize de manhã. O formato do sono vem do SDK
              da NJJ e será conferido na primeira noite.
            </p>
          )}
        </div>
      )}

      {/* Notificações do celular no relógio e funcionamento com o app fechado */}
      <WatchNotificationsCard watch={watch} connected={connected} />

      {/* Pareamento e ligação pelo Bluetooth do celular */}
      <PhoneBluetoothCard watch={watch} />

      {/* Diagnóstico da conexão (por que o relógio caiu) */}
      <ConnectionLogCard />

      {/* Teste do sono e dos treinos (descobrir o parâmetro do comando 4F com uma noite real) */}
      <SleepProbeCard watch={watch} connected={connected} />

      {/* Integração com a balança */}
      <div className={ui.card}>
        <h3 className={ui.cardTitle}>Peso no relógio</h3>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={autoWeight} onChange={(event) => watch.setAutoWeight(event.target.checked)} />
          Enviar o peso ao relógio depois de cada pesagem (o relógio usa o peso nas calorias e na passada)
        </label>
        <div className={ui.actions}>
          <button
            type="button"
            className={`${ui.button} ${ui.buttonSecondary}`}
            onClick={() => watch.sendWeight(lastWeighing.weightKg)}
            disabled={!connected || !lastWeighing}
          >
            Enviar peso da última pesagem{lastWeighing && ` (${formatNumber(lastWeighing.weightKg, 2)} kg)`}
          </button>
        </div>
        {weightMessage && <p className={ui.hint}>{weightMessage}</p>}
      </div>
    </section>
  )
}
