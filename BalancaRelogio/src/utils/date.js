// Datas e horários sem fuso: idade a partir do nascimento e horários "HH:MM".

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Idade completa em anos a partir de "AAAA-MM-DD".
 * @param {string | undefined} birthDate
 * @param {number} [at] - momento de referência
 * @returns {number | null}
 */
export function ageFromBirthDate(birthDate, at = Date.now()) {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null
  const [year, month, day] = birthDate.split('-').map(Number)
  const ref = new Date(at)
  let age = ref.getFullYear() - year
  // Ainda não fez aniversário neste ano.
  if (ref.getMonth() + 1 < month || (ref.getMonth() + 1 === month && ref.getDate() < day)) age -= 1
  return age
}

/** "07:30" → 450 (minutos desde a meia-noite); null se inválido. */
export function parseTime(text) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text ?? '')
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

/** 450 → "07:30". */
export function formatClock(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/** Timestamp de um horário "HH:MM" no dia de `dayMs` (hora local). */
export function timeOnDay(dayMs, totalMinutes) {
  const day = new Date(dayMs)
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, totalMinutes).getTime()
}

/** Timestamp de N dias atrás. */
export function daysAgo(days, now = Date.now()) {
  return now - days * DAY_MS
}

export { DAY_MS }
