// Lembretes: refeições, pesagem e água, e os ajustes do alarme (estilo, som, volume, vibração, luz, adiar).
// No app Android viram notificações (canal "alarme"); com o app aberto, também alarme em tela cheia.
import { playAlarmSound } from '../../reminders/alarmSound.js'
import { ALARM_SOUNDS, waterReminderMinutes } from '../../reminders/reminders.js'
import ui from '../../styles/controls.module.css'
import { formatWater } from '../../water/water.js'
import styles from './RemindersPage.module.css'

// Textos do estado da permissão de notificação.
const PERMISSION_LABEL = {
  granted: 'permitidas',
  denied: 'bloqueadas (libere nas configurações do sistema)',
  default: 'ainda não pedidas',
  prompt: 'ainda não pedidas',
  'prompt-with-rationale': 'ainda não pedidas',
  unknown: 'verificando…',
  unsupported: 'este navegador não mostra notificações',
}
const WATER_INTERVALS = [30, 45, 60, 90, 120, 180]
const GLASSES = [150, 200, 250, 300, 500]
const SNOOZE_OPTIONS = [5, 10, 15, 30]

/**
 * @param {object} props
 * @param {ReturnType<typeof import('../../hooks/useReminders.js').useReminders>} props.reminders
 * @param {object} props.settings - preferências (mealReminders, weighReminder, waterReminder, alarm)
 * @param {(patch: object) => void} props.onChange
 * @param {string | null} props.ownerName - dono do celular (de quem é o plano dos lembretes)
 */
export default function RemindersPage({ reminders, settings, onChange, ownerName }) {
  const { native, status, webPermission } = reminders
  const weigh = settings.weighReminder
  const water = settings.waterReminder
  const alarm = settings.alarm
  const permission = native ? status.permission : webPermission
  const setWater = (patch) => onChange({ waterReminder: { ...water, ...patch } })
  const setAlarm = (patch) => onChange({ alarm: { ...alarm, ...patch } })
  const waterCount = water.enabled ? waterReminderMinutes(water).length : 0

  return (
    <div>
      <div className={ui.card}>
        <h3 className={ui.cardTitle}>Lembretes</h3>
        <p className={styles.status}>
          Notificações: <strong>{PERMISSION_LABEL[permission] ?? permission}</strong>
          {native && permission === 'granted' && ` · ${status.scheduled} lembrete(s) agendado(s) por dia`}
        </p>
        {!native && (
          <p className={ui.hint}>
            No PC, os lembretes tocam enquanto o app estiver aberto (alarme na tela e notificação do Windows). No app
            Android eles chegam mesmo com o app fechado.
          </p>
        )}
        {permission !== 'granted' && permission !== 'unsupported' && (
          <button type="button" className={`${ui.button} ${ui.buttonPrimary}`} onClick={reminders.requestPermission}>
            Permitir notificações
          </button>
        )}
        {status.error && <p className={ui.error}>{status.error}</p>}

        <fieldset className={styles.options}>
          <legend className={ui.label}>O que lembrar</legend>
          <label className={styles.checkbox}>
            <input type="checkbox" checked={settings.mealReminders} onChange={(event) => onChange({ mealReminders: event.target.checked })} />
            Refeições do plano alimentar{ownerName && ` de ${ownerName}`} (no horário de cada refeição, com o que comer)
          </label>

          <label className={styles.checkbox}>
            <input type="checkbox" checked={water.enabled} onChange={(event) => setWater({ enabled: event.target.checked })} />
            Beber água 💧
          </label>
          {water.enabled && (
            <div className={styles.grid}>
              <label className={ui.field}>
                <span className={ui.label}>Das</span>
                <input className={ui.input} type="time" value={water.start} onChange={(event) => setWater({ start: event.target.value })} />
              </label>
              <label className={ui.field}>
                <span className={ui.label}>Até</span>
                <input className={ui.input} type="time" value={water.end} onChange={(event) => setWater({ end: event.target.value })} />
              </label>
              <label className={ui.field}>
                <span className={ui.label}>De quanto em quanto tempo</span>
                <select className={ui.input} value={water.everyMinutes} onChange={(event) => setWater({ everyMinutes: Number(event.target.value) })}>
                  {WATER_INTERVALS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes < 60 ? `${minutes} min` : `${minutes / 60} h`.replace('.5', ',5')}
                    </option>
                  ))}
                </select>
              </label>
              <label className={ui.field}>
                <span className={ui.label}>Copo</span>
                <select className={ui.input} value={water.glassMl} onChange={(event) => setWater({ glassMl: Number(event.target.value) })}>
                  {GLASSES.map((ml) => (
                    <option key={ml} value={ml}>
                      {formatWater(ml)}
                    </option>
                  ))}
                </select>
              </label>
              <p className={`${ui.hint} ${styles.full}`}>{waterCount} lembrete(s) por dia. O botão &quot;Bebi&quot; registra o copo na aba Dieta → Água.</p>
            </div>
          )}

          <label className={styles.checkbox}>
            <input type="checkbox" checked={weigh.enabled} onChange={(event) => onChange({ weighReminder: { ...weigh, enabled: event.target.checked } })} />
            Pesagem diária
          </label>
          {weigh.enabled && (
            <label className={ui.field}>
              <span className={ui.label}>Horário da pesagem</span>
              <input
                className={ui.input}
                type="time"
                value={weigh.time}
                onChange={(event) => onChange({ weighReminder: { ...weigh, time: event.target.value } })}
              />
            </label>
          )}
        </fieldset>
      </div>

      <div className={ui.card}>
        <h3 className={ui.cardTitle}>Alarme</h3>

        <fieldset className={styles.options}>
          <legend className={ui.label}>Como avisar</legend>
          <label className={styles.checkbox}>
            <input type="radio" name="alarm-style" checked={alarm.style === 'alarm'} onChange={() => setAlarm({ style: 'alarm' })} />
            Alarme: aparece por cima da tela, toca e vibra (prioridade máxima)
          </label>
          <label className={styles.checkbox}>
            <input type="radio" name="alarm-style" checked={alarm.style === 'normal'} onChange={() => setAlarm({ style: 'normal' })} />
            Notificação comum (só na barra de notificações)
          </label>
          <label className={styles.checkbox}>
            <input type="checkbox" checked={alarm.inApp} onChange={(event) => setAlarm({ inApp: event.target.checked })} />
            Alarme em tela cheia piscando quando o app estiver aberto
          </label>
        </fieldset>

        <div className={styles.grid}>
          <label className={ui.field}>
            <span className={ui.label}>Som</span>
            <select className={ui.input} value={alarm.sound} onChange={(event) => setAlarm({ sound: event.target.value })}>
              {ALARM_SOUNDS.map((sound) => (
                <option key={sound.id} value={sound.id}>
                  {sound.label}
                </option>
              ))}
            </select>
          </label>
          <label className={ui.field}>
            <span className={ui.label}>Adiar por</span>
            <select className={ui.input} value={alarm.snoozeMinutes} onChange={(event) => setAlarm({ snoozeMinutes: Number(event.target.value) })}>
              {SNOOZE_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} min
                </option>
              ))}
            </select>
          </label>
          <label className={`${ui.field} ${styles.full}`}>
            <span className={ui.label}>Volume (altura do som) do alarme na tela: {alarm.volume}%</span>
            <input type="range" min="0" max="100" step="5" value={alarm.volume} onChange={(event) => setAlarm({ volume: Number(event.target.value) })} />
          </label>
        </div>

        <label className={styles.checkbox}>
          <input type="checkbox" checked={alarm.vibration} onChange={(event) => setAlarm({ vibration: event.target.checked })} />
          Vibrar
        </label>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={alarm.lights} onChange={(event) => setAlarm({ lights: event.target.checked })} />
          Piscar a luz de notificação (nos celulares que têm)
        </label>

        <div className={ui.actions}>
          <button
            type="button"
            className={`${ui.button} ${ui.buttonSecondary}`}
            disabled={alarm.sound === 'silencioso'}
            onClick={() => playAlarmSound(alarm.sound, { volume: alarm.volume, loop: false })}
          >
            Ouvir o som
          </button>
          <button type="button" className={`${ui.button} ${ui.buttonPrimary}`} onClick={reminders.testAlarm}>
            Testar alarme na tela
          </button>
          <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={reminders.testNotification}>
            Testar notificação (chega em 10 s)
          </button>
        </div>
        <p className={ui.hint}>
          Com o app fechado, o som da notificação segue o volume de notificações do celular; o volume acima vale para o
          alarme em tela cheia. Se a notificação não acender a tela com o celular bloqueado, confira em Configurações do
          Android → Notificações → Hub de Saúde as opções de pop-up e de tela de bloqueio.
        </p>
      </div>
    </div>
  )
}
