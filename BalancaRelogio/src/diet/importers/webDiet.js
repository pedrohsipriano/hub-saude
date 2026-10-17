// Leitor do PDF de plano alimentar do WebDiet (modelo principal).
//
// Layout (calibrado com um PDF real, 16/10/2026):
//   - cabeçalho: nome e registro do profissional; rodapé: "Página N/M | Paciente … | Prescrito em: dd/mm/aaaa."
//   - título de cada refeição em ~13,5 pt; "Jantar - Opção 2" é a 2ª opção do Jantar
//   - tabela "Opção principal | Opção de substituição" em ~7,5 pt; o item principal fica
//     centralizado na vertical em relação às suas substituições (rowspan)
//   - "• Opções de substituição para X:" seguido de alternativas separadas por "- ou -"
//   - "Observações:" curtas viram nota da refeição; as longas, orientações gerais
//   - "Lista de compras": um item por linha, depois de "◯"
import { TABLE_TEXT_MAX_SIZE, pageToLines } from '../pdf/layout.js'

// Títulos têm fonte grande.
const HEADING_MIN_SIZE = 12
// Até esta distância vertical, uma linha que começa com minúscula continua a célula de cima.
const WRAP_MAX_GAP = 12
// Observações até este tamanho viram nota da refeição.
const SHORT_NOTE_MAX = 200
// Distância vertical que separa parágrafos nas observações.
const PARAGRAPH_GAP = 16

/** Texto comparável: sem acentos, minúsculo, sem espaços/hífens. */
export function normalizeName(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** Identificador a partir do nome ("Café da manhã" → "cafe-da-manha"). */
function slug(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Texto todo em maiúsculas vira frase ("OU, COMER A FRUTA" → "Ou, comer a fruta"). */
export function sentenceCase(text) {
  const letters = text.replace(/[^A-Za-zÀ-ú]/g, '')
  if (letters.length < 6 || letters !== letters.toUpperCase()) return text
  const lower = text.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/** Junta as linhas quebradas de uma mesma célula (a linha de baixo começa com minúscula ou parêntese). */
function mergeWrapped(cells) {
  const merged = []
  for (const cell of [...cells].sort((a, b) => b.y - a.y)) {
    const previous = merged.at(-1)
    if (previous && previous.yLast - cell.y <= WRAP_MAX_GAP && /^[a-zà-ú(]/.test(cell.text)) {
      previous.text = `${previous.text} ${cell.text}`
      previous.yLast = cell.y
      previous.y = (previous.yFirst + cell.y) / 2
      previous.right = Math.max(previous.right, cell.right)
    } else {
      merged.push({ text: cell.text, y: cell.y, yFirst: cell.y, yLast: cell.y, right: cell.right })
    }
  }
  return merged
}

/**
 * Monta os itens de uma tabela: cada substituição vai para o item principal mais próximo
 * na vertical, na mesma página (o principal fica no meio das suas substituições).
 * Linhas que atravessam as duas colunas (o texto passa do início da coluna de substituição)
 * não têm substituições e ficam fora dessa busca.
 * @param {Array<object>} cells
 * @param {number} substituteColumnX - x onde começa a coluna "Opção de substituição"
 */
function resolveTable(cells, substituteColumnX) {
  const items = []
  const pages = [...new Set(cells.map((cell) => cell.page))]
  for (const page of pages) {
    const onPage = cells.filter((cell) => cell.page === page)
    const mains = mergeWrapped(onPage.filter((cell) => cell.column === 'left')).map((cell) => ({
      main: cell.text,
      substitutes: [],
      y: cell.y,
      fullWidth: cell.right > substituteColumnX,
    }))
    const candidates = mains.filter((main) => !main.fullWidth)
    for (const substitute of mergeWrapped(onPage.filter((cell) => cell.column === 'right'))) {
      const nearest = candidates.reduce(
        (best, main) => (!best || Math.abs(main.y - substitute.y) < Math.abs(best.y - substitute.y) ? main : best),
        null,
      )
      // Sem principal nesta página: continuação do último item da página anterior.
      const target = nearest ?? items.at(-1)
      if (target) target.substitutes.push(substitute.text)
    }
    items.push(...mains)
  }
  return items.map(({ main, substitutes }) => ({ main, substitutes }))
}

/** Junta as linhas das observações em parágrafos. */
function toParagraphs(lines) {
  const paragraphs = []
  let current = null
  for (const line of lines) {
    const startsNew =
      !current ||
      (line.page === current.page && current.y - line.y > PARAGRAPH_GAP) ||
      (line.page !== current.page && /[.!?:]$/.test(current.text))
    if (startsNew) {
      current = { text: line.text, y: line.y, page: line.page }
      paragraphs.push(current)
    } else {
      current.text = `${current.text} ${line.text}`
      current.y = line.y
      current.page = line.page
    }
  }
  return paragraphs.map((paragraph) => sentenceCase(paragraph.text))
}

export const webDietImporter = {
  id: 'webdiet',
  label: 'WebDiet',

  /** Reconhece pelo cabeçalho da tabela característico. */
  detect(pages) {
    const text = pages.flatMap((page) => page.items.map((item) => item.str)).join(' ')
    return /Opção principal/i.test(text) && /Opção de substituição/i.test(text)
  },

  /**
   * @returns {{ prescribedBy: string, prescribedAt: string, guidelines: string[], shoppingList: string[],
   *             meals: Array<{ id: string, name: string, reminderText?: string, options: Array<object> }> }}
   */
  parse(pages) {
    const lines = pages.flatMap(pageToLines)
    const meals = []
    const guidelines = []
    const shoppingList = []

    // Profissional (cabeçalho da 1ª página) e data da prescrição (rodapé).
    const header = lines.filter((line) => line.page === 1 && line.region === 'header').slice(0, 2)
    const prescribedBy = header.map((line) => line.text).join(' — ')
    const prescribedAt = lines.map((line) => /Prescrito em:\s*(\d{2}\/\d{2}\/\d{4})/i.exec(line.text)?.[1]).find(Boolean) ?? ''

    // Estado da leitura.
    let mode = 'none' // 'table' | 'notes' | 'subs' | 'shopping'
    let pendingHeading = null
    let option = null
    let cells = []
    let notes = []
    let subsTarget = null
    let subsText = []
    // Início da coluna de substituição (lido do cabeçalho da tabela; padrão: meio da página).
    let substituteColumnX = (pages[0]?.width ?? 595) * 0.5

    /** Fecha a tabela em leitura. */
    const flushTable = () => {
      if (option && cells.length) option.items.push(...resolveTable(cells, substituteColumnX))
      cells = []
    }
    /** Aplica o bloco "Opções de substituição para X". */
    const flushSubs = () => {
      if (option && subsTarget && subsText.length) {
        const target = option.items.find((item) => normalizeName(item.main).startsWith(normalizeName(subsTarget)))
        const alternatives = subsText
          .join(' ')
          .split(/\s+-\s*ou\s*-\s+/i)
          .map((text) => text.trim())
          .filter(Boolean)
        if (target) target.substitutes.push(...alternatives.filter((alt) => !target.substitutes.includes(alt)))
      }
      subsTarget = null
      subsText = []
    }
    /** Observações: curtas → nota da opção; longas → orientações gerais (sem repetir). */
    const flushNotes = () => {
      if (!notes.length) return
      const paragraphs = toParagraphs(notes)
      if (option && paragraphs.join(' ').length <= SHORT_NOTE_MAX) {
        option.notes = [option.notes, ...paragraphs].filter(Boolean).join(' ')
      } else {
        for (const paragraph of paragraphs) if (!guidelines.includes(paragraph)) guidelines.push(paragraph)
      }
      notes = []
    }
    const closeAll = () => {
      flushTable()
      flushSubs()
      flushNotes()
    }

    /** Começa uma refeição (ou uma nova opção de uma refeição já lida). */
    const startMeal = (heading) => {
      const optionMatch = /^(.*?)\s*-\s*Opç[aã]o\s*(\d+)\s*$/i.exec(heading)
      const baseName = optionMatch ? optionMatch[1] : heading
      const existing = optionMatch && meals.find((meal) => normalizeName(meal.name) === normalizeName(baseName))
      option = { label: `Opção ${optionMatch ? optionMatch[2] : 1}`, items: [], notes: '' }
      if (existing) existing.options.push(option)
      else meals.push({ id: slug(baseName) || `refeicao-${meals.length + 1}`, name: baseName, options: [option] })
    }

    for (const line of lines) {
      if (line.region !== 'body') continue

      // Título: nova seção (refeição, lista de compras ou título do documento).
      if (line.size >= HEADING_MIN_SIZE) {
        closeAll()
        mode = /lista de compras/i.test(line.text) ? 'shopping' : 'none'
        pendingHeading = mode === 'shopping' ? null : line.text
        continue
      }
      // Cabeçalho da tabela: confirma que o último título é uma refeição.
      if (/^Opção (principal|de substituição)$/i.test(line.text)) {
        if (/substituição/i.test(line.text)) substituteColumnX = line.x
        if (pendingHeading) {
          startMeal(pendingHeading)
          pendingHeading = null
        }
        mode = 'table'
        continue
      }
      if (mode === 'shopping') {
        const item = /^[◯○●•]\s*(.+)$/.exec(line.text)?.[1]
        if (item) shoppingList.push(item)
        continue
      }
      if (/^Observações:?$/i.test(line.text)) {
        flushTable()
        flushSubs()
        mode = 'notes'
        continue
      }
      const subsMatch = /^•?\s*Opções de substituição para (.+?):?$/i.exec(line.text)
      if (subsMatch) {
        flushTable()
        flushSubs()
        subsTarget = subsMatch[1]
        mode = 'subs'
        continue
      }
      if (mode === 'table' && line.size <= TABLE_TEXT_MAX_SIZE) cells.push(line)
      else if (mode === 'subs') subsText.push(line.text)
      else if (mode === 'notes') notes.push(line)
    }
    closeAll()

    // "Após o almoço, tomar …" nas orientações vira o texto do lembrete daquela refeição.
    for (const paragraph of guidelines) {
      const sentence = /ap[oó]s o ([a-zà-ú ]+?),\s*([^.]+?)(?:,\s*conforme[^.]*)?\./i.exec(paragraph)
      if (!sentence) continue
      const meal = meals.find((m) => normalizeName(m.name) === normalizeName(sentence[1]))
      if (meal && !meal.reminderText) meal.reminderText = `Depois do(a) ${meal.name.toLowerCase()}: ${sentence[2].trim()}`
    }

    return { prescribedBy, prescribedAt, guidelines, shoppingList, meals }
  },
}
