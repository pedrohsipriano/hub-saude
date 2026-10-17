// Metas: peso-alvo (com projeção na tela inicial e na tendência), passos por dia e horas de sono.
// A meta de passos pode ser enviada ao relógio (comando 0x49, confirmado no log HCI).
import WatchSyncStatus from '../../components/WatchSyncStatus/WatchSyncStatus.jsx'
import { useState } from 'react'
import ui from '../../styles/controls.module.css'

/** Converte texto com vírgula em número (vazio → null). */
const toNumber = (text) => {
  const value = Number(String(text).replace(',', '.'))
  return text === '' || Number.isNaN(value) ? null : value
}

/**
 * @param {object} props
 * @param {object} props.user
 * @param {(data: object) => Promise<string>} props.onSave - salva o perfil (com as metas)
 * @param {object} props.watch - hook do relógio
 * @param {boolean} props.isWatchOwner
 */
export default function GoalsPage({ user, onSave, watch, isWatchOwner }) {
  const goals = user.goals ?? {}
  const [form, setForm] = useState({
    targetWeightKg: goals.targetWeightKg ?? '',
    dailySteps: goals.dailySteps ?? '',
    sleepHours: goals.sleepHours ?? '',
  })
  const [message, setMessage] = useState(null)

  /** Atualiza um campo. */
  const update = (field) => (event) => setForm((previous) => ({ ...previous, [field]: event.target.value }))

  /** Salva as metas no perfil. */
  const handleSubmit = async (event) => {
    event.preventDefault()
    const next = {
      targetWeightKg: toNumber(form.targetWeightKg),
      dailySteps: toNumber(form.dailySteps),
      sleepHours: toNumber(form.sleepHours),
    }
    if (next.targetWeightKg != null && !(next.targetWeightKg >= 30 && next.targetWeightKg <= 250)) {
      setMessage({ type: 'error', text: 'Peso-alvo entre 30 e 250 kg.' })
      return
    }
    await onSave({ ...user, goals: next })
    // A meta de passos vai para o relógio sozinha (useWatch: ao salvar e quando o relógio conecta).
    setMessage({ type: 'success', text: isWatchOwner && next.dailySteps ? 'Metas salvas. A meta de passos vai para o relógio automaticamente.' : 'Metas salvas.' })
  }

  return (
    <form className={ui.card} onSubmit={handleSubmit} noValidate>
      <h3 className={ui.cardTitle}>Metas de {user.name || 'você'}</h3>
      <label className={ui.field}>
        <span className={ui.label}>Peso-alvo (kg)</span>
        <input className={ui.input} type="text" inputMode="decimal" value={form.targetWeightKg} onChange={update('targetWeightKg')} />
      </label>
      <label className={ui.field}>
        <span className={ui.label}>Passos por dia</span>
        <input className={ui.input} type="number" inputMode="numeric" value={form.dailySteps} onChange={update('dailySteps')} />
      </label>
      <label className={ui.field}>
        <span className={ui.label}>Horas de sono por noite</span>
        <input className={ui.input} type="text" inputMode="decimal" value={form.sleepHours} onChange={update('sleepHours')} />
      </label>
      <div className={ui.actions}>
        <button type="submit" className={`${ui.button} ${ui.buttonPrimary}`}>
          Salvar metas
        </button>
      </div>
      {message && <p className={message.type === 'error' ? ui.error : ui.success}>{message.text}</p>}
      <WatchSyncStatus watch={watch} isWatchOwner={isWatchOwner} />
    </form>
  )
}
