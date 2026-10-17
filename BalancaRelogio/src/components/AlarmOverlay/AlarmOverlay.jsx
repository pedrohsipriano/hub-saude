// Alarme em tela cheia (app aberto): a tela pisca, toca o som no volume escolhido e vibra até a pessoa
// responder. Os botões mudam com o tipo de lembrete (água, refeição, pesagem).
import { useEffect } from 'react'
import { useClock } from '../../hooks/useClock.js'
import { playAlarmSound } from '../../reminders/alarmSound.js'
import { formatTime } from '../../utils/format.js'
import { formatWater } from '../../water/water.js'
import styles from './AlarmOverlay.module.css'

// Ícone e cor de cada tipo.
const KIND_VIEW = {
  water: { icon: '💧', className: styles.water },
  meal: { icon: '🍽️', className: styles.meal },
  weigh: { icon: '⚖️', className: styles.weigh },
}
// Vibração: 3 pulsos, repetidos a cada 2,5 s.
const VIBRATION = [400, 200, 400, 200, 400]

/**
 * @param {object} props
 * @param {{ kind: string, title: string, body: string }} props.alarm
 * @param {object} props.settings - ajustes do alarme (som, volume, vibração, adiar)
 * @param {number} props.glassMl - tamanho do copo (botão "Bebi")
 * @param {(actionId: string) => void} props.onResolve
 */
export default function AlarmOverlay({ alarm, settings, glassMl, onResolve }) {
  const now = useClock(true, 15000)
  const view = KIND_VIEW[alarm.kind] ?? KIND_VIEW.water

  // Som e vibração enquanto o alarme está na tela.
  useEffect(() => {
    const stopSound = settings.sound === 'silencioso' ? () => {} : playAlarmSound(settings.sound, { volume: settings.volume })
    let vibrationTimer = null
    if (settings.vibration && navigator.vibrate) {
      navigator.vibrate(VIBRATION)
      vibrationTimer = setInterval(() => navigator.vibrate(VIBRATION), 2500)
    }
    return () => {
      stopSound()
      clearInterval(vibrationTimer)
      navigator.vibrate?.(0)
    }
  }, [settings.sound, settings.volume, settings.vibration])

  return (
    <div className={`${styles.overlay} ${view.className}`} role="alertdialog" aria-modal="true" aria-labelledby="alarm-title">
      <div className={styles.panel}>
        <span className={styles.icon} aria-hidden="true">
          {view.icon}
        </span>
        <p className={styles.clock}>{formatTime(now)}</p>
        <h2 id="alarm-title" className={styles.title}>
          {alarm.title}
        </h2>
        <p className={styles.body}>{alarm.body}</p>

        <div className={styles.actions}>
          {alarm.kind === 'water' && (
            <button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => onResolve('drink')}>
              Bebi {formatWater(glassMl)}
            </button>
          )}
          {alarm.kind === 'meal' && (
            <>
              <button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => onResolve('done')}>
                Fiz ✓
              </button>
              <button type="button" className={styles.button} onClick={() => onResolve('off')}>
                Não fiz corretamente
              </button>
            </>
          )}
          <button type="button" className={styles.button} onClick={() => onResolve('snooze')}>
            Adiar {settings.snoozeMinutes} min
          </button>
          <button type="button" className={styles.button} onClick={() => onResolve('dismiss')}>
            Dispensar
          </button>
        </div>
      </div>
    </div>
  )
}
