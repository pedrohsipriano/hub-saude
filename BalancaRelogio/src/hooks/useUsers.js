// Hook dos usuários (perfis): lista, usuário atual, criar, editar e remover.
// O primeiro usuário usa o id "default", o mesmo das medições antigas.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { DEFAULT_USER_ID } from '../hub/hub.js'
import { deleteProfile, listProfiles, saveProfile } from '../storage/db.js'
import { ageFromBirthDate } from '../utils/date.js'
import { usePersistentState } from './usePersistentState.js'

/** Idade calculada pela data de nascimento (quando houver). */
function withDerivedAge(profile) {
  return { ...profile, age: ageFromBirthDate(profile.birthDate) ?? profile.age ?? null }
}

/**
 * @returns {{ users: Array<object>, currentUser: object | null, loaded: boolean,
 *             selectUser: (userId: string) => void, saveUser: (data: object) => Promise<string>,
 *             removeUser: (userId: string) => Promise<void> }}
 */
export function useUsers() {
  const [state, setState] = useState({ profiles: [], loaded: false })
  const [currentId, setCurrentId] = usePersistentState('hubSaude.currentUser', DEFAULT_USER_ID)

  /** Recarrega a lista do banco. */
  const reload = useCallback(async () => {
    const profiles = await listProfiles()
    setState({ profiles, loaded: true })
    return profiles
  }, [])

  // Primeira leitura.
  useEffect(() => {
    let active = true
    listProfiles()
      .then((profiles) => active && setState({ profiles, loaded: true }))
      .catch((error) => {
        console.error('Falha ao carregar os usuários', error)
        if (active) setState({ profiles: [], loaded: true })
      })
    return () => {
      active = false
    }
  }, [])

  const users = useMemo(
    () => state.profiles.map(withDerivedAge).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
    [state.profiles],
  )
  const currentUser = users.find((user) => user.userId === currentId) ?? users[0] ?? null

  /** Cria ou atualiza um usuário; devolve o id. */
  const saveUser = useCallback(
    async (data) => {
      const existing = state.profiles.find((profile) => profile.userId === data.userId)
      const userId = data.userId ?? (state.profiles.length ? `user-${Date.now()}` : DEFAULT_USER_ID)
      const record = { ...existing, ...data, userId }
      // "age" não é guardada quando há data de nascimento: sai sempre dela.
      if (record.birthDate) delete record.age
      await saveProfile(record)
      await reload()
      if (!existing) setCurrentId(userId)
      return userId
    },
    [state.profiles, reload, setCurrentId],
  )

  /** Remove um usuário (as medições dele ficam no banco). */
  const removeUser = useCallback(
    async (userId) => {
      await deleteProfile(userId)
      const profiles = await reload()
      if (userId === currentId) setCurrentId(profiles[0]?.userId ?? DEFAULT_USER_ID)
    },
    [currentId, reload, setCurrentId],
  )

  return { users, currentUser, loaded: state.loaded, selectUser: setCurrentId, saveUser, removeUser }
}
