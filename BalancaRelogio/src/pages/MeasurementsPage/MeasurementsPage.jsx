// Medidas corporais com fita métrica (cintura, quadril, braço, pescoço) e a relação cintura-quadril.
import { useMemo, useState } from 'react'
import { hub } from '../../hub/hub.js'
import { useMeasurementRows } from '../../hooks/useMeasurementRows.js'
import { MEASUREMENT_FIELDS, groupMeasurements, measurementsToEvent } from '../../report/bodyMeasurements.js'
import { classify, getStandard } from '../../report/standards.js'
import ui from '../../styles/controls.module.css'
import { formatDateTime, formatNumber } from '../../utils/format.js'
import styles from './MeasurementsPage.module.css'

// Formulário vazio: um campo de texto por medida.
const EMPTY_FORM = Object.fromEntries(MEASUREMENT_FIELDS.map((field) => [field.key, '']))

/**
 * @param {object} props
 * @param {object} props.user - usuário atual (sexo define a faixa da RCQ)
 */
export default function MeasurementsPage({ user }) {
  const { rows } = useMeasurementRows(user.userId)
  const entries = useMemo(() => groupMeasurements(rows), [rows])
  const [form, setForm] = useState(EMPTY_FORM)
  const [message, setMessage] = useState(null)
  const whrBands = getStandard('whr', user)

  /** Grava as medidas preenchidas. */
  const handleSubmit = (event) => {
    event.preventDefault()
    const values = Object.fromEntries(
      MEASUREMENT_FIELDS.map((field) => [field.key, Number(String(form[field.key]).replace(',', '.')) || null]),
    )
    if (!Object.values(values).some((value) => value > 0)) {
      setMessage({ type: 'error', text: 'Preencha pelo menos uma medida (cm).' })
      return
    }
    hub.emit('measurement', measurementsToEvent(values, user.userId, Date.now()))
    setForm(EMPTY_FORM)
    setMessage({ type: 'success', text: 'Medidas salvas.' })
  }

  return (
    <div>
      <form className={ui.card} onSubmit={handleSubmit} noValidate>
        <h3 className={ui.cardTitle}>Nova medição (cm)</h3>
        <div className={styles.grid}>
          {MEASUREMENT_FIELDS.map((field) => (
            <label key={field.key} className={ui.field}>
              <span className={ui.label}>{field.label}</span>
              <input
                className={ui.input}
                type="text"
                inputMode="decimal"
                value={form[field.key]}
                onChange={(event) => setForm((previous) => ({ ...previous, [field.key]: event.target.value }))}
              />
            </label>
          ))}
        </div>
        <button type="submit" className={`${ui.button} ${ui.buttonPrimary}`}>
          Salvar medidas
        </button>
        {message && <p className={message.type === 'error' ? ui.error : ui.success}>{message.text}</p>}
        <p className={ui.hint}>Cintura na altura do umbigo; quadril na parte mais larga. Meça sempre do mesmo jeito.</p>
      </form>

      {entries.length > 0 && (
        <div className={ui.card}>
          <h3 className={ui.cardTitle}>Histórico de medidas</h3>
          <div className={ui.tableWrapper}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Data</th>
                  {MEASUREMENT_FIELDS.map((field) => (
                    <th key={field.key}>{field.label}</th>
                  ))}
                  <th>RCQ</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.timestamp}>
                    <td>{formatDateTime(entry.timestamp)}</td>
                    {MEASUREMENT_FIELDS.map((field) => (
                      <td key={field.key}>{formatNumber(entry[field.key], 1)}</td>
                    ))}
                    <td>{entry.whr == null ? '--' : `${formatNumber(entry.whr, 2)} (${classify(entry.whr, whrBands).label})`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={ui.hint}>RCQ = cintura ÷ quadril. Referência da OMS: risco a partir de 0,90 (homens) e 0,85 (mulheres).</p>
        </div>
      )}
    </div>
  )
}
