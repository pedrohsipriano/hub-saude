// Cópia local das noites de sono que vieram do relógio.
// O relógio entrega as noites guardadas UMA vez e depois as apaga. No log HCI de 17/10/2026, o primeiro pedido
// 0x4F trouxe 7 noites de uma vez (7 quadros seguidos), e todos os pedidos seguintes voltaram "sem dados".
// Por isso cada noite recebida vai na hora para o localStorage, que funciona mesmo com o app em segundo plano
// (quando o Android congela o banco IndexedDB), e é regravada no banco toda vez que o app abre. Gravar de novo
// não duplica: a chave da linha no banco é fixa. A cópia também guarda as fases da noite, para o gráfico.

export const SLEEP_BACKUP_KEY = 'hubSaude.watch.sleepNights'
// Noites guardadas (as mais recentes).
const MAX_NIGHTS = 60

/**
 * Noite em formato compacto: fases como [fase, minutos].
 * @param {object} sleep - de parseSleep()
 */
export function compactNight(sleep) {
  return {
    startMs: sleep.startMs,
    endMs: sleep.endMs,
    asleepMinutes: sleep.asleepMinutes,
    deepMinutes: sleep.deepMinutes,
    lightMinutes: sleep.lightMinutes,
    awakeMinutes: sleep.awakeMinutes,
    stages: (sleep.stages ?? []).map((entry) => [entry.stage, entry.minutes]),
  }
}

/** Formato compacto → noite com as fases e o horário de início de cada uma (como parseSleep). */
export function expandNight(night) {
  let cursor = night.startMs
  const stages = (night.stages ?? []).map(([stage, minutes]) => {
    const entry = { stage, minutes, startMs: cursor }
    cursor += minutes * 60000
    return entry
  })
  return { ...night, stages }
}

/**
 * Junta noites novas às guardadas: uma por horário de acordar (a nova vence) e só as mais recentes.
 * @param {Array<object>} saved - compactas
 * @param {Array<object>} incoming - compactas
 * @param {number} [max]
 * @returns {Array<object>} em ordem cronológica
 */
export function mergeSleepNights(saved, incoming, max = MAX_NIGHTS) {
  const byEnd = new Map(saved.map((night) => [night.endMs, night]))
  for (const night of incoming) byEnd.set(night.endMs, night)
  return [...byEnd.values()].sort((a, b) => a.endMs - b.endMs).slice(-max)
}

/** Noites guardadas neste aparelho (vazio se não houver ou se o armazenamento falhar). */
export function loadSleepBackup() {
  try {
    const saved = JSON.parse(localStorage.getItem(SLEEP_BACKUP_KEY) ?? '[]')
    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

/** Guarda as noites (ignora falhas de armazenamento). */
export function saveSleepBackup(nights) {
  try {
    localStorage.setItem(SLEEP_BACKUP_KEY, JSON.stringify(nights))
  } catch {
    // Sem armazenamento local, as noites ficam só no banco.
  }
}
