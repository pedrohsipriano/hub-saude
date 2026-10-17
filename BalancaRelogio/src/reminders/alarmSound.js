// Toca o som de alarme no app (Web Audio), no volume escolhido, repetindo até parar (no máximo 60 s).
// Mesmo desenho de som dos arquivos do Android (alarmPatterns.js).
import { SOUND_PATTERNS } from './alarmPatterns.js'

const MAX_MS = 60000

/**
 * @param {string} soundId - 'alarme' | 'suave' | 'bip' | 'silencioso'
 * @param {{ volume?: number, loop?: boolean }} [options] - volume de 0 a 100
 * @returns {() => void} função que para o som
 */
export function playAlarmSound(soundId, { volume = 80, loop = true } = {}) {
  const pattern = SOUND_PATTERNS[soundId]
  const AudioContextClass = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null
  if (!pattern || !AudioContextClass || volume <= 0) return () => {}

  const ctx = new AudioContextClass()
  const master = ctx.createGain()
  master.gain.value = (Math.min(100, volume) / 100) * pattern.gain
  master.connect(ctx.destination)
  let stopped = false
  let timer = null

  /** Toca o desenho uma vez; devolve a duração em ms. */
  const playOnce = () => {
    const begin = ctx.currentTime + 0.05
    let t = begin
    for (const note of pattern.notes) {
      const oscillator = ctx.createOscillator()
      const envelope = ctx.createGain()
      oscillator.type = pattern.wave
      oscillator.frequency.value = note.f
      // Entrada/saída rápidas (sem estalo) e, no "suave", o som sumindo aos poucos.
      envelope.gain.setValueAtTime(0, t)
      envelope.gain.linearRampToValueAtTime(1, t + 0.005)
      envelope.gain.setValueAtTime(1, t + note.d - 0.01)
      if (pattern.decay) envelope.gain.exponentialRampToValueAtTime(0.05, t + note.d)
      envelope.gain.linearRampToValueAtTime(0, t + note.d)
      oscillator.connect(envelope).connect(master)
      oscillator.start(t)
      oscillator.stop(t + note.d)
      t += note.d + note.gap
    }
    return (t - begin) * 1000
  }

  const cycle = () => {
    if (stopped) return
    const duration = playOnce()
    if (loop) timer = setTimeout(cycle, duration + pattern.pauseMs)
  }

  const stop = () => {
    if (stopped) return
    stopped = true
    clearTimeout(timer)
    clearTimeout(limit)
    ctx.close().catch(() => {})
  }
  const limit = setTimeout(stop, MAX_MS)
  ctx.resume?.().catch(() => {})
  cycle()
  return stop
}
