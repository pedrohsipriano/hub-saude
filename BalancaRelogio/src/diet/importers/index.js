// Importação de planos alimentares em PDF: escolhe o leitor do formato e devolve o plano pronto.
// Para aceitar um formato novo, crie um leitor { id, label, detect(pages), parse(pages) }
// e coloque-o na lista ANTES do leitor genérico (que aceita qualquer PDF).
import { normalizePlan } from '../dietPlan.js'
import { assignMealTimes } from './mealTimes.js'
import { simpleTextImporter } from './simpleText.js'
import { normalizeName, webDietImporter } from './webDiet.js'

// Ordem de tentativa: o WebDiet é o modelo principal; o genérico é a reserva.
export const DIET_IMPORTERS = [webDietImporter, simpleTextImporter]

/**
 * @param {Array<object>} pages - páginas extraídas por extractPdfPages()
 * @param {{ previousPlan?: object | null }} [options] - plano atual (para manter os horários)
 * @returns {{ importer: string, label: string, plan: object, warnings: string[] }}
 * @throws {Error} quando nenhuma refeição é reconhecida
 */
export function importDietFromPages(pages, { previousPlan = null } = {}) {
  if (!pages.some((page) => page.items.length)) {
    throw new Error('O PDF não tem texto (é uma imagem escaneada?). Exporte o plano como PDF de texto.')
  }
  const importer = DIET_IMPORTERS.find((candidate) => candidate.detect(pages))
  const raw = importer.parse(pages)
  if (!raw.meals.length) throw new Error(`Nenhuma refeição foi reconhecida no PDF (leitor: ${importer.label}).`)

  const { plan, suggested } = assignMealTimes(raw, normalizeName, previousPlan)
  const warnings = []
  if (suggested.length) warnings.push(`Horários sugeridos (o PDF não tem horário): ${suggested.join(', ')}. Ajuste no editor.`)
  const empty = plan.meals.filter((meal) => meal.options.every((option) => !option.items.length)).map((meal) => meal.name)
  if (empty.length) warnings.push(`Refeições sem itens reconhecidos: ${empty.join(', ')}.`)

  return { importer: importer.id, label: importer.label, plan: normalizePlan(plan), warnings }
}
