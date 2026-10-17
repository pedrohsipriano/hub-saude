// Horários sugeridos para refeições sem horário no PDF (o WebDiet não imprime horários).
// A ordem importa: "lanche da manhã" precisa vir antes de "lanche".
export const MEAL_NAME_PATTERNS = [
  [/caf[eé]/i, '07:00'],
  [/cola[cç][aã]o|lanche da manh[aã]/i, '10:00'],
  [/almo[cç]o/i, '12:00'],
  [/lanche|merenda/i, '15:30'],
  [/pr[eé].?treino/i, '17:30'],
  [/p[oó]s.?treino/i, '19:00'],
  [/faculdade|escola|trabalho/i, '19:30'],
  [/jantar/i, '21:00'],
  [/ceia/i, '22:30'],
]

/** "07:30" → 450. */
const toMinutes = (time) => {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/** 450 → "07:30". */
const toClock = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

/**
 * Completa os horários das refeições, em ordem:
 *   1. horário que veio do próprio arquivo;
 *   2. horário da refeição de mesmo nome no plano atual (para não perder os ajustes do usuário);
 *   3. sugestão pelo nome; sem sugestão, 1 h depois da refeição anterior.
 * Mantém a ordem do arquivo: um horário que não fique depois do anterior é empurrado.
 * @param {object} raw - plano lido do arquivo
 * @param {(name: string) => string} normalize - normalização de nomes para comparar
 * @param {object | null} [previousPlan]
 * @returns {{ plan: object, suggested: string[] }} suggested = refeições com horário sugerido
 */
export function assignMealTimes(raw, normalize, previousPlan = null) {
  const previousTimes = new Map((previousPlan?.meals ?? []).map((meal) => [normalize(meal.name), meal.time]))
  const suggested = []
  let last = -1
  const meals = raw.meals.map((meal) => {
    let time = meal.time ?? previousTimes.get(normalize(meal.name))
    if (!time) {
      time = MEAL_NAME_PATTERNS.find(([pattern]) => pattern.test(meal.name))?.[1] ?? toClock(Math.min(last + 60, 23 * 60 + 30))
      suggested.push(meal.name)
    }
    let minutes = toMinutes(time)
    if (minutes <= last) minutes = Math.min(last + 60, 23 * 60 + 30)
    last = minutes
    return { ...meal, time: toClock(minutes) }
  })
  return { plan: { ...raw, meals }, suggested }
}
