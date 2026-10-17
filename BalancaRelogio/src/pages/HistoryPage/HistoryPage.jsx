// Página de histórico: todas as pesagens salvas, da mais recente para a mais antiga.
// Pesagens fora da curva (ignoradas na tendência) ficam marcadas, e qualquer pesagem pode ser apagada
// (ex.: outra pessoa subiu na balança ou a pesagem saiu errada).
import { useMemo, useState } from 'react'
import { SCALE_DEVICE } from '../../devices/scale/weighings.js'
import { hub } from '../../hub/hub.js'
import { useWeighings } from '../../hooks/useWeighings.js'
import { evaluateWeighing } from '../../report/buildProgressReport.js'
import { flagOutliers } from '../../report/trend.js'
import { deleteMeasurementsAt } from '../../storage/db.js'
import ui from '../../styles/controls.module.css'
import { formatDateTime, formatNumber } from '../../utils/format.js'
import styles from './HistoryPage.module.css'

/**
 * @param {object} props
 * @param {object | null} props.profile - sem perfil, só o peso é exibido
 */
export default function HistoryPage({ profile }) {
  const { weighings, loading, error } = useWeighings(profile?.userId)
  // Pesagem com o "Apagar" aberto para confirmar.
  const [confirmAt, setConfirmAt] = useState(null)
  const [deleteError, setDeleteError] = useState(null)

  // Calcula as métricas de cada pesagem com o perfil atual e marca as fora da curva.
  const rows = useMemo(
    () =>
      flagOutliers(weighings)
        .reverse()
        .map((weighing) => ({
          ...(profile ? evaluateWeighing(weighing, profile) : { timestamp: weighing.timestamp, values: { weightKg: weighing.weightKg } }),
          outlier: weighing.outlier,
        })),
    [weighings, profile],
  )

  /** Apaga a pesagem do banco local (as telas recarregam pelo hub). */
  const remove = async (timestamp) => {
    setDeleteError(null)
    try {
      await deleteMeasurementsAt(profile.userId, SCALE_DEVICE, timestamp)
      setConfirmAt(null)
      hub.emit('measurements:changed')
    } catch (removeError) {
      setDeleteError(`Não foi possível apagar: ${removeError.message}`)
    }
  }

  return (
    <section>
      <h2 className={ui.pageTitle}>Histórico</h2>
      <div className={ui.card}>
        {loading && <p>Carregando…</p>}
        {error && <p className={ui.error}>Não foi possível ler o banco local: {error.message}</p>}
        {!loading && rows.length === 0 && <p>Nenhuma pesagem salva ainda.</p>}
        {rows.length > 0 && (
          <div className={ui.tableWrapper}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Peso (kg)</th>
                  <th>IMC</th>
                  <th>Gordura (%)</th>
                  <th>Músculo (kg)</th>
                  <th>Água (%)</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ timestamp, values, outlier }) => (
                  <tr key={timestamp} className={outlier ? styles.outlierRow : undefined}>
                    <td>{formatDateTime(timestamp)}</td>
                    <td>
                      {formatNumber(values.weightKg, 2)}
                      {outlier && <span className={styles.outlierTag}>fora da curva</span>}
                    </td>
                    <td>{formatNumber(values.bmi, 1)}</td>
                    <td>{formatNumber(values.fatPercent, 1)}</td>
                    <td>{formatNumber(values.muscleMassKg, 1)}</td>
                    <td>{formatNumber(values.waterPercent, 1)}</td>
                    <td className={styles.actions}>
                      {confirmAt === timestamp ? (
                        <>
                          <button type="button" className={styles.danger} onClick={() => remove(timestamp)}>
                            Confirmar
                          </button>
                          <button type="button" className={styles.link} onClick={() => setConfirmAt(null)}>
                            Cancelar
                          </button>
                        </>
                      ) : (
                        profile && (
                          <button type="button" className={styles.link} onClick={() => setConfirmAt(timestamp)}>
                            Apagar
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {deleteError && <p className={ui.error}>{deleteError}</p>}
        {rows.some((row) => row.outlier) && (
          <p className={ui.hint}>
            &quot;Fora da curva&quot;: longe das pesagens vizinhas (mais de 3 kg ou 4 %); fica fora da tendência. Apague se foi
            engano. Apagar aqui não apaga o que já foi enviado ao Health Connect.
          </p>
        )}
        {!profile && rows.length > 0 && <p className={ui.hint}>Preencha o perfil para ver IMC e composição.</p>}
      </div>
    </section>
  )
}
