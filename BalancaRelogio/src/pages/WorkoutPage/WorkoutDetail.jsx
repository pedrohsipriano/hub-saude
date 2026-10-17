// Detalhe de um treino salvo: percurso animado no mapa (o ponto anda até o fim, como o flyover do Strava),
// trajeto original ou ajustado às ruas (Roads API), compartilhar (vídeo/imagem), números, parciais,
// renomear e apagar.
import { useState } from 'react'
import ProgressBar from '../../components/ProgressBar/ProgressBar.jsx'
import LazyRouteMap from '../../components/RouteMap/LazyRouteMap.jsx'
import SubNav from '../../components/SubNav/SubNav.jsx'
import { GOOGLE_MAPS_API_KEY } from '../../integrations/google/googleConfig.js'
import { snapTrackToRoads } from '../../integrations/google/roads.js'
import { useRouteReplay } from '../../hooks/useRouteReplay.js'
import ui from '../../styles/controls.module.css'
import { formatDate, formatNumber, formatTime } from '../../utils/format.js'
import { activityType } from '../../workouts/activityTypes.js'
import { formatDuration, formatKm, formatPace, formatSpeed } from '../../workouts/format.js'
import ShareWorkout from './ShareWorkout.jsx'
import styles from './WorkoutPage.module.css'

// Escolha do traço mostrado no mapa quando existe o ajustado às ruas.
const ROUTE_VIEWS = [
  { id: 'snapped', label: 'Ajustado às ruas' },
  { id: 'original', label: 'GPS original' },
]
// Zoom da câmera que acompanha o ponto no percurso animado.
const REPLAY_ZOOM = 15

/**
 * @param {object} props
 * @param {object} props.workout
 * @param {() => void} props.onBack
 * @param {(name: string) => Promise<void>} props.onRename
 * @param {(patch: object) => Promise<void>} props.onUpdate - grava campos novos no treino
 * @param {() => Promise<void>} props.onDelete
 * @param {boolean} [props.autoReplay] - toca o percurso animado ao abrir (logo depois de salvar)
 */
export default function WorkoutDetail({ workout, onBack, onRename, onUpdate, onDelete, autoReplay = false }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(workout.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const type = activityType(workout.type)
  const hasRoute = workout.points?.length > 1

  // Ajuste às ruas (Roads API do Google): só com a chave do Google e trajeto de GPS.
  const [routeView, setRouteView] = useState('snapped')
  const [snap, setSnap] = useState({ busy: false, error: null })
  const snapped = workout.snappedPoints?.length > 1 ? workout.snappedPoints : null
  const mapPoints = snapped && routeView === 'snapped' ? snapped : workout.points
  const canSnap = hasRoute && Boolean(GOOGLE_MAPS_API_KEY)

  // Percurso animado: enquanto toca, o mapa mostra só o trecho percorrido e segue o ponto.
  const replay = useRouteReplay(mapPoints, { autoPlay: autoReplay && hasRoute })

  /** Pede o trajeto ajustado às ruas e guarda junto do treino (o original continua salvo). */
  const handleSnap = async () => {
    setSnap({ busy: true, error: null })
    try {
      const result = await snapTrackToRoads(workout.points, { apiKey: GOOGLE_MAPS_API_KEY })
      if (result.length < 2) throw new Error('nenhuma rua encontrada perto do trajeto')
      await onUpdate({ snappedPoints: result })
      setRouteView('snapped')
      setSnap({ busy: false, error: null })
    } catch (error) {
      setSnap({ busy: false, error: `Não foi possível ajustar às ruas: ${error.message}` })
    }
  }

  // Parciais: velocidade de cada km (a barra compara com o km mais rápido).
  const splits = (workout.splits ?? []).map((split) => ({ ...split, speed: split.distanceM / (split.durationMs / 1000) }))
  const fastest = Math.max(...splits.map((split) => split.speed), 0)

  /** Salva o nome novo. */
  const saveName = async () => {
    await onRename(name)
    setEditing(false)
  }

  return (
    <section>
      <button type="button" className={styles.back} onClick={onBack}>
        ← Atividades
      </button>

      <div className={ui.card}>
        {editing ? (
          <div className={ui.field}>
            <label className={ui.label} htmlFor="workout-name">
              Nome do treino
            </label>
            <input id="workout-name" className={ui.input} value={name} onChange={(event) => setName(event.target.value)} />
            <div className={ui.actions}>
              <button type="button" className={`${ui.button} ${ui.buttonPrimary}`} onClick={saveName}>
                Salvar
              </button>
              <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={() => setEditing(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.liveHeader}>
            <h2 className={ui.cardTitle}>{workout.name}</h2>
            <button type="button" className={styles.back} onClick={() => setEditing(true)}>
              Renomear
            </button>
          </div>
        )}
        <p className={ui.hint}>
          {type.label} · {formatDate(workout.startedAt)} das {formatTime(workout.startedAt)} às {formatTime(workout.endedAt)}
        </p>
      </div>

      {hasRoute && (
        <>
          {snapped && <SubNav items={ROUTE_VIEWS} current={routeView} onChange={setRouteView} label="Traço do mapa" />}
          <LazyRouteMap
            points={replay.active ? replay.view.points : mapPoints}
            current={replay.active ? replay.view.head : null}
            follow={replay.active}
            followZoom={REPLAY_ZOOM}
          />
          <div className={ui.actions}>
            {/* Controles do percurso animado. */}
            {replay.active ? (
              <>
                <button type="button" className={`${ui.button} ${ui.buttonPrimary}`} onClick={replay.playing ? replay.pause : replay.play}>
                  {replay.playing ? 'Pausar' : 'Continuar'}
                </button>
                <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={replay.skip}>
                  Pular para o fim
                </button>
              </>
            ) : (
              <button type="button" className={`${ui.button} ${ui.buttonPrimary}`} onClick={replay.play}>
                Rever percurso
              </button>
            )}
            {canSnap && !snapped && (
              <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} disabled={snap.busy} onClick={handleSnap}>
                {snap.busy ? 'Ajustando…' : 'Ajustar trajeto às ruas'}
              </button>
            )}
          </div>
          {canSnap && !snapped && (
            <p className={ui.hint}>Encaixa o traço nas ruas (Roads API do Google). Bom para pedal e corrida na rua; em trilha e parque, o GPS original costuma ser melhor.</p>
          )}
          {snap.error && <p className={ui.error}>{snap.error}</p>}
        </>
      )}

      <ShareWorkout workout={workout} />

      <div className={ui.card}>
        <div className={styles.stats}>
          {workout.distanceM > 0 && (
            <div className={styles.stat}>
              <span className={styles.statLabel}>Distância</span>
              <span className={styles.statValue}>{formatKm(workout.distanceM)} km</span>
            </div>
          )}
          <div className={styles.stat}>
            <span className={styles.statLabel}>Tempo em movimento</span>
            <span className={styles.statValue}>{formatDuration(workout.movingTimeMs)}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Tempo total</span>
            <span className={styles.statValue}>{formatDuration(workout.elapsedMs)}</span>
          </div>
          {workout.distanceM > 0 && (
            <div className={styles.stat}>
              <span className={styles.statLabel}>{type.pace ? 'Ritmo médio' : 'Velocidade média'}</span>
              <span className={styles.statValue}>
                {type.pace ? `${formatPace(workout.paceSecPerKm)} /km` : `${formatSpeed(workout.avgSpeedMs)} km/h`}
              </span>
            </div>
          )}
          {hasRoute && (
            <div className={styles.stat}>
              <span className={styles.statLabel}>Subida</span>
              <span className={styles.statValue}>{workout.elevationGainM} m</span>
            </div>
          )}
          <div className={styles.stat}>
            <span className={styles.statLabel}>Calorias</span>
            <span className={styles.statValue}>{workout.calories} kcal</span>
          </div>
        </div>
        <p className={ui.hint}>
          Calorias estimadas pelo tipo de exercício (MET) × {workout.weightKnown ? 'o seu último peso' : '70 kg (pese-se para estimar melhor)'} × tempo em
          movimento.
        </p>
      </div>

      {splits.length > 0 && (
        <div className={ui.card}>
          <h3 className={ui.cardTitle}>Parciais</h3>
          <div className={ui.tableWrapper}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Km</th>
                  <th>{type.pace ? 'Ritmo' : 'Velocidade'}</th>
                  <th className={styles.splitBarCell}>Comparação</th>
                </tr>
              </thead>
              <tbody>
                {splits.map((split) => (
                  <tr key={split.index}>
                    <td>{split.distanceM >= 1000 ? split.index : formatNumber(split.index - 1 + split.distanceM / 1000, 2)}</td>
                    <td>{type.pace ? `${formatPace(1000 / split.speed)} /km` : `${formatSpeed(split.speed)} km/h`}</td>
                    <td className={styles.splitBarCell}>
                      <ProgressBar value={split.speed} max={fastest} label={`Km ${split.index}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className={ui.actions}>
        {confirmDelete ? (
          <>
            <button type="button" className={`${ui.button} ${styles.dangerButton}`} onClick={onDelete}>
              Apagar de vez
            </button>
            <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={() => setConfirmDelete(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={() => setConfirmDelete(true)}>
            Apagar treino
          </button>
        )}
      </div>
    </section>
  )
}
