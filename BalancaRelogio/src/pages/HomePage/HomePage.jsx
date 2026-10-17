// Tela inicial: o resumo do dia em cartões — peso (tendência e meta), atividade de hoje,
// próxima refeição, resumo da semana e avisos.
import { useMemo } from 'react'
import AssignWeighing from '../../components/AssignWeighing/AssignWeighing.jsx'
import ProgressBar from '../../components/ProgressBar/ProgressBar.jsx'
import WaterQuickAdd from '../../components/WaterQuickAdd/WaterQuickAdd.jsx'
import { nextMeal } from '../../diet/dietPlan.js'
import { groupWeighings } from '../../devices/scale/weighings.js'
import { WATCH_DEVICE, startOfLocalDay } from '../../devices/watch/watchMeasurements.js'
import { useDiet } from '../../hooks/useDiet.js'
import { useMeasurementRows } from '../../hooks/useMeasurementRows.js'
import { useNow } from '../../hooks/useNow.js'
import { useWater } from '../../hooks/useWater.js'
import { healthAlerts, weeklySummary } from '../../report/insights.js'
import { weightTrendSummary } from '../../report/trend.js'
import ui from '../../styles/controls.module.css'
import { formatDate, formatMinutes, formatNumber, formatTime } from '../../utils/format.js'
import { WORKOUT_DEVICE } from '../../workouts/recording.js'
import styles from './HomePage.module.css'

const HOUR_MS = 60 * 60 * 1000

/** Valor de hoje de uma métrica de atividade (relógio primeiro, depois Health Connect). */
function todayValue(rows, metric, dayStart) {
  const candidates = rows.filter((row) => row.metric === metric && row.timestamp === dayStart)
  return (candidates.find((row) => row.device === WATCH_DEVICE) ?? candidates[0])?.value ?? null
}

/**
 * @param {object} props
 * @param {object} props.user - usuário atual
 * @param {object} props.scale - hook da balança (pesagem pendente)
 * @param {object} props.watch - hook do relógio (passos ao vivo)
 * @param {boolean} props.isWatchOwner - o usuário atual é o dono do relógio
 * @param {(tab: string) => void} props.onNavigate
 */
export default function HomePage({ user, scale, watch, isWatchOwner, onNavigate }) {
  const now = useNow()
  const { rows } = useMeasurementRows(user.userId)
  const diet = useDiet(user.userId)
  const water = useWater(user)
  const goals = user.goals ?? {}

  const weighings = useMemo(() => groupWeighings(rows), [rows])
  const trend = useMemo(
    () => weightTrendSummary(weighings, { targetKg: goals.targetWeightKg ?? null, now }),
    [weighings, goals.targetWeightKg, now],
  )
  const summary = useMemo(() => weeklySummary({ weighings, rows, plan: diet.plan, now }), [weighings, rows, diet.plan, now])
  const alerts = useMemo(() => healthAlerts({ rows, now }), [rows, now])

  // Atividade de hoje: passos (ao vivo se o relógio estiver conectado), sono da noite e FC de repouso.
  const dayStart = startOfLocalDay(now)
  const steps = (isWatchOwner ? watch.liveSteps : null) ?? todayValue(rows, 'steps', dayStart)
  const lastSleep = rows
    .filter((row) => row.metric === 'sleepMinutes' && now - row.timestamp <= 18 * HOUR_MS)
    .sort((a, b) => b.timestamp - a.timestamp)[0]
  const recentHr = rows.filter((row) => row.metric === 'heartRate' && row.value > 0 && now - row.timestamp <= 24 * HOUR_MS)
  const restingHr = recentHr.length ? Math.min(...recentHr.map((row) => row.value)) : null
  // Minutos de treino gravados hoje (aba Treino).
  const workoutSeconds = rows
    .filter((row) => row.device === WORKOUT_DEVICE && row.metric === 'workoutDuration' && row.timestamp >= dayStart)
    .reduce((sum, row) => sum + row.value, 0)

  // Próxima refeição do plano.
  const upcoming = diet.plan ? nextMeal(diet.plan, now, diet.doneIds) : null
  const isMealTime = upcoming && Math.abs(upcoming.at - now) <= 30 * 60 * 1000

  // Ritmo semanal em texto ("−0,45 kg/semana").
  const rateText = trend?.ratePerWeek != null ? `${trend.ratePerWeek > 0 ? '+' : ''}${formatNumber(trend.ratePerWeek, 2)} kg/semana` : null

  return (
    <section>
      <p className={styles.greeting}>
        Olá{user.name ? `, ${user.name.split(' ')[0]}` : ''}! <span className={styles.date}>{formatDate(now)}</span>
      </p>

      {scale.pending && (
        <AssignWeighing pending={scale.pending} onConfirm={scale.confirmPending} onDismiss={scale.dismissPending} />
      )}

      {/* Peso */}
      <div className={ui.card}>
        <div className={styles.cardHeader}>
          <h3 className={ui.cardTitle}>Peso</h3>
          <button type="button" className={styles.link} onClick={() => onNavigate('progress')}>
            Ver tendência
          </button>
        </div>
        {trend ? (
          <>
            <p className={styles.bigNumber}>
              {formatNumber(trend.latest.weightKg, 2)} <span className={styles.unit}>kg</span>
            </p>
            <p className={styles.muted}>
              Média de 7 dias: {formatNumber(trend.average7, 2)} kg{rateText && ` · ${rateText}`}
            </p>
            {goals.targetWeightKg && (
              <p className={styles.muted}>
                Meta: {formatNumber(goals.targetWeightKg, 1)} kg ·{' '}
                {trend.projection.reachable
                  ? trend.projection.weeks === 0
                    ? 'meta alcançada!'
                    : `no ritmo atual, por volta de ${formatDate(trend.projection.dateMs)}`
                  : 'o ritmo atual não leva à meta'}
              </p>
            )}
          </>
        ) : (
          <div>
            <p className={styles.muted}>Nenhuma pesagem ainda.</p>
            <button type="button" className={`${ui.button} ${ui.buttonPrimary}`} onClick={() => onNavigate('devices')}>
              Pesar agora
            </button>
          </div>
        )}
      </div>

      {/* Hoje */}
      <div className={ui.card}>
        <h3 className={ui.cardTitle}>Hoje</h3>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Passos</span>
            <span className={styles.statValue}>{formatNumber(steps, 0)}</span>
            {goals.dailySteps && steps != null && (
              <ProgressBar value={steps} max={goals.dailySteps} label={`Passos: ${steps} de ${goals.dailySteps}`} />
            )}
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Sono</span>
            <span className={styles.statValue}>{lastSleep ? formatMinutes(lastSleep.value) : '--'}</span>
            {goals.sleepHours && lastSleep && (
              <ProgressBar value={lastSleep.value} max={goals.sleepHours * 60} label="Sono em relação à meta" />
            )}
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>FC de repouso</span>
            <span className={styles.statValue}>{restingHr ? `${restingHr} bpm` : '--'}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Treino</span>
            <span className={styles.statValue}>{workoutSeconds ? formatMinutes(Math.round(workoutSeconds / 60)) : '--'}</span>
            {!workoutSeconds && (
              <button type="button" className={styles.link} onClick={() => onNavigate('workout')}>
                Começar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Água de hoje */}
      <div className={ui.card}>
        <div className={styles.cardHeader}>
          <h3 className={ui.cardTitle}>Água</h3>
          <button type="button" className={styles.link} onClick={() => onNavigate('diet')}>
            Detalhes
          </button>
        </div>
        <WaterQuickAdd water={water} />
      </div>

      {/* Próxima refeição */}
      <div className={`${ui.card} ${isMealTime ? styles.mealTime : ''}`}>
        <div className={styles.cardHeader}>
          <h3 className={ui.cardTitle}>{isMealTime ? 'Está na hora!' : 'Próxima refeição'}</h3>
          <button type="button" className={styles.link} onClick={() => onNavigate('diet')}>
            Dieta
          </button>
        </div>
        {upcoming ? (
          <>
            <p className={styles.mealName}>
              {formatTime(upcoming.at)} · {upcoming.meal.name}
            </p>
            <ul className={styles.mealItems}>
              {upcoming.meal.options[0].items.slice(0, 5).map((item) => (
                <li key={item.main}>{item.main}</li>
              ))}
            </ul>
            {upcoming.meal.reminderText && <p className={styles.muted}>{upcoming.meal.reminderText}</p>}
            <div className={ui.actions}>
              <button type="button" className={`${ui.button} ${ui.buttonPrimary}`} onClick={() => diet.setMealStatus(upcoming, 'done')}>
                Fiz ✓
              </button>
              <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={() => diet.setMealStatus(upcoming, 'off')}>
                Não fiz corretamente
              </button>
            </div>
          </>
        ) : (
          <p className={styles.muted}>Cadastre o seu plano alimentar na aba Dieta.</p>
        )}
      </div>

      {/* Semana */}
      {summary.length > 0 && (
        <div className={ui.card}>
          <h3 className={ui.cardTitle}>Sua semana</h3>
          <ul className={styles.list}>
            {summary.map((sentence) => (
              <li key={sentence}>{sentence}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Avisos */}
      {alerts.length > 0 && (
        <div className={ui.card}>
          <h3 className={ui.cardTitle}>Avisos</h3>
          <ul className={styles.list}>
            {alerts.map((alert) => (
              <li key={alert.text} className={alert.level === 'attention' ? styles.attention : undefined}>
                {alert.text}
              </li>
            ))}
          </ul>
          <p className={ui.hint}>Informação a partir dos seus dados, não é diagnóstico.</p>
        </div>
      )}
    </section>
  )
}
