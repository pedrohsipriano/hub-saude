// Editor de um plano alimentar: ajustar horários e itens, salvar e exportar (.json).
// A importação (PDF/JSON) fica na lista de planos (DietPlans).
// Os itens são editados como texto: uma linha por item, "principal | substituto | substituto".
import { useState } from 'react'
import { emptyPlan } from '../../diet/dietPlan.js'
import ui from '../../styles/controls.module.css'
import styles from './DietPage.module.css'

/** Plano → rascunho editável (itens viram texto). */
function toDraft(plan) {
  return (plan ?? emptyPlan()).meals.map((meal) => ({
    id: meal.id,
    name: meal.name,
    time: meal.time,
    reminderText: meal.reminderText ?? '',
    options: meal.options.map((option) => ({
      label: option.label,
      notes: option.notes ?? '',
      text: option.items.map((item) => [item.main, ...item.substitutes].join(' | ')).join('\n'),
    })),
  }))
}

/** Rascunho → plano (texto volta a ser itens). */
function fromDraft(draft, basePlan) {
  return {
    ...(basePlan ?? emptyPlan()),
    meals: draft.map((meal) => ({
      ...meal,
      options: meal.options.map((option) => ({
        label: option.label,
        notes: option.notes,
        items: option.text
          .split('\n')
          .map((line) => line.split('|').map((part) => part.trim()).filter(Boolean))
          .filter((parts) => parts.length)
          .map(([main, ...substitutes]) => ({ main, substitutes })),
      })),
    })),
  }
}

/**
 * @param {object} props
 * @param {object | null} props.plan
 * @param {(plan: object) => Promise<object>} props.onSave
 */
export default function DietPlanEditor({ plan, onSave }) {
  const [draft, setDraft] = useState(() => toDraft(plan))
  const [message, setMessage] = useState(null)

  /** Altera um campo de uma refeição. */
  const updateMeal = (index, patch) =>
    setDraft((previous) => previous.map((meal, i) => (i === index ? { ...meal, ...patch } : meal)))

  /** Altera o texto de uma opção. */
  const updateOption = (mealIndex, optionIndex, patch) =>
    updateMeal(mealIndex, {
      options: draft[mealIndex].options.map((option, i) => (i === optionIndex ? { ...option, ...patch } : option)),
    })

  /** Valida e salva o rascunho. */
  const handleSave = async () => {
    try {
      const saved = await onSave(fromDraft(draft, plan))
      setDraft(toDraft(saved))
      setMessage({ type: 'success', text: 'Plano salvo. Os lembretes são atualizados automaticamente.' })
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  /** Baixa o plano atual como .json (cópia de segurança). */
  const handleExport = () => {
    const blob = new Blob([JSON.stringify(fromDraft(draft, plan), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'plano-alimentar.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      {draft.map((meal, mealIndex) => (
        <div key={meal.id} className={ui.card}>
          <div className={styles.editorRow}>
            <label className={ui.field}>
              <span className={ui.label}>Refeição</span>
              <input className={ui.input} value={meal.name} onChange={(event) => updateMeal(mealIndex, { name: event.target.value })} />
            </label>
            <label className={ui.field}>
              <span className={ui.label}>Horário</span>
              <input className={ui.input} type="time" value={meal.time} onChange={(event) => updateMeal(mealIndex, { time: event.target.value })} />
            </label>
          </div>
          <label className={ui.field}>
            <span className={ui.label}>Texto extra do lembrete (opcional)</span>
            <input
              className={ui.input}
              value={meal.reminderText}
              onChange={(event) => updateMeal(mealIndex, { reminderText: event.target.value })}
            />
          </label>
          {meal.options.map((option, optionIndex) => (
            <label key={option.label} className={ui.field}>
              <span className={ui.label}>
                {meal.options.length > 1 ? option.label : 'Itens'} — uma linha por item: principal | substituto | substituto
              </span>
              <textarea
                className={`${ui.input} ${styles.textarea}`}
                rows={Math.max(3, option.text.split('\n').length)}
                value={option.text}
                onChange={(event) => updateOption(mealIndex, optionIndex, { text: event.target.value })}
              />
            </label>
          ))}
          <button
            type="button"
            className={`${ui.button} ${ui.buttonSecondary}`}
            onClick={() => setDraft((previous) => previous.filter((_, i) => i !== mealIndex))}
          >
            Remover refeição
          </button>
        </div>
      ))}

      <div className={ui.actions}>
        <button
          type="button"
          className={`${ui.button} ${ui.buttonSecondary}`}
          onClick={() =>
            setDraft((previous) => [
              ...previous,
              { id: `refeicao-${Date.now()}`, name: 'Nova refeição', time: '12:00', reminderText: '', options: [{ label: 'Opção 1', notes: '', text: '' }] },
            ])
          }
        >
          Adicionar refeição
        </button>
        <button type="button" className={`${ui.button} ${ui.buttonPrimary}`} onClick={handleSave}>
          Salvar plano
        </button>
        <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={handleExport} disabled={!draft.length}>
          Exportar .json
        </button>
      </div>
      {message && <p className={message.type === 'error' ? ui.error : ui.success}>{message.text}</p>}
    </div>
  )
}
