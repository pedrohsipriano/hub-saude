// Perfis: quem usa a balança (várias pessoas podem usar a mesma) e os dados usados nas fórmulas.
// A idade é calculada a partir da data de nascimento.
import { useState } from 'react'
import WatchSyncStatus from '../../components/WatchSyncStatus/WatchSyncStatus.jsx'
import { SEX_FEMALE, SEX_MALE } from '../../devices/scale/bodyComposition.js'
import ui from '../../styles/controls.module.css'
import styles from './ProfilePage.module.css'

/** Formulário em branco ou preenchido com um perfil. */
function toForm(user) {
  return {
    userId: user?.userId ?? null,
    name: user?.name ?? '',
    heightCm: user?.heightCm ?? '',
    birthDate: user?.birthDate ?? '',
    sex: String(user?.sex ?? SEX_MALE),
  }
}

/**
 * @param {object} props
 * @param {ReturnType<typeof import('../../hooks/useUsers.js').useUsers>} props.usersApi
 * @param {object} props.watch - hook do relógio (o perfil do dono vai para ele automaticamente ao salvar)
 * @param {boolean} props.isWatchOwner - o perfil atual é o do dono do relógio
 */
export default function ProfilePage({ usersApi, watch, isWatchOwner }) {
  const { users, currentUser, selectUser, saveUser, removeUser } = usersApi
  // Sem nenhum usuário, já abre o formulário de cadastro.
  const [form, setForm] = useState(() => toForm(currentUser))
  const [message, setMessage] = useState(null)

  /** Atualiza um campo. */
  const update = (field) => (event) => setForm((previous) => ({ ...previous, [field]: event.target.value }))

  /** Valida e salva. */
  const handleSubmit = async (event) => {
    event.preventDefault()
    const heightCm = Number(form.heightCm)
    if (!form.name.trim()) {
      setMessage({ type: 'error', text: 'Informe o nome.' })
      return
    }
    if (!(heightCm >= 100 && heightCm <= 250)) {
      setMessage({ type: 'error', text: 'Informe a altura em centímetros (entre 100 e 250).' })
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.birthDate)) {
      setMessage({ type: 'error', text: 'Informe a data de nascimento.' })
      return
    }
    try {
      const userId = await saveUser({
        userId: form.userId ?? undefined,
        name: form.name.trim(),
        heightCm,
        birthDate: form.birthDate,
        sex: Number(form.sex),
      })
      setForm((previous) => ({ ...previous, userId }))
      setMessage({ type: 'success', text: 'Perfil salvo.' })
    } catch (error) {
      setMessage({ type: 'error', text: `Não foi possível salvar: ${error.message}` })
    }
  }

  /** Remove o perfil em edição, depois de confirmar. */
  const handleRemove = async () => {
    if (!form.userId || !window.confirm(`Remover o perfil de ${form.name}? As medições dele continuam guardadas.`)) return
    await removeUser(form.userId)
    setForm(toForm(null))
    setMessage({ type: 'success', text: 'Perfil removido.' })
  }

  return (
    <div>
      {users.length > 0 && (
        <div className={ui.card}>
          <h3 className={ui.cardTitle}>Quem está usando</h3>
          <ul className={styles.users}>
            {users.map((user) => (
              <li key={user.userId} className={`${styles.user} ${user.userId === currentUser?.userId ? styles.current : ''}`}>
                <span className={styles.userName}>
                  {user.name || 'Sem nome'}
                  {user.age != null && <span className={styles.userAge}> · {user.age} anos</span>}
                </span>
                {user.userId !== currentUser?.userId && (
                  <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={() => selectUser(user.userId)}>
                    Usar
                  </button>
                )}
                <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={() => setForm(toForm(user))}>
                  Editar
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={() => setForm(toForm(null))}>
            Adicionar pessoa
          </button>
        </div>
      )}

      <form className={ui.card} onSubmit={handleSubmit} noValidate>
        <h3 className={ui.cardTitle}>{form.userId ? `Editar ${form.name || 'perfil'}` : 'Nova pessoa'}</h3>
        <label className={ui.field}>
          <span className={ui.label}>Nome</span>
          <input className={ui.input} type="text" value={form.name} onChange={update('name')} autoComplete="name" />
        </label>
        <label className={ui.field}>
          <span className={ui.label}>Altura (cm)</span>
          <input className={ui.input} type="number" inputMode="numeric" value={form.heightCm} onChange={update('heightCm')} />
        </label>
        <label className={ui.field}>
          <span className={ui.label}>Data de nascimento</span>
          <input className={ui.input} type="date" value={form.birthDate} onChange={update('birthDate')} />
        </label>
        <label className={ui.field}>
          <span className={ui.label}>Sexo (usado nas fórmulas)</span>
          <select className={ui.input} value={form.sex} onChange={update('sex')}>
            <option value={String(SEX_MALE)}>Masculino</option>
            <option value={String(SEX_FEMALE)}>Feminino</option>
          </select>
        </label>
        <div className={ui.actions}>
          <button type="submit" className={`${ui.button} ${ui.buttonPrimary}`}>
            Salvar perfil
          </button>
          {form.userId && users.length > 1 && (
            <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={handleRemove}>
              Remover
            </button>
          )}
        </div>
        {message && <p className={message.type === 'error' ? ui.error : ui.success}>{message.text}</p>}
        {/* Altura, sexo, nascimento e peso vão sozinhos para o relógio (ao salvar e quando ele conecta). */}
        <WatchSyncStatus watch={watch} isWatchOwner={isWatchOwner} />
      </form>
    </div>
  )
}
