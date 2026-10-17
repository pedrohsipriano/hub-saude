// "Gerar PDF": abre a impressão do sistema, em que o destino "Salvar como PDF" gera o arquivo.
// - App Android: o WebView do Android não implementa window.print() (o botão não fazia nada), então a
//   impressão vai pelo PrintManager nativo (HubBackground.printPage), já com o nome do arquivo.
// - Navegador: window.print(); o título da página vira o nome do arquivo e volta ao normal depois.
// Nos dois casos vale o CSS de @media print (esconde o menu, página A4, sempre no tema claro).
import { isNativeApp } from '../platform.js'
import { HubBackground } from './hubBackground.js'

/**
 * Abre a impressão da página atual.
 * @param {string} fileName - nome sugerido para o PDF (sem extensão)
 * @returns {Promise<void>}
 */
export async function printPage(fileName) {
  if (isNativeApp()) {
    await HubBackground.printPage({ name: fileName })
    return
  }
  const previousTitle = document.title
  document.title = fileName
  const restoreTitle = () => {
    document.title = previousTitle
    window.removeEventListener('afterprint', restoreTitle)
  }
  window.addEventListener('afterprint', restoreTitle)
  window.print()
}
