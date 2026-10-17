// Gera os sons de alarme do Android (WAV 16 bits, mono, 44,1 kHz) a partir de src/reminders/alarmPatterns.js.
// Uso: npm run alarm:sounds  → android/app/src/main/res/raw/hub_<id>.wav
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SOUND_PATTERNS } from '../src/reminders/alarmPatterns.js'

const SAMPLE_RATE = 44100
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'android', 'app', 'src', 'main', 'res', 'raw')

/** Amostra de uma onda (seno ou quadrada) no instante t. */
function waveAt(wave, frequency, t) {
  const phase = Math.sin(2 * Math.PI * frequency * t)
  return wave === 'square' ? Math.sign(phase) : phase
}

/** Sintetiza o desenho de som (uma vez, sem a pausa do laço) em amostras de -1 a 1. */
function synthesize(pattern) {
  const samples = []
  for (const note of pattern.notes) {
    const length = Math.round(note.d * SAMPLE_RATE)
    const fade = Math.round(0.005 * SAMPLE_RATE) // 5 ms de entrada/saída: sem estalos
    for (let i = 0; i < length; i += 1) {
      const t = i / SAMPLE_RATE
      let envelope = Math.min(1, i / fade, (length - i) / fade)
      if (pattern.decay) envelope *= Math.exp(-3 * (i / length))
      samples.push(waveAt(pattern.wave, note.f, t) * envelope * pattern.gain)
    }
    for (let i = 0; i < Math.round(note.gap * SAMPLE_RATE); i += 1) samples.push(0)
  }
  return samples
}

/** Monta o arquivo WAV (PCM 16 bits mono). */
function toWav(samples) {
  const data = Buffer.alloc(samples.length * 2)
  samples.forEach((value, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), i * 2))
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // tamanho do bloco fmt
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * 2, 28) // bytes por segundo
  header.writeUInt16LE(2, 32) // bytes por amostra
  header.writeUInt16LE(16, 34) // bits por amostra
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

mkdirSync(OUT_DIR, { recursive: true })
for (const [id, pattern] of Object.entries(SOUND_PATTERNS)) {
  const file = join(OUT_DIR, `hub_${id}.wav`)
  writeFileSync(file, toWav(synthesize(pattern)))
  console.log(`gerado ${file}`)
}
