// Dieta → Histórico: gráfico dos últimos 14 dias (feitas, fora do plano, sem registro),
// % seguida em 7 e 30 dias e a lista das refeições que não foram feitas corretamente.
import { useMemo } from 'react'
import AdherenceChart from '../../components/AdherenceChart/AdherenceChart.jsx'
import { adherenceTotals, dailyAdherence, offPlanMeals } from '../../diet/adherence.js'
import { useMeasurementRows } from '../../hooks/useMeasurementRows.js'
import { useNow } from '../../hooks/useNow.js'
import ui from '../../styles/controls.module.css'
import { DAY_MS } from '../../utils/date.js'
import { formatDayMonth, formatTime } from '../../utils/format.js'
import styles from './DietPage.module.css'

/** "80% (16 de 20)". */
const pctText = (totals) => (totals.pct == null ? '--' : `${totals.pct}% (${totals.done} de ${totals.planned})`)

/**
 * @param {object} props
 * @param {object} props.plan - plano principal
 * @param {string} props.userId
 */
export default function DietHistory({ plan, userId }) {
  const now = useNow()
  const { rows } = useMeasurementRows(userId)
  const days14 = useMemo(() => dailyAdherence({ plan, rows, days: 14, now }), [plan, rows, now])
  const totals7 = useMemo(() => adherenceTotals(days14.slice(-7)), [days14])
  const totals30 = useMemo(() => adherenceTotals(dailyAdherence({ plan, rows, days: 30, now })), [plan, rows, now])
  const offList = useMemo(() => offPlanMeals({ plan, rows, since: now - 14 * DAY_MS }), [plan, rows, now])

  if (!days14.length) {
    return <p className={ui.card}>Marque as refeições em &quot;Hoje&quot; (Fiz ✓ ou Não fiz corretamente) para ver o histórico.</p>
  }

  return (
    <div>
      <div className={ui.card}>
        <h3 className={ui.cardTitle}>Dieta seguida</h3>
        <div className={styles.historyStats}>
          <div className={styles.historyStat}>
            <span className={ui.hint}>Últimos 7 dias</span>
            <span className={styles.historyValue}>{pctText(totals7)}</span>
            <span className={ui.hint}>
              {totals7.off} fora do plano · {totals7.missing} sem registro
            </span>
          </div>
          <div className={styles.historyStat}>
            <span className={ui.hint}>Últimos 30 dias</span>
            <span className={styles.historyValue}>{pctText(totals30)}</span>
            <span className={ui.hint}>
              {totals30.off} fora do plano · {totals30.missing} sem registro
            </span>
          </div>
        </div>
        <AdherenceChart days={days14} />
        <p className={ui.hint}>Contam só as refeições cujo horário já passou, a partir do primeiro dia marcado.</p>
      </div>

      <div className={ui.card}>
        <h3 className={ui.cardTitle}>Não fiz corretamente (14 dias)</h3>
        {offList.length ? (
          <ul className={styles.offList}>
            {offList.map((item) => (
              <li key={item.at}>
                {formatDayMonth(item.at)} às {formatTime(item.at)} · {item.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className={ui.hint}>Nenhuma refeição fora do plano. 👏</p>
        )}
        <p className={ui.hint}>O cruzamento com o peso fica em Progresso → Relatório.</p>
      </div>
    </div>
  )
}
