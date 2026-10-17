// Lista de planos alimentares do usuário: adicionar (PDF ou JSON), escolher o principal,
// renomear, excluir e editar.
import { useState } from 'react'
import ui from '../../styles/controls.module.css'
import { formatDate } from '../../utils/format.js'
import DietPlanEditor from './DietPlanEditor.jsx'
import styles from './DietPage.module.css'

/**
 * @param {object} props
 * @param {ReturnType<typeof import('../../hooks/useDiet.js').useDiet>} props.diet
 */
export default function DietPlans({ diet }) {
  const { plans, activeId } = diet
  const [editingId, setEditingId] = useState(activeId)
  const [makeActive, setMakeActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const editing = plans.find((entry) => entry.id === editingId) ?? plans.find((entry) => entry.id === activeId) ?? null

  /** Lê o arquivo escolhido (PDF ou JSON) e adiciona como novo plano. */
  const handleFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    setMessage(null)
    try {
      const { entry, label, warnings } = await diet.importFile(file, { makeActive })
      setEditingId(entry.id)
      setMessage({
        type: 'success',
        text: `Plano "${entry.name}" lido (${label}): ${entry.plan.meals.length} refeições.`,
        warnings,
      })
    } catch (error) {
      setMessage({ type: 'error', text: `Não foi possível ler o arquivo: ${error.message}` })
    } finally {
      setBusy(false)
    }
  }

  /** Renomeia pelo diálogo do navegador. */
  const handleRename = (entry) => {
    const name = window.prompt('Nome do plano', entry.name)
    if (name?.trim()) diet.renamePlan(entry.id, name.trim())
  }

  /** Exclui depois de confirmar. */
  const handleRemove = (entry) => {
    if (window.confirm(`Excluir o plano "${entry.name}"?`)) diet.removePlan(entry.id)
  }

  return (
    <div>
      <div className={ui.card}>
        <h3 className={ui.cardTitle}>Adicionar plano</h3>
        <p className={ui.hint}>
          Escolha o <strong>PDF</strong> do plano alimentar (o formato do WebDiet é lido automaticamente; outros
          formatos usam um leitor genérico) ou um arquivo <strong>.json</strong> exportado pelo app.
        </p>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={makeActive || !plans.length} disabled={!plans.length} onChange={(event) => setMakeActive(event.target.checked)} />
          Usar como plano principal
        </label>
        <label className={`${ui.button} ${ui.buttonPrimary} ${styles.fileButton}`} aria-disabled={busy}>
          {busy ? 'Lendo o arquivo…' : 'Escolher PDF ou JSON'}
          <input
            type="file"
            accept="application/pdf,.pdf,application/json,.json"
            onChange={handleFile}
            className={styles.fileInput}
            disabled={busy}
          />
        </label>
        {message && (
          <div className={message.type === 'error' ? ui.error : ui.success}>
            <p className={styles.message}>{message.text}</p>
            {message.warnings?.map((warning) => (
              <p key={warning} className={ui.hint}>
                {warning}
              </p>
            ))}
          </div>
        )}
      </div>

      {plans.length > 0 && (
        <div className={ui.card}>
          <h3 className={ui.cardTitle}>Seus planos</h3>
          <ul className={styles.plans}>
            {plans.map((entry) => (
              <li key={entry.id} className={`${styles.planItem} ${entry.id === activeId ? styles.planActive : ''}`}>
                <div className={styles.planInfo}>
                  <span className={styles.planName}>
                    {entry.name}
                    {entry.id === activeId && <span className={styles.badge}>Principal</span>}
                  </span>
                  <span className={ui.hint}>
                    {entry.plan.meals.length} refeições · {entry.source}
                    {entry.importedAt > 0 && ` · ${formatDate(entry.importedAt)}`}
                  </span>
                </div>
                <div className={styles.planActions}>
                  {entry.id !== activeId && (
                    <button type="button" className={`${ui.button} ${ui.buttonPrimary}`} onClick={() => diet.setActive(entry.id)}>
                      Tornar principal
                    </button>
                  )}
                  <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={() => setEditingId(entry.id)}>
                    Editar
                  </button>
                  <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={() => handleRename(entry)}>
                    Renomear
                  </button>
                  <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={() => handleRemove(entry)}>
                    Excluir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editing && (
        <>
          <h3 className={styles.editorTitle}>Editando: {editing.name}</h3>
          <DietPlanEditor key={editing.id} plan={editing.plan} onSave={(plan) => diet.savePlan(plan, editing.id)} />
        </>
      )}

      {!plans.length && (
        <button
          type="button"
          className={`${ui.button} ${ui.buttonSecondary}`}
          onClick={async () => setEditingId((await diet.addPlan({ meals: [] }, { name: 'Meu plano' })).id)}
        >
          Criar plano em branco
        </button>
      )}
    </div>
  )
}
