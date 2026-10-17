// Testes do plano alimentar.
import { describe, expect, it } from 'vitest'
import { mealDoneKey, mealReminders, mealsOfDay, nextMeal, normalizePlan } from './dietPlan.js'

const RAW = {
  prescribedBy: 'Nutricionista Teste',
  meals: [
    {
      id: 'almoco',
      name: 'Almoço',
      time: '12:30',
      reminderText: 'Depois: 2 cápsulas de ômega-3',
      options: [
        {
          items: [
            { main: 'Arroz branco cozido - 5 Colher(es)', substitutes: ['Macarrão cozido - 5 Colher(es)'] },
            { main: 'Feijão carioca cozido - 2 Concha(s)', substitutes: [] },
          ],
        },
      ],
    },
    { id: 'cafe', name: 'Café da manhã', time: '7:00', options: [{ items: [{ main: 'Ovo - 2 unidades' }] }] },
  ],
}

describe('normalizePlan', () => {
  it('ordena por horário, completa campos e formata HH:MM', () => {
    const plan = normalizePlan(RAW)
    expect(plan.meals.map((m) => m.id)).toEqual(['cafe', 'almoco'])
    expect(plan.meals[0].time).toBe('07:00')
    expect(plan.meals[0].options[0].label).toBe('Opção 1')
    expect(plan.meals[0].options[0].items[0].substitutes).toEqual([])
  })

  it('recusa arquivo sem refeições ou com horário inválido', () => {
    expect(() => normalizePlan({})).toThrow(/meals/)
    expect(() => normalizePlan({ meals: [{ name: 'X', time: '25:00' }] })).toThrow(/Horário inválido/)
  })
})

describe('agenda do dia', () => {
  const plan = normalizePlan(RAW)
  const day = new Date(2026, 9, 16, 10).getTime()

  it('próxima refeição a partir de agora', () => {
    expect(nextMeal(plan, day).meal.id).toBe('almoco')
  })

  it('refeição feita sai da fila; depois da última, vem a primeira de amanhã', () => {
    const almoco = mealsOfDay(plan, day).find((entry) => entry.meal.id === 'almoco')
    const done = new Set([mealDoneKey('almoco', almoco.at)])
    expect(nextMeal(plan, day, done).meal.id).toBe('cafe')
    expect(nextMeal(plan, day, done).at).toBe(new Date(2026, 9, 17, 7, 0).getTime())
  })
})

describe('mealReminders', () => {
  it('um lembrete diário por refeição, com os itens e o texto extra', () => {
    const reminders = mealReminders(normalizePlan(RAW))
    expect(reminders[1]).toEqual({
      id: 1001,
      title: 'Hora do(a) almoço (12:30)',
      body: 'Arroz branco cozido, Feijão carioca cozido · Depois: 2 cápsulas de ômega-3',
      hour: 12,
      minute: 30,
    })
  })
})
