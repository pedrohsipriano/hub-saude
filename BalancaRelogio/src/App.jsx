// Componente raiz: abas principais e estado compartilhado
// (usuários, preferências, conexões com a balança e o relógio, Health Connect e lembretes).
// As conexões ficam aqui para continuarem ativas enquanto o usuário troca de aba.
import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import AlarmOverlay from './components/AlarmOverlay/AlarmOverlay.jsx'
import Layout from './components/Layout/Layout.jsx'
import RecordingBanner from './components/RecordingBanner/RecordingBanner.jsx'
import { assignWeighing } from './devices/scale/assignUser.js'
import { mealsOfDay } from './diet/dietPlan.js'
import { latestWeightByUser } from './devices/scale/weighings.js'
import { useDiet } from './hooks/useDiet.js'
import { useHealthConnect } from './hooks/useHealthConnect.js'
import { usePersistentState } from './hooks/usePersistentState.js'
import { useReminders } from './hooks/useReminders.js'
import { useScale } from './hooks/useScale.js'
import { useTheme } from './hooks/useTheme.js'
import { useUsers } from './hooks/useUsers.js'
import { useWater } from './hooks/useWater.js'
import { useWatch } from './hooks/useWatch.js'
import { useWorkoutRecorder } from './hooks/useWorkoutRecorder.js'
import { DEFAULT_USER_ID } from './hub/hub.js'
import HomePage from './pages/HomePage/HomePage.jsx'
import { DEFAULT_ALARM, DEFAULT_WATER_REMINDER } from './reminders/reminders.js'
import { listAllMeasurements } from './storage/db.js'
import ui from './styles/controls.module.css'

// As outras abas são carregadas só quando abertas (o app abre mais rápido e usa menos memória).
const DevicesPage = lazy(() => import('./pages/DevicesPage/DevicesPage.jsx'))
const DietPage = lazy(() => import('./pages/DietPage/DietPage.jsx'))
const MorePage = lazy(() => import('./pages/MorePage/MorePage.jsx'))
const ProgressPage = lazy(() => import('./pages/ProgressPage/ProgressPage.jsx'))
const WorkoutPage = lazy(() => import('./pages/WorkoutPage/WorkoutPage.jsx'))

// Abas principais (barra inferior no celular).
const TABS = [
  { id: 'home', label: 'Início', icon: 'home' },
  { id: 'devices', label: 'Aparelhos', icon: 'devices' },
  { id: 'diet', label: 'Dieta', icon: 'diet' },
  { id: 'workout', label: 'Treino', icon: 'workout' },
  { id: 'progress', label: 'Progresso', icon: 'progress' },
  { id: 'more', label: 'Mais', icon: 'more' },
]

// Preferências deste aparelho.
const DEFAULT_SETTINGS = {
  watchOwnerId: null, // de quem é o relógio (padrão: primeiro usuário)
  phoneOwnerId: null, // de quem é o celular: Health Connect e lembretes (padrão: primeiro usuário)
  mealReminders: true,
  weighReminder: { enabled: false, time: '07:00' },
  waterReminder: DEFAULT_WATER_REMINDER, // lembrete de beber água
  alarm: DEFAULT_ALARM, // estilo, som, volume, vibração, luz e "adiar" dos lembretes
  theme: 'auto', // 'auto' (igual ao sistema), 'light' ou 'dark'
}

export default function App() {
  const [tab, setTab] = useState('home')
  const [moreSection, setMoreSection] = useState('profile')
  const usersApi = useUsers()
  const { users, currentUser, loaded } = usersApi

  // Preferências guardadas, completadas com os padrões.
  const [storedSettings, setStoredSettings] = usePersistentState('hubSaude.settings', DEFAULT_SETTINGS)
  const settings = useMemo(
    () => ({
      ...DEFAULT_SETTINGS,
      ...storedSettings,
      weighReminder: { ...DEFAULT_SETTINGS.weighReminder, ...storedSettings.weighReminder },
      waterReminder: { ...DEFAULT_SETTINGS.waterReminder, ...storedSettings.waterReminder },
      alarm: { ...DEFAULT_SETTINGS.alarm, ...storedSettings.alarm },
    }),
    [storedSettings],
  )
  const updateSettings = useCallback(
    (patch) => setStoredSettings((previous) => ({ ...previous, ...patch })),
    [setStoredSettings],
  )

  // Tema claro/escuro (aplicado no <html>; "auto" segue o sistema).
  const resolvedTheme = useTheme(settings.theme)
  const toggleTheme = () => updateSettings({ theme: resolvedTheme === 'dark' ? 'light' : 'dark' })

  // Donos dos aparelhos.
  const watchOwner = users.find((user) => user.userId === settings.watchOwnerId) ?? users[0] ?? null
  const phoneOwner = users.find((user) => user.userId === settings.phoneOwnerId) ?? users[0] ?? null

  // De quem é cada pesagem: um usuário só → dele; vários → o peso mais próximo (ou pergunta).
  const resolveOwner = useCallback(
    async (reading) => {
      if (users.length <= 1) return { userId: users[0]?.userId ?? DEFAULT_USER_ID, needsConfirmation: false, candidates: [] }
      const lastWeights = latestWeightByUser(await listAllMeasurements())
      return assignWeighing({
        weightKg: reading.weightKg,
        users: users.map((user) => ({ userId: user.userId, name: user.name, lastWeightKg: lastWeights.get(user.userId) ?? null })),
      })
    },
    [users],
  )

  const scale = useScale({ resolveOwner })
  // O perfil e as metas do dono do relógio vão para ele automaticamente (ao salvar e ao conectar).
  const watch = useWatch({ ownerId: watchOwner?.userId, owner: watchOwner })
  const healthConnect = useHealthConnect({ profile: phoneOwner })
  // Lembretes do celular: plano alimentar de quem é dono dele.
  const phoneDiet = useDiet(phoneOwner?.userId ?? null)
  // Água do dono do celular: a meta vai no texto do lembrete e o "Bebi" registra para ele.
  const phoneWater = useWater(phoneOwner)
  const { add: addWater } = phoneWater
  const { plan: phonePlan, setMealStatus } = phoneDiet
  const glassMl = settings.waterReminder.glassMl

  /** Ações dos alarmes (botões da notificação ou do alarme em tela cheia). */
  const handleAlarmAction = useCallback(
    (kind, actionId, extra) => {
      if (kind === 'water' && actionId === 'drink') addWater(glassMl)
      if (kind === 'meal' && (actionId === 'done' || actionId === 'off')) {
        const entry = mealsOfDay(phonePlan, Date.now()).find((item) => item.meal.id === extra.mealId)
        if (entry) void setMealStatus(entry, actionId)
      }
    },
    [addWater, glassMl, phonePlan, setMealStatus],
  )
  const reminders = useReminders({ plan: phonePlan, settings, waterGoalMl: phoneWater.goal.goalMl, onAction: handleAlarmAction })
  // Treino em andamento (GPS e cronômetro continuam ao trocar de aba).
  const recorder = useWorkoutRecorder()

  /** Atalho para o cadastro/troca de perfil. */
  const goToProfile = () => {
    setMoreSection('profile')
    setTab('more')
  }

  const isWatchOwner = Boolean(currentUser && currentUser.userId === watchOwner?.userId)

  // Conteúdo da aba atual (Início, Dieta, Treino e Progresso precisam de um perfil).
  let content
  if (!loaded) {
    content = <p>Carregando…</p>
  } else if (!currentUser && ['home', 'diet', 'workout', 'progress'].includes(tab)) {
    content = (
      <div className={ui.card}>
        <h2 className={ui.cardTitle}>Bem-vindo ao Hub de Saúde</h2>
        <p>Crie o seu perfil (nome, altura, data de nascimento e sexo) para começar.</p>
        <button type="button" className={`${ui.button} ${ui.buttonPrimary}`} onClick={goToProfile}>
          Criar perfil
        </button>
      </div>
    )
  } else if (tab === 'home') {
    content = <HomePage user={currentUser} scale={scale} watch={watch} isWatchOwner={isWatchOwner} onNavigate={setTab} />
  } else if (tab === 'devices') {
    content = (
      <DevicesPage
        scale={scale}
        watch={watch}
        user={currentUser}
        users={users}
        watchOwner={watchOwner}
        onWatchOwnerChange={(userId) => updateSettings({ watchOwnerId: userId })}
        onEditProfile={goToProfile}
      />
    )
  } else if (tab === 'diet') {
    content = <DietPage key={currentUser.userId} user={currentUser} />
  } else if (tab === 'workout') {
    content = <WorkoutPage key={currentUser.userId} user={currentUser} recorder={recorder} />
  } else if (tab === 'progress') {
    content = <ProgressPage key={currentUser.userId} user={currentUser} onEditProfile={goToProfile} />
  } else {
    content = (
      <MorePage
        section={moreSection}
        onSectionChange={setMoreSection}
        usersApi={usersApi}
        watch={watch}
        isWatchOwner={isWatchOwner}
        reminders={reminders}
        settings={settings}
        onSettingsChange={updateSettings}
        healthConnect={healthConnect}
        phoneOwner={phoneOwner}
      />
    )
  }

  return (
    <Layout
      tabs={TABS}
      current={tab}
      onNavigate={setTab}
      userName={currentUser?.name ?? null}
      onOpenUser={goToProfile}
      theme={resolvedTheme}
      onToggleTheme={toggleTheme}
    >
      {/* Aviso de treino gravando enquanto o usuário está em outra aba. */}
      {recorder.recording && tab !== 'workout' && (
        <RecordingBanner type={recorder.live.type} paused={recorder.recording.status === 'paused'} onOpen={() => setTab('workout')} />
      )}
      <Suspense fallback={<p>Carregando…</p>}>{content}</Suspense>

      {/* Alarme em tela cheia (lembrete na hora, com o app aberto). */}
      {reminders.activeAlarm && (
        <AlarmOverlay alarm={reminders.activeAlarm} settings={settings.alarm} glassMl={glassMl} onResolve={reminders.resolveAlarm} />
      )}
    </Layout>
  )
}
