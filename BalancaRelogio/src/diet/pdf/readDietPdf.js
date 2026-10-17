// Leitura de um PDF de plano alimentar no navegador / app Android.
// O pdf.js (~1 MB) só é carregado quando o usuário escolhe um PDF.
import { importDietFromPages } from '../importers/index.js'
import { extractPdfPages } from './extractPdfText.js'

/**
 * @param {File} file - PDF escolhido pelo usuário
 * @param {{ previousPlan?: object | null }} [options]
 * @returns {Promise<{ importer: string, label: string, plan: object, warnings: string[] }>}
 */
export async function readDietPdf(file, options) {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const pages = await extractPdfPages(pdfjs, new Uint8Array(await file.arrayBuffer()))
  return importDietFromPages(pages, options)
}
