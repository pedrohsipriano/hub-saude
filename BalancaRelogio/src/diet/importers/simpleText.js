// Leitor genérico (reserva): para PDFs que não são do WebDiet.
// Reconhece títulos de refeição pelo nome ("Almoço") ou por horário ("12:30 Almoço")
// e trata cada linha seguinte como um item. "A | B" ou "A ou B" viram principal + substituto.
import { pageToLines } from '../pdf/layout.js'
import { MEAL_NAME_PATTERNS } from './mealTimes.js'
import { normalizeName } from './webDiet.js'

/** Título com horário: "12:30 Almoço", "7h00 - Café da manhã". */
const TIMED_HEADING = /^(\d{1,2})[:hH](\d{2})\s*[-–:]?\s*(.{2,40})$/

/** Linha curta que é só o nome de uma refeição conhecida. */
function isMealName(text) {
  return text.length <= 40 && !/\d/.test(text) && MEAL_NAME_PATTERNS.some(([pattern]) => pattern.test(text))
}

export const simpleTextImporter = {
  id: 'texto',
  label: 'Texto genérico',

  /** Reserva: aceita qualquer PDF com texto. */
  detect(pages) {
    return pages.some((page) => page.items.length > 0)
  },

  parse(pages) {
    const meals = []
    let option = null
    for (const line of pages.flatMap(pageToLines)) {
      if (line.region !== 'body') continue
      const timed = TIMED_HEADING.exec(line.text)
      if (timed || isMealName(line.text)) {
        const name = timed ? timed[3].trim() : line.text
        option = { label: 'Opção 1', items: [], notes: '' }
        meals.push({
          id: normalizeName(name) || `refeicao-${meals.length + 1}`,
          name,
          time: timed ? `${timed[1].padStart(2, '0')}:${timed[2]}` : undefined,
          options: [option],
        })
        continue
      }
      if (!option) continue
      // "Arroz | Macarrão" ou "Arroz ou Macarrão" → principal + substituto.
      const [main, ...substitutes] = line.text.split(/\s+\|\s+|\s+ou\s+/i).map((part) => part.trim())
      if (main) option.items.push({ main, substitutes })
    }
    return { prescribedBy: '', prescribedAt: '', guidelines: [], shoppingList: [], meals }
  },
}
