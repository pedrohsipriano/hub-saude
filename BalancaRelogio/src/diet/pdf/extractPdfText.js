// Extração do texto de um PDF com posição (x, y) e tamanho da fonte de cada trecho.
// Recebe a biblioteca pdf.js como parâmetro para funcionar no navegador e no Node (testes/scripts).

/**
 * @param {object} pdfjs - módulo pdf.js (pdfjs-dist)
 * @param {Uint8Array} data - bytes do arquivo
 * @returns {Promise<Array<{ number: number, width: number, height: number,
 *   items: Array<{ str: string, x: number, y: number, size: number, width: number }> }>>}
 *   y cresce para cima (origem no canto inferior esquerdo, como no PDF)
 */
export async function extractPdfPages(pdfjs, data) {
  // A tarefa de carregamento é quem libera os recursos no final.
  const loadingTask = pdfjs.getDocument({ data, isEvalSupported: false })
  const document = await loadingTask.promise
  const pages = []
  try {
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const items = content.items
        .filter((item) => typeof item.str === 'string' && item.str.trim() !== '')
        .map((item) => ({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
          // Tamanho da fonte = escala vertical da matriz de transformação.
          size: Math.round(Math.abs(item.transform[3]) * 10) / 10,
          width: item.width,
        }))
      pages.push({ number, width: viewport.width, height: viewport.height, items })
    }
  } finally {
    await loadingTask.destroy()
  }
  return pages
}
