// Converte os trechos de texto de uma página de PDF em linhas, na ordem de leitura
// (de cima para baixo, da esquerda para a direita), separando as colunas das tabelas.

// Trechos com até esta diferença de altura estão na mesma linha.
const SAME_LINE_TOLERANCE = 2.5
// Texto de célula de tabela é pequeno (7,5 pt no WebDiet); acima disso é texto corrido.
export const TABLE_TEXT_MAX_SIZE = 8
// Faixas de cabeçalho e rodapé (pontos a partir das bordas da página).
const HEADER_BAND = 95
const FOOTER_BAND = 60

/** Remove caracteres de ícones sem fonte (área privada do Unicode) e espaços extras. */
export function cleanText(text) {
  return text
    .replace(/[-�]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * @param {{ number: number, width: number, height: number,
 *           items: Array<{ str: string, x: number, y: number, size: number }> }} page
 * @returns {Array<{ text: string, x: number, right: number, y: number, size: number, page: number,
 *                   column: 'left' | 'right' | 'full', region: 'header' | 'body' | 'footer' }>}
 */
export function pageToLines(page) {
  // Células de tabela à direita do meio da página são a coluna de substituição.
  const columnSplit = page.width * 0.48
  const groups = []
  const sorted = [...page.items].sort((a, b) => b.y - a.y || a.x - b.x)

  for (const item of sorted) {
    const column = item.size <= TABLE_TEXT_MAX_SIZE ? (item.x >= columnSplit ? 'right' : 'left') : 'full'
    const group = groups.find((g) => g.column === column && Math.abs(g.y - item.y) <= SAME_LINE_TOLERANCE)
    if (group) group.items.push(item)
    else groups.push({ y: item.y, column, items: [item] })
  }

  return groups
    .map((group) => {
      group.items.sort((a, b) => a.x - b.x)
      return {
        text: cleanText(group.items.map((item) => item.str).join(' ')),
        x: group.items[0].x,
        // Borda direita do texto (para saber se a célula atravessa as duas colunas).
        right: Math.max(...group.items.map((item) => item.x + (item.width ?? 0))),
        y: group.y,
        size: Math.max(...group.items.map((item) => item.size)),
        page: page.number,
        column: group.column,
        region: group.y > page.height - HEADER_BAND ? 'header' : group.y < FOOTER_BAND ? 'footer' : 'body',
      }
    })
    .filter((line) => line.text)
    .sort((a, b) => b.y - a.y || a.x - b.x)
}
