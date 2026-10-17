// Aba Mais: perfis, metas, lembretes, integrações e aparência (tema claro/escuro).
import SubNav from '../../components/SubNav/SubNav.jsx'
import ui from '../../styles/controls.module.css'
import AppearancePage from '../AppearancePage/AppearancePage.jsx'
import GoalsPage from '../GoalsPage/GoalsPage.jsx'
import IntegrationsPage from '../IntegrationsPage/IntegrationsPage.jsx'
import ProfilePage from '../ProfilePage/ProfilePage.jsx'
import RemindersPage from '../RemindersPage/RemindersPage.jsx'

const MORE_SECTIONS = [
  { id: 'profile', label: 'Perfis' },
  { id: 'goals', label: 'Metas' },
  { id: 'reminders', label: 'Lembretes' },
  { id: 'integrations', label: 'Integrações' },
  { id: 'appearance', label: 'Aparência' },
]

/**
 * @param {object} props
 * @param {string} props.section - sub-aba atual (controlada pelo App, para atalhos de outras telas)
 * @param {(id: string) => void} props.onSectionChange
 * @param {object} props.usersApi - hook de usuários
 * @param {object} props.watch
 * @param {boolean} props.isWatchOwner
 * @param {object} props.reminders
 * @param {object} props.settings
 * @param {(patch: object) => void} props.onSettingsChange
 * @param {object} props.healthConnect
 * @param {object | null} props.phoneOwner
 */
export default function MorePage({
  section,
  onSectionChange,
  usersApi,
  watch,
  isWatchOwner,
  reminders,
  settings,
  onSettingsChange,
  healthConnect,
  phoneOwner,
}) {
  const user = usersApi.currentUser
  // Sem perfil, só a sub-aba de perfis faz sentido.
  const current = user ? section : 'profile'

  return (
    <section>
      <h2 className={ui.pageTitle}>Mais</h2>
      <SubNav items={MORE_SECTIONS} current={current} onChange={onSectionChange} label="Seções" />
      {current === 'profile' && <ProfilePage key={user?.userId ?? 'novo'} usersApi={usersApi} watch={watch} isWatchOwner={isWatchOwner} />}
      {current === 'goals' && (
        <GoalsPage key={user.userId} user={user} onSave={usersApi.saveUser} watch={watch} isWatchOwner={isWatchOwner} />
      )}
      {current === 'reminders' && (
        <RemindersPage reminders={reminders} settings={settings} onChange={onSettingsChange} ownerName={phoneOwner?.name ?? null} />
      )}
      {current === 'integrations' && (
        <IntegrationsPage
          healthConnect={healthConnect}
          users={usersApi.users}
          owner={phoneOwner}
          onOwnerChange={(userId) => onSettingsChange({ phoneOwnerId: userId })}
        />
      )}
      {current === 'appearance' && <AppearancePage theme={settings.theme} onChange={(theme) => onSettingsChange({ theme })} />}
    </section>
  )
}
