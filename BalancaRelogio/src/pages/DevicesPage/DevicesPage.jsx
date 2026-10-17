// Aba Aparelhos: balança e relógio em sub-abas (as conexões continuam ativas ao trocar).
import { useState } from 'react'
import SubNav from '../../components/SubNav/SubNav.jsx'
import ui from '../../styles/controls.module.css'
import MeasurePage from '../MeasurePage/MeasurePage.jsx'
import WatchPage from '../WatchPage/WatchPage.jsx'

const SECTIONS = [
  { id: 'scale', label: 'Balança' },
  { id: 'watch', label: 'Relógio' },
]

/**
 * @param {object} props
 * @param {object} props.scale - hook da balança
 * @param {object} props.watch - hook do relógio
 * @param {object | null} props.user - usuário atual
 * @param {Array<object>} props.users
 * @param {object | null} props.watchOwner - dono do relógio
 * @param {(userId: string) => void} props.onWatchOwnerChange
 * @param {() => void} props.onEditProfile
 */
export default function DevicesPage({ scale, watch, user, users, watchOwner, onWatchOwnerChange, onEditProfile }) {
  const [section, setSection] = useState('scale')
  return (
    <section>
      <h2 className={ui.pageTitle}>Aparelhos</h2>
      <SubNav items={SECTIONS} current={section} onChange={setSection} label="Aparelhos" />
      {section === 'scale' && <MeasurePage scale={scale} profile={user} onEditProfile={onEditProfile} />}
      {section === 'watch' && (
        <WatchPage watch={watch} owner={watchOwner} users={users} onOwnerChange={onWatchOwnerChange} />
      )}
    </section>
  )
}
