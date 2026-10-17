// Formatação dos números de treino no padrão brasileiro: tempo, distância, ritmo e velocidade.

/** Duração em "1:02:03" (com horas) ou "32:10". */
export function formatDuration(ms) {
  if (ms == null || Number.isNaN(ms)) return '--'
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

/** Distância em km com 2 casas ("5,23"). */
export function formatKm(meters) {
  if (meters == null) return '--'
  return (meters / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Ritmo (segundos por km) em "5:12"; "--" se parado ou absurdo (> 60 min/km). */
export function formatPace(secondsPerKm) {
  if (secondsPerKm == null || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0 || secondsPerKm > 3600) return '--'
  const rounded = Math.round(secondsPerKm)
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`
}

/** Velocidade (m/s) em km/h com 1 casa ("18,4"). */
export function formatSpeed(metersPerSecond) {
  if (metersPerSecond == null || !Number.isFinite(metersPerSecond)) return '--'
  return (metersPerSecond * 3.6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** m/s → segundos por km (null se parado). */
export function speedToPace(metersPerSecond) {
  return metersPerSecond > 0.3 ? 1000 / metersPerSecond : null
}
