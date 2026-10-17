// Bloco de uma métrica no relatório: valor atual + situação + faixa de referência,
// tabela com as últimas pesagens e gráfico de evolução (mesma estrutura do PDF de referência).
import LineChart from '../LineChart/LineChart.jsx'
import RangeBar from '../RangeBar/RangeBar.jsx'
import StatusFace from '../StatusFace/StatusFace.jsx'
import { formatDate, formatNumber, toneClassName } from '../../utils/format.js'
import styles from './ReportSection.module.css'

/**
 * @param {object} props
 * @param {object} props.section - item de buildProgressReport().sections
 */
export default function ReportSection({ section }) {
  const { title, unit, decimals, current, detail, detailValue, bands, band, history, delta } = section

  return (
    <article className={styles.section}>
      {/* Coluna 1: valor atual e situação */}
      <div className={styles.summary}>
        <h3 className={styles.title}>
          Análise de {title}
          {unit && ` [${unit}]`}
        </h3>
        {detail && detailValue != null && (
          <p className={styles.detail}>
            {detail.label}: {formatNumber(detailValue, detail.decimals)} {detail.unit}
          </p>
        )}
        <div className={styles.currentRow}>
          {band && <StatusFace tone={band.tone} />}
          <span className={`${styles.current} ${band ? styles[toneClassName(band.tone)] : ''}`}>
            {formatNumber(current, decimals)}
            {unit === '%' && '%'}
          </span>
          {band && <span className={styles.bandLabel}>{band.label}</span>}
        </div>
        {bands && <RangeBar bands={bands} value={current} decimals={decimals} />}
        {/* Comparação com o início do período do relatório. */}
        {delta != null && (
          <p className={styles.detail}>
            Variação no período: {delta > 0 ? '+' : ''}
            {formatNumber(delta, Math.max(decimals, 1))}
            {unit === '%' ? ' p.p.' : unit ? ` ${unit}` : ''}
          </p>
        )}
      </div>

      {/* Coluna 2: tabela das últimas pesagens */}
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Data</th>
            <th>Valores</th>
          </tr>
        </thead>
        <tbody>
          {history.map((point) => (
            <tr key={point.timestamp}>
              <td>{formatDate(point.timestamp)}</td>
              <td>{formatNumber(point.value, Math.max(decimals, 2))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Coluna 3: gráfico de evolução */}
      <div className={styles.chart}>
        <LineChart points={history} decimals={Math.max(decimals, 2)} label={title} />
      </div>
    </article>
  )
}
