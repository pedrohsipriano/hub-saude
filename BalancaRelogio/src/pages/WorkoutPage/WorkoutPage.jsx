// Aba Treino (estilo Strava): gravar um treino com cronômetro, GPS e mapa, e ver as atividades salvas.
// A gravação em si fica no App (useWorkoutRecorder) para continuar ao trocar de aba.
import { useState } from 'react'
import SubNav from '../../components/SubNav/SubNav.jsx'
import { useWorkouts } from '../../hooks/useWorkouts.js'
import ui from '../../styles/controls.module.css'
import RecordView from './RecordView.jsx'
import WorkoutDetail from './WorkoutDetail.jsx'
import WorkoutList from './WorkoutList.jsx'

const SECTIONS = [
  { id: 'record', label: 'Gravar' },
  { id: 'list', label: 'Atividades' },
]

/**
 * @param {object} props
 * @param {object} props.user - usuário atual
 * @param {object} props.recorder - gravação em andamento (useWorkoutRecorder)
 */
export default function WorkoutPage({ user, recorder }) {
  const [section, setSection] = useState('record')
  const [openId, setOpenId] = useState(null)
  // Treino acabado de salvar: mostrado enquanto a lista ainda recarrega do banco.
  const [justSaved, setJustSaved] = useState(null)
  const { workouts, loading, rename, update, remove } = useWorkouts(user.userId)
  const opened = openId ? (workouts.find((workout) => workout.id === openId) ?? (justSaved?.id === openId ? justSaved : null)) : null

  /** Volta para a lista. */
  const backToList = () => {
    setOpenId(null)
    setJustSaved(null)
    setSection('list')
  }

  if (opened) {
    return (
      <WorkoutDetail
        key={opened.id}
        workout={opened}
        onBack={backToList}
        onRename={(name) => rename(opened, name)}
        onUpdate={(patch) => update(opened, patch)}
        // Logo depois de salvar, o percurso animado toca sozinho.
        autoReplay={justSaved?.id === opened.id}
        onDelete={async () => {
          await remove(opened)
          backToList()
        }}
      />
    )
  }

  return (
    <section>
      <h2 className={ui.pageTitle}>Treino</h2>
      <SubNav items={SECTIONS} current={section} onChange={setSection} label="Seções do treino" />
      {section === 'record' ? (
        <RecordView
          user={user}
          recorder={recorder}
          onFinished={(workout) => {
            setJustSaved(workout)
            setOpenId(workout.id)
          }}
        />
      ) : (
        <WorkoutList workouts={workouts} loading={loading} onOpen={setOpenId} />
      )}
    </section>
  )
}
