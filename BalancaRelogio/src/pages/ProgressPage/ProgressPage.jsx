// Aba Progresso: tendência do peso, histórico, medidas corporais e relatório em PDF.
import { useMemo, useState } from 'react'
import SubNav from '../../components/SubNav/SubNav.jsx'
import TrendChart from '../../components/TrendChart/TrendChart.jsx'
import { groupWeighings } from '../../devices/scale/weighings.js'
import { useMeasurementRows } from '../../hooks/useMeasurementRows.js'
import { useNow } from '../../hooks/useNow.js'
import { movingAverage, prepareTrend, weightTrendSummary } from '../../report/trend.js'
import ui from '../../styles/controls.module.css'
import { DAY_MS } from '../../utils/date.js'
import { formatDate, formatNumber } from '../../utils/format.js'
import HistoryPage from '../HistoryPage/HistoryPage.jsx'
import MeasurementsPage from '../MeasurementsPage/MeasurementsPage.jsx'
import ReportPage from '../ReportPage/ReportPage.jsx'
import styles from './ProgressPage.module.css'

const SECTIONS = [
  { id: 'trend', label: 'Tendência' },
  { id: 'history', label: 'Histórico' },
  { id: 'measures', label: 'Medidas' },
  { id: 'report', label: 'Relatório' },
]

// Períodos do gráfico de tendência (dias; null = tudo).
const PERIODS = [
  { id: '30', label: '30 dias', days: 30 },
  { id: '90', label: '3 meses', days: 90 },
  { id: '365', label: '1 ano', days: 365 },
  { id: 'all', label: 'Tudo', days: null },
]

/** Gráfico de tendência com ritmo semanal e projeção da meta. */
function TrendView({ user }) {
  const now = useNow()
  const [periodId, setPeriodId] = useState('90')
  const { rows } = useMeasurementRows(user.userId)
  const weighings = useMemo(() => groupWeighings(rows), [rows])
  const period = PERIODS.find((p) => p.id === periodId)
  const targetKg = user.goals?.targetWeightKg ?? null

  // Um ponto por dia (sem as pesagens fora da curva) e a média móvel, cortados no período escolhido.
  const { series, outliers } = useMemo(() => {
    const { daily, outliers: allOutliers } = prepareTrend(weighings)
    const inPeriod = (point) => !period.days || now - point.timestamp <= period.days * DAY_MS
    return { series: movingAverage(daily).filter(inPeriod), outliers: allOutliers.filter(inPeriod) }
  }, [weighings, period, now])
  const summary = useMemo(
    () => weightTrendSummary(weighings, { targetKg, periodDays: period.days ?? 36500, now }),
    [weighings, targetKg, period, now],
  )

  if (!weighings.length) return <p className={ui.card}>Faça a primeira pesagem para ver a tendência.</p>

  return (
    <div>
      <SubNav items={PERIODS} current={periodId} onChange={setPeriodId} label="Período do gráfico" />
      <div className={ui.card}>
        <TrendChart series={series} outliers={outliers} targetKg={targetKg} />
        <p className={ui.hint}>
          Pontos: peso do dia (mediana das pesagens do dia) · linha: média de 7 dias (mostra a direção real, sem a
          oscilação diária).
          {outliers.length > 0 &&
            ` Círculos vazados: ${outliers.length} pesagem(ns) fora da curva, ignorada(s). Se foi engano, apague em Histórico.`}
        </p>
      </div>
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Média de 7 dias</span>
          <span className={styles.statValue}>{formatNumber(summary.average7, 2)} kg</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Ritmo</span>
          <span className={styles.statValue}>
            {summary.ratePerWeek == null ? '--' : `${summary.ratePerWeek > 0 ? '+' : ''}${formatNumber(summary.ratePerWeek, 2)} kg/sem`}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>No período</span>
          <span className={styles.statValue}>
            {summary.changeInPeriod == null ? '--' : `${summary.changeInPeriod > 0 ? '+' : ''}${formatNumber(summary.changeInPeriod, 2)} kg`}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Meta</span>
          <span className={styles.statValue}>
            {targetKg == null
              ? '--'
              : summary.projection.reachable
                ? summary.projection.weeks === 0
                  ? 'alcançada'
                  : formatDate(summary.projection.dateMs)
                : 'fora do ritmo'}
          </span>
        </div>
      </div>
      {summary.ratePerWeek == null && (
        <p className={ui.hint}>O ritmo aparece com pelo menos 3 pesagens cobrindo 7 dias.</p>
      )}
    </div>
  )
}

/**
 * @param {object} props
 * @param {object} props.user - usuário atual
 * @param {() => void} props.onEditProfile
 */
export default function ProgressPage({ user, onEditProfile }) {
  const [section, setSection] = useState('trend')

  return (
    <section>
      <h2 className={ui.pageTitle}>Progresso</h2>
      <SubNav items={SECTIONS} current={section} onChange={setSection} label="Seções do progresso" />
      {section === 'trend' && <TrendView user={user} />}
      {section === 'history' && <HistoryPage profile={user} />}
      {section === 'measures' && <MeasurementsPage user={user} />}
      {section === 'report' && <ReportPage profile={user} onEditProfile={onEditProfile} />}
    </section>
  )
}
