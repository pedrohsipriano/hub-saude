// Página do Relatório de Progresso. O botão "Gerar PDF" abre a impressão do sistema (destino "Salvar como PDF"):
// no navegador, window.print(); no app Android, o PrintManager nativo (native/printPage.js).
// O CSS de impressão esconde o menu e deixa só o relatório.
import { useMemo, useState } from 'react'
import ReportSection from '../../components/ReportSection/ReportSection.jsx'
import SubNav from '../../components/SubNav/SubNav.jsx'
import { useNow } from '../../hooks/useNow.js'
import { groupMeasurements } from '../../report/bodyMeasurements.js'
import { DAY_MS } from '../../utils/date.js'
import { SEX_MALE } from '../../devices/scale/bodyComposition.js'
import { groupWeighings } from '../../devices/scale/weighings.js'
import { useDiet } from '../../hooks/useDiet.js'
import { useMeasurementRows } from '../../hooks/useMeasurementRows.js'
import { printPage } from '../../native/printPage.js'
import { buildProgressReport, reportFileName } from '../../report/buildProgressReport.js'
import { buildCrossRows, hasWatchData } from '../../report/crossMetrics.js'
import { GOOD_DIET_PCT, GOOD_TRAINING_MIN, weeklyFindings, weeklyRows } from '../../report/weeklyCross.js'
import ui from '../../styles/controls.module.css'
import { formatDateTime, formatDayMonth, formatMinutes, formatNumber } from '../../utils/format.js'
import styles from './ReportPage.module.css'

// Períodos do relatório (dias; null = tudo).
const REPORT_PERIODS = [
  { id: '30', label: '30 dias', days: 30 },
  { id: '90', label: '3 meses', days: 90 },
  { id: '180', label: '6 meses', days: 180 },
  { id: 'all', label: 'Tudo', days: null },
]

/**
 * @param {object} props
 * @param {object | null} props.profile
 * @param {() => void} props.onEditProfile
 */
export default function ReportPage({ profile, onEditProfile }) {
  const now = useNow()
  const [periodId, setPeriodId] = useState('all')
  const [printError, setPrintError] = useState(null) // falha ao abrir a impressão
  const period = REPORT_PERIODS.find((p) => p.id === periodId)
  // Início do período (null = todas as pesagens).
  const since = period.days ? now - period.days * DAY_MS : null

  // Todas as linhas do usuário: pesagens da balança, relógio, medidas.
  const { rows, loading } = useMeasurementRows(profile?.userId)
  const weighings = useMemo(() => groupWeighings(rows), [rows])
  const report = useMemo(
    () =>
      profile ? buildProgressReport({ profile, weighings, since, historySize: period.days && period.days <= 30 ? 4 : 6 }) : null,
    [profile, weighings, since, period.days],
  )
  // Medida corporal mais recente (cintura, quadril, RCQ).
  const latestMeasures = useMemo(() => groupMeasurements(rows)[0] ?? null, [rows])
  // Plano alimentar principal (para a dieta seguida).
  const { plan } = useDiet(profile?.userId ?? null)
  // Cruzamentos: cada pesagem com passos, sono e FC de repouso do relógio, treino e dieta da véspera.
  const crossRows = useMemo(() => buildCrossRows({ weighings, rows, plan, now }), [weighings, rows, plan, now])
  // Por semana: peso médio e variação × dieta × treinos × passos, e as conclusões.
  const weeks = useMemo(() => weeklyRows({ weighings, rows, plan, weeks: 8, now }), [weighings, rows, plan, now])
  const findings = useMemo(() => weeklyFindings(weeks), [weeks])

  if (!profile) {
    return (
      <section className={ui.card}>
        <p>Preencha o perfil para gerar o relatório.</p>
        <button type="button" className={`${ui.button} ${ui.buttonPrimary}`} onClick={onEditProfile}>
          Ir para o perfil
        </button>
      </section>
    )
  }
  if (loading) return <p>Carregando…</p>

  // Seletor de período (some no PDF).
  const periodPicker = <SubNav items={REPORT_PERIODS} current={periodId} onChange={setPeriodId} label="Período do relatório" />

  if (!report) {
    return (
      <section>
        {periodPicker}
        <p className={ui.card}>
          {weighings.length ? 'Nenhuma pesagem neste período.' : 'Nenhuma pesagem salva ainda. Faça uma pesagem na aba Aparelhos.'}
        </p>
      </section>
    )
  }

  /** Abre a impressão com o nome do arquivo no padrão NOMERelatorioProgressoDDMMAAAA. */
  const handlePrint = () => {
    setPrintError(null)
    printPage(reportFileName(profile.name || 'Usuario', report.latest.timestamp)).catch((error) =>
      setPrintError(`Não foi possível abrir a impressão: ${error.message}`),
    )
  }

  const values = report.latest.values

  // Resumo no topo, como o bloco "Dados do paciente" do relatório de referência.
  const summary = [
    ['Nome', profile.name || '—'],
    ['Idade', `${profile.age} anos`],
    ['Sexo', profile.sex === SEX_MALE ? 'Masculino' : 'Feminino'],
    ['Altura', `${formatNumber(profile.heightCm / 100, 2)} m`],
    ['Peso', `${formatNumber(values.weightKg, 2)} kg`],
    ['Data', formatDateTime(report.latest.timestamp)],
    ['Massa gorda', values.fatMassKg != null ? `${formatNumber(values.fatMassKg, 2)} kg` : '—'],
    ['Massa livre de gordura', values.leanMassKg != null ? `${formatNumber(values.leanMassKg, 2)} kg` : '—'],
    ['Massa óssea', values.boneMassKg != null ? `${formatNumber(values.boneMassKg, 2)} kg` : '—'],
    ['Músculo esquelético', values.skeletalMuscleKg != null ? `${formatNumber(values.skeletalMuscleKg, 2)} kg` : '—'],
    ['Taxa metabólica basal', values.bmrKcal != null ? `${formatNumber(values.bmrKcal, 0)} kcal` : '—'],
    ['Idade metabólica', values.metabolicAge ? `${values.metabolicAge} anos` : '—'],
    // Medidas com fita métrica (a mais recente), quando houver.
    ...(latestMeasures?.waistCm ? [['Cintura', `${formatNumber(latestMeasures.waistCm, 1)} cm`]] : []),
    ...(latestMeasures?.hipCm ? [['Quadril', `${formatNumber(latestMeasures.hipCm, 1)} cm`]] : []),
    ...(latestMeasures?.whr ? [['Relação cintura-quadril', formatNumber(latestMeasures.whr, 2)]] : []),
    [
      'Período',
      `${period.days ? `últimos ${period.label.toLowerCase()}` : 'todas as pesagens'} (${report.count} pesage${report.count > 1 ? 'ns' : 'm'})`,
    ],
    ['Balança', 'Original Line (OKOK)'],
  ]

  return (
    <section>
      {periodPicker}
      <div className={styles.toolbar}>
        <button type="button" className={`${ui.button} ${ui.buttonPrimary}`} onClick={handlePrint}>
          Gerar PDF
        </button>
        <p className={ui.hint}>Na janela de impressão, escolha o destino &quot;Salvar como PDF&quot;.</p>
        {printError && <p className={ui.error}>{printError}</p>}
      </div>

      <div className={styles.report}>
        <header className={styles.reportHeader}>
          <h2 className={styles.reportTitle}>Relatório de Progresso</h2>
          <p className={styles.reportSubtitle}>Hub de Saúde · balança Original Line</p>
        </header>

        <section className={styles.patient}>
          <h3 className={styles.patientTitle}>Dados do usuário</h3>
          <dl className={styles.patientGrid}>
            {summary.map(([label, value]) => (
              <div key={label} className={styles.patientItem}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className={styles.sections}>
          {report.sections.map((section) => (
            <ReportSection key={section.key} section={section} />
          ))}
        </div>

        <section className={styles.cross}>
          <h3 className={styles.patientTitle}>Cruzamentos: relógio, treinos e dieta</h3>
          {hasWatchData(crossRows) ? (
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Pesagem</th>
                  <th>Peso (kg)</th>
                  <th>Passos no dia anterior</th>
                  <th>Sono na noite anterior</th>
                  <th>FC de repouso (bpm)</th>
                  <th>Treino na véspera</th>
                  <th>Dieta na véspera</th>
                </tr>
              </thead>
              <tbody>
                {crossRows.map((row) => (
                  <tr key={row.timestamp}>
                    <td>{formatDateTime(row.timestamp)}</td>
                    <td>{formatNumber(row.weightKg, 2)}</td>
                    <td>{formatNumber(row.stepsPreviousDay, 0)}</td>
                    <td>{formatMinutes(row.sleepMinutes)}</td>
                    <td>{formatNumber(row.restingHeartRate, 0)}</td>
                    <td>{row.workoutMinutesPreviousDay ? formatMinutes(row.workoutMinutesPreviousDay) : '--'}</td>
                    <td>
                      {row.dietPreviousDay
                        ? `${row.dietPreviousDay.pct}%${row.dietPreviousDay.off ? ` · ${row.dietPreviousDay.off} fora do plano` : ''}`
                        : '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={ui.hint}>
              Sincronize o relógio, grave treinos ou marque as refeições para cruzar com o peso.
            </p>
          )}
          <p className={styles.crossNote}>
            Passos do dia anterior à pesagem; sono que terminou até 18 h antes dela; FC de repouso = menor FC
            registrada pelo relógio nas 24 h anteriores; treino = minutos em movimento no dia anterior; dieta = % das
            refeições do plano feitas no dia anterior.
          </p>
        </section>

        {/* Por semana: peso × dieta × treinos (o que mais pesou na variação do peso). */}
        <section className={styles.cross}>
          <h3 className={styles.patientTitle}>Semanas: peso × dieta × treinos</h3>
          {weeks.length ? (
            <div className={ui.tableWrapper}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th>Semana</th>
                    <th>Peso médio (kg)</th>
                    <th>Variação</th>
                    <th>Dieta seguida</th>
                    <th>Fora do plano</th>
                    <th>Treinos</th>
                    <th>Passos/dia</th>
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((week) => (
                    <tr key={week.start}>
                      <td>
                        {formatDayMonth(week.start)}–{formatDayMonth(week.end - 1)}
                      </td>
                      <td>{formatNumber(week.avgWeightKg, 2)}</td>
                      <td>{week.deltaKg == null ? '--' : `${week.deltaKg > 0 ? '+' : ''}${formatNumber(week.deltaKg, 2)} kg`}</td>
                      <td>{week.dietPct == null ? '--' : `${week.dietPct}%`}</td>
                      <td>{week.dietPlanned ? week.offMeals : '--'}</td>
                      <td>
                        {week.workouts
                          ? `${week.workouts} · ${formatMinutes(week.workoutMinutes)}${week.distanceKm ? ` · ${formatNumber(week.distanceKm, 1)} km` : ''}`
                          : '--'}
                      </td>
                      <td>{formatNumber(week.avgSteps, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={ui.hint}>Ainda não há semanas com pesagens, treinos ou refeições marcadas.</p>
          )}
          {findings.length > 0 && (
            <ul className={styles.findings}>
              {findings.map((finding) => (
                <li key={finding}>{finding}</li>
              ))}
            </ul>
          )}
          <p className={styles.crossNote}>
            Semanas de 7 dias terminando hoje. Peso médio = média do peso de cada dia (sem as pesagens fora da curva);
            variação = em relação à semana anterior. As conclusões comparam semanas com dieta ≥ {GOOD_DIET_PCT}% e com{' '}
            {GOOD_TRAINING_MIN} min ou mais de treino (meta da OMS) com as demais, quando há pelo menos 2 semanas de cada lado.
            É uma comparação simples, não prova causa.
          </p>
        </section>

        <p className={styles.note}>
          Composição corporal estimada: a balança envia impedância fixa (600 Ω), então os valores dependem só de
          peso, altura, idade e sexo, seguindo as fórmulas do app OKOK. Não substituem uma avaliação por
          bioimpedância real.
        </p>
      </div>
    </section>
  )
}
