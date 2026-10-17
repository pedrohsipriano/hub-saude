// Compartilha um arquivo (vídeo ou imagem do treino):
// - App Android: grava no cache do app (@capacitor/filesystem) e abre o menu do Android (@capacitor/share).
// - Navegador: menu de compartilhar do sistema (Web Share com arquivos); sem ele, baixa o arquivo.
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { isNativeApp } from '../platform.js'

/** Blob → base64 sem o prefixo "data:…;base64,". */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** Baixa o arquivo pelo navegador. */
export function downloadFile(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

/**
 * @param {Blob} blob
 * @param {string} fileName
 * @param {{ title: string, text: string }} message
 * @returns {Promise<'shared' | 'downloaded' | 'cancelled'>}
 */
export async function shareFile(blob, fileName, { title, text }) {
  if (isNativeApp()) {
    const { uri } = await Filesystem.writeFile({
      path: `compartilhar/${fileName}`,
      data: await blobToBase64(blob),
      directory: Directory.Cache,
      recursive: true,
    })
    try {
      await Share.share({ title, text, files: [uri], dialogTitle: 'Compartilhar treino' })
      return 'shared'
    } catch (error) {
      if (/cancel/i.test(error?.message ?? '')) return 'cancelled'
      throw error
    }
  }

  // Navegador: precisa de um clique recente do usuário (por isso o vídeo é gerado antes, num passo separado).
  const file = new File([blob], fileName, { type: blob.type })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text })
      return 'shared'
    } catch (error) {
      if (error.name === 'AbortError') return 'cancelled'
      // Outros erros (ex.: tipo de arquivo recusado): cai no download.
    }
  }
  downloadFile(blob, fileName)
  return 'downloaded'
}
