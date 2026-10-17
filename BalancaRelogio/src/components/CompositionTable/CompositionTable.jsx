// Tabela com todas as métricas de uma pesagem e a classificação de cada uma.
import { METRIC_CATALOG } from '../../report/metricCatalog.js'
import { classify, getStandard } from '../../report/standards.js'
import ui from '../../styles/controls.module.css'
import { formatNumber, toneClassName } from '../../utils/format.js'
import styles from './CompositionTable.module.css'

/**
 * @param {object} props
 * @param {object} props.values - métricas (weightKg + resultado de computeBodyComposition)
 * @param {{ sex: number, age: number, heightCm: number }} props.profile
 */
export default function CompositionTable({ values, profile }) {
  // Contexto das faixas de referência.
  const context = { ...profile, weightKg: values.weightKg }

  return (
    <>
      <div className={ui.tableWrapper}>
        <table className={ui.table}>
          <thead>
            <tr>
              <th>Métrica</th>
              <th>Valor</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {METRIC_CATALOG.filter((metric) => values[metric.key] != null).map((metric) => {
              const band = classify(values[metric.key], getStandard(metric.key, context))
              const detailValue = metric.detail ? values[metric.detail.key] : null
              return (
                <tr key={metric.key}>
                  <td>{metric.title}</td>
                  <td>
                    {formatNumber(values[metric.key], metric.decimals)} {metric.unit}
                    {detailValue != null && (
                      <span className={styles.detail}>
                        {' '}
                        ({formatNumber(detailValue, metric.detail.decimals)} {metric.detail.unit})
                      </span>
                    )}
                  </td>
                  <td>
                    {band ? (
                      <span className={styles.status}>
                        <span className={`${styles.dot} ${styles[toneClassName(band.tone)]}`} aria-hidden="true" />
                        {band.label}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className={ui.hint}>
        Estimativa: a balança envia impedância fixa (600 Ω), então a composição corporal depende só de peso,
        altura, idade e sexo. Os valores seguem as fórmulas do app OKOK.
      </p>
    </>
  )
}
