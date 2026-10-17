// Hook do percurso animado no mapa: o progresso vai de 0 a 1 em `durationMs` (≈ 25 quadros/s)
// e o hook devolve o trecho já percorrido e a posição do ponto. Com autoPlay, começa sozinho
// depois de `startDelayMs` (tempo para o mapa carregar).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cumulativeDistances, easeInOut, routeAtProgress, simplifyForReplay } from '../workouts/replay.js'

// Intervalo mínimo entre quadros desenhados (ms).
const FRAME_MS = 40

/**
 * @param {Array<object>} points - trajeto do treino
 * @param {{ durationMs?: number, autoPlay?: boolean, startDelayMs?: number }} [options]
 */
export function useRouteReplay(points, { durationMs = 10000, autoPlay = false, startDelayMs = 1200 } = {}) {
  const track = useMemo(() => simplifyForReplay(points ?? []), [points])
  const cumulative = useMemo(() => cumulativeDistances(track), [track])
  const canPlay = track.length > 1
  const [playing, setPlaying] = useState(false)
  // Com autoPlay o percurso começa vazio (só o ponto de partida) até a animação começar.
  const [progress, setProgress] = useState(autoPlay && canPlay ? 0 : 1)
  const progressRef = useRef(progress)

  // Início automático, com uma pequena espera (as opções não mudam depois da montagem).
  useEffect(() => {
    if (!autoPlay || !canPlay) return undefined
    const id = setTimeout(() => setPlaying(true), startDelayMs)
    return () => clearTimeout(id)
  }, [autoPlay, canPlay, startDelayMs])

  // Laço da animação (requestAnimationFrame), retomando de onde parou.
  useEffect(() => {
    if (!playing) return undefined
    const from = progressRef.current >= 1 ? 0 : progressRef.current
    const startedAt = performance.now() - from * durationMs
    let lastFrame = 0
    let frame = 0
    const tick = (now) => {
      const t = Math.min(1, (now - startedAt) / durationMs)
      if (now - lastFrame >= FRAME_MS || t === 1) {
        lastFrame = now
        progressRef.current = t
        setProgress(t)
      }
      if (t < 1) frame = requestAnimationFrame(tick)
      else setPlaying(false)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, durationMs])

  /** Toca (do começo, se já tinha terminado). */
  const play = useCallback(() => {
    if (canPlay) setPlaying(true)
  }, [canPlay])

  const pause = useCallback(() => setPlaying(false), [])

  /** Pula para o fim (mostra o trajeto inteiro). */
  const skip = useCallback(() => {
    setPlaying(false)
    progressRef.current = 1
    setProgress(1)
  }, [])

  const view = useMemo(() => routeAtProgress(track, easeInOut(progress), cumulative), [track, progress, cumulative])

  // "active": a animação está em curso ou pausada no meio (o mapa mostra só o trecho percorrido).
  return { playing, active: canPlay && progress < 1, progress, view, canPlay, play, pause, skip }
}
