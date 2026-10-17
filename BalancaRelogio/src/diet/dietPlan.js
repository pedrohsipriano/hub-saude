// Plano alimentar: formato, validação, horários do dia e lembretes.
//
// Formato (o mesmo do arquivo importado, ex.: capturas/dieta/plano-alimentar.json):
// {
//   prescribedBy, prescribedAt, guidelines: string[], shoppingList: string[],
//   meals: [{ id, name, time: "HH:MM", reminderText?,
//             options: [{ label, items: [{ main, substitutes: string[] }], notes? }] }]
// }
// Cada linha da tabela da nutricionista vira um item: a opção principal e as substituições.
import { formatClock, parseTime, timeOnDay } from '../utils/date.js'

// Refeição "concluída" no banco local: origem e métrica das linhas do registro diário.
export const DIET_DEVICE = 'diet'
export const MEAL_DONE_METRIC = 'mealDone'

// Base dos IDs de notificação dos lembretes de refeição (números inteiros exigidos pelo Android).
const MEAL_NOTIFICATION_BASE = 1000

/** Texto limpo ou "". */
const text = (value) => (typeof value === 'string' ? value.trim() : '')

/**
 * Valida e normaliza um plano (ex.: vindo de um arquivo JSON).
 * @throws {Error} quando o formato não é reconhecido
 */
export function normalizePlan(raw) {
  if (!raw || !Array.isArray(raw.meals)) throw new Error('Arquivo sem a lista "meals" de refeições.')
  const meals = raw.meals.map((meal, index) => {
    const minutes = parseTime(meal.time)
    if (minutes == null) throw new Error(`Horário inválido na refeição "${meal.name ?? index + 1}" (use HH:MM).`)
    const options = (meal.options ?? []).map((option, optionIndex) => ({
      label: text(option.label) || `Opção ${optionIndex + 1}`,
      items: (option.items ?? [])
        .map((item) => ({ main: text(item.main), substitutes: (item.substitutes ?? []).map(text).filter(Boolean) }))
        .filter((item) => item.main),
      notes: text(option.notes),
    }))
    return {
      id: text(meal.id) || `refeicao-${index + 1}`,
      name: text(meal.name) || `Refeição ${index + 1}`,
      time: formatClock(minutes),
      reminderText: text(meal.reminderText),
      options: options.length ? options : [{ label: 'Opção 1', items: [], notes: '' }],
    }
  })
  return {
    prescribedBy: text(raw.prescribedBy),
    prescribedAt: text(raw.prescribedAt),
    guidelines: (raw.guidelines ?? []).map(text).filter(Boolean),
    shoppingList: (raw.shoppingList ?? []).map(text).filter(Boolean),
    meals: sortMeals(meals),
  }
}

/** Refeições em ordem de horário. */
export function sortMeals(meals) {
  return [...meals].sort((a, b) => parseTime(a.time) - parseTime(b.time))
}

/** Plano vazio, com a estrutura mínima. */
export function emptyPlan() {
  return { prescribedBy: '', prescribedAt: '', guidelines: [], shoppingList: [], meals: [] }
}

/**
 * Refeições de um dia com o horário real e se foram marcadas como feitas.
 * @param {object} plan
 * @param {number} dayMs - qualquer momento do dia desejado
 * @param {Set<string>} [doneIds] - refeições já marcadas (feitas ou fora do plano)
 * @param {Map<string, 'done' | 'off'>} [statuses] - situação de cada marcação (diet/adherence.js)
 * @returns {Array<{ meal: object, at: number, done: boolean, status: 'done' | 'off' | null }>}
 */
export function mealsOfDay(plan, dayMs, doneIds = new Set(), statuses = null) {
  return (plan?.meals ?? []).map((meal) => {
    const at = timeOnDay(dayMs, parseTime(meal.time))
    const key = mealDoneKey(meal.id, at)
    const done = doneIds.has(key)
    return { meal, at, done, status: statuses?.get(key) ?? (done ? 'done' : null) }
  })
}

/** Próxima refeição ainda não feita (hoje, a partir de agora; se acabou o dia, a primeira de amanhã). */
export function nextMeal(plan, now, doneIds = new Set()) {
  const today = mealsOfDay(plan, now, doneIds)
  // Refeição atrasada há até 1 h ainda conta como "agora".
  const pending = today.find((entry) => !entry.done && entry.at >= now - 60 * 60 * 1000)
  if (pending) return pending
  const tomorrow = mealsOfDay(plan, now + 24 * 60 * 60 * 1000)
  return tomorrow[0] ?? null
}

/** Chave estável de uma refeição em um dia (usada para marcar como feita). */
export function mealDoneKey(mealId, atMs) {
  return `${mealId}@${atMs}`
}

/** Resumo curto dos itens principais (para a notificação). */
export function mealSummary(meal, maxItems = 3) {
  const items = meal.options[0]?.items.map((item) => item.main.split(' - ')[0]) ?? []
  const shown = items.slice(0, maxItems).join(', ')
  return items.length > maxItems ? `${shown} e mais ${items.length - maxItems}` : shown
}

/**
 * Lembretes diários das refeições, no formato do plugin de notificações (repetem todo dia).
 * @returns {Array<{ id: number, title: string, body: string, hour: number, minute: number }>}
 */
export function mealReminders(plan) {
  return (plan?.meals ?? []).map((meal, index) => {
    const minutes = parseTime(meal.time)
    const body = [mealSummary(meal), meal.reminderText].filter(Boolean).join(' · ')
    return {
      id: MEAL_NOTIFICATION_BASE + index,
      title: `Hora do(a) ${meal.name.toLowerCase()} (${meal.time})`,
      body: body || 'Confira o seu plano alimentar.',
      hour: Math.floor(minutes / 60),
      minute: minutes % 60,
    }
  })
}

/** IDs que os lembretes de refeição podem ocupar (para cancelar os antigos). */
export function mealReminderIds(count = 50) {
  return Array.from({ length: count }, (_, index) => MEAL_NOTIFICATION_BASE + index)
}
