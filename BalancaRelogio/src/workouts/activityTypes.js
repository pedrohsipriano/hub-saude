// Tipos de exercício. "gps" = grava trajeto e distância; "pace" = mostra ritmo (min/km) em vez de velocidade.
// MET (gasto relativo ao repouso) aproximado do Compendium of Physical Activities, para estimar calorias.
// maxSpeed (m/s) descarta saltos de GPS impossíveis para aquele exercício.
// simSpeed (m/s) é a velocidade do trajeto simulado (teste no PC).

export const ACTIVITY_TYPES = [
  { id: 'run', label: 'Corrida', gps: true, pace: true, met: 9.8, maxSpeed: 8, simSpeed: 3 },
  { id: 'walk', label: 'Caminhada', gps: true, pace: true, met: 3.8, maxSpeed: 3.5, simSpeed: 1.4 },
  { id: 'hike', label: 'Trilha', gps: true, pace: true, met: 6.0, maxSpeed: 3.5, simSpeed: 1.1 },
  { id: 'ride', label: 'Pedalada', gps: true, pace: false, met: 7.5, maxSpeed: 25, simSpeed: 6 },
  { id: 'gym', label: 'Musculação', gps: false, pace: false, met: 5.0 },
  // Artes marciais em ritmo moderado (Compendium 15430: judô, caratê, kickboxing, Muay Thai).
  { id: 'muaythai', label: 'Muay Thai', gps: false, pace: false, met: 10.3 },
  { id: 'treadmill', label: 'Esteira', gps: false, pace: false, met: 8.0 },
  { id: 'swim', label: 'Natação', gps: false, pace: false, met: 6.0 },
  { id: 'yoga', label: 'Yoga / alongamento', gps: false, pace: false, met: 2.5 },
  { id: 'other', label: 'Outro', gps: false, pace: false, met: 4.0 },
]

/** Tipo pelo id (padrão: "Outro"). */
export function activityType(id) {
  return ACTIVITY_TYPES.find((type) => type.id === id) ?? ACTIVITY_TYPES.at(-1)
}

/** Nome padrão da atividade pelo horário: "Corrida da manhã". */
export function defaultWorkoutName(typeId, startedAt) {
  const hour = new Date(startedAt).getHours()
  const period = hour < 5 ? 'madrugada' : hour < 12 ? 'manhã' : hour < 18 ? 'tarde' : 'noite'
  return `${activityType(typeId).label} da ${period}`
}
