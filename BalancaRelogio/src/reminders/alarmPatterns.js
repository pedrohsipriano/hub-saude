// Desenho de cada som de alarme (notas: frequência em Hz, duração e pausa em segundos).
// Usado em dois lugares, para soarem iguais:
//   - scripts/alarm-sounds.mjs gera os .wav do Android (android/app/src/main/res/raw/hub_<id>.wav);
//   - reminders/alarmSound.js toca o mesmo som no app (alarme na tela e botão "Testar").
export const SOUND_PATTERNS = {
  // Dois tons alternados, insistente (como despertador).
  alarme: {
    wave: 'square',
    gain: 0.35,
    decay: false,
    pauseMs: 500,
    notes: Array.from({ length: 4 }, () => [
      { f: 880, d: 0.16, gap: 0.04 },
      { f: 660, d: 0.16, gap: 0.04 },
    ]).flat(),
  },
  // Três notas subindo (dó, mi, sol), com o som sumindo aos poucos.
  suave: {
    wave: 'sine',
    gain: 0.6,
    decay: true,
    pauseMs: 1500,
    notes: [
      { f: 523.25, d: 0.4, gap: 0 },
      { f: 659.25, d: 0.4, gap: 0 },
      { f: 783.99, d: 0.8, gap: 0 },
    ],
  },
  // Dois bipes curtos.
  bip: {
    wave: 'sine',
    gain: 0.6,
    decay: false,
    pauseMs: 1200,
    notes: [
      { f: 1000, d: 0.12, gap: 0.1 },
      { f: 1000, d: 0.12, gap: 0 },
    ],
  },
}
