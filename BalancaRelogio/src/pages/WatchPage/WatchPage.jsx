// Página do relógio: conexão, valores de agora, gráficos do dia, sono e envio do peso.
import { useMemo } from 'react'
import LineChart from '../../components/LineChart/LineChart.jsx'
import { WATCH_MODE } from '../../hooks/useWatch.js'
import { useWeighings } from '../../hooks/useWeighings.js'
import { useMeasurementRows } from '../../hooks/useMeasurementRows.js'
import { averageSleep, sleepByDay, sleepNights } from '../../report/sleep.js'
import SleepChart from '../../components/SleepChart/SleepChart.jsx'
import SleepStagesChart from '../../components/SleepChart/SleepStagesChart.jsx'
import { expandNight } from '../../devices/watch/sleepBackup.js'
import { useNow } from '../../hooks/useNow.js'
import { slotTimestamp, startOfLocalDay } from '../../devices/watch/watchMeasurements.js'
import ui from '../../styles/controls.module.css'
import { formatDateTime, formatDayMonth, formatMinutes, formatNumber, formatTime } from '../../utils/format.js'
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
  // Sono salvo no banco (a última sincronização pode já não trazer a noite): últimas 7 noites, relógio na frente.
  const { rows } = useMeasurementRows(owner?.userId)
  const nights = useMemo(() => sleepNights(rows).slice(-7).reverse(), [rows])
  const lastNight = nights[0] ?? null
  // Gráfico: últimas 14 noites, com a meta de sono do dono do relógio.
  const now = useNow()
  const chartDays = useMemo(() => sleepByDay(rows, now, 14), [rows, now])
  const sleepGoal = owner?.goals?.sleepHours ? owner.goals.sleepHours * 60 : null
  // Fases da última noite (só as noites do relógio têm as fases, guardadas na cópia local).
  const lastNightStages = useMemo(() => {
    const saved = lastNight && watch.sleepBackup?.find((night) => night.endMs === lastNight.endMs)
    return saved ? expandNight(saved) : null
  }, [lastNight, watch.sleepBackup])

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

      {/* Sono: a última noite salva e as anteriores (relógio na frente do que veio do Health Connect). */}
      <div className={ui.card}>
        <h3 className={ui.cardTitle}>Sono</h3>
        {lastNight ? (
          <>
            <p className={styles.sleep}>
              {formatDayMonth(lastNight.endMs)} · {lastNight.startMs ? `${formatTime(lastNight.startMs)} → ` : 'acordou às '}
              {formatTime(lastNight.endMs)} · dormiu <strong>{formatMinutes(lastNight.asleepMinutes)}</strong>
              {lastNight.deepMinutes != null &&
                ` (profundo ${formatMinutes(lastNight.deepMinutes)}, leve ${formatMinutes(lastNight.lightMinutes)}, acordado ${formatMinutes(lastNight.awakeMinutes)})`}
            </p>
            {!lastNight.fromWatch && <p className={ui.hint}>Veio do Health Connect (outro app), não do relógio.</p>}
            {lastNightStages && <SleepStagesChart night={lastNightStages} />}
            <SleepChart days={chartDays} goalMinutes={sleepGoal} averageMinutes={averageSleep(chartDays)} />
            {nights.length > 1 && (
              <ul className={styles.sleepList}>
                {nights.slice(1).map((night) => (
                  <li key={night.endMs}>
                    {formatDayMonth(night.endMs)}: <strong>{formatMinutes(night.asleepMinutes)}</strong>
                    {night.deepMinutes != null && ` · profundo ${formatMinutes(night.deepMinutes)}`}
                    {!night.fromWatch && ' · Health Connect'}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className={ui.hint}>Nenhuma noite salva ainda. Durma com o relógio; o sono vem na sincronização da manhã.</p>
        )}
      </div>

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
