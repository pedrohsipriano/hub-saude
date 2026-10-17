// Cartão "Compartilhar" do treino: vídeo do percurso (o ponto andando até o fim, formato story) ou imagem.
// O vídeo é gerado primeiro (leva ~9 s) e compartilhado num segundo clique: o navegador só abre o menu
// de compartilhar logo depois de um clique do usuário.
import { useEffect, useState } from 'react'
import { recordShareVideo, renderShareImage, shareText, videoSupport } from '../../share/shareCard.js'
import { downloadFile, shareFile } from '../../share/shareFile.js'
import ui from '../../styles/controls.module.css'
import styles from './WorkoutPage.module.css'

// Mensagens depois de compartilhar.
const OUTCOME_MESSAGES = {
  shared: 'Compartilhado!',
  downloaded: 'Este navegador não compartilha arquivos: o arquivo foi baixado.',
  cancelled: null,
}

/**
 * @param {object} props
 * @param {object} props.workout - treino salvo
 */
export default function ShareWorkout({ workout }) {
  const [video, setVideo] = useState(null) // { blob, extension, url }
  const [busy, setBusy] = useState(null) // 'video' | 'image' | 'share' | null
  const [percent, setPercent] = useState(0)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const canRecord = Boolean(videoSupport())
  const fileBase = `treino-${new Date(workout.startedAt).toISOString().slice(0, 10)}`
  const text = shareText(workout)

  // Libera o endereço da prévia quando o vídeo muda ou a tela fecha.
  useEffect(() => () => video && URL.revokeObjectURL(video.url), [video])

  /** Compartilha um arquivo e mostra o resultado. */
  const share = async (blob, fileName) => {
    setError(null)
    setBusy('share')
    try {
      const outcome = await shareFile(blob, fileName, { title: workout.name, text })
      setMessage(OUTCOME_MESSAGES[outcome])
    } catch (shareError) {
      setError(`Não foi possível compartilhar: ${shareError.message}`)
    } finally {
      setBusy(null)
    }
  }

  /** Grava o vídeo do percurso (mostra a porcentagem). */
  const makeVideo = async () => {
    setError(null)
    setMessage(null)
    setBusy('video')
    setPercent(0)
    let lastPercent = 0
    try {
      const result = await recordShareVideo(workout, {
        onProgress: (fraction) => {
          const next = Math.round(fraction * 100)
          if (next !== lastPercent) {
            lastPercent = next
            setPercent(next)
          }
        },
      })
      setVideo({ ...result, url: URL.createObjectURL(result.blob) })
    } catch (videoError) {
      setError(`Não foi possível gerar o vídeo: ${videoError.message}`)
    } finally {
      setBusy(null)
    }
  }

  /** Gera e compartilha a imagem (rápido, cabe no mesmo clique). */
  const shareImage = async () => {
    setMessage(null)
    try {
      await share(await renderShareImage(workout), `${fileBase}.png`)
    } catch (imageError) {
      setError(`Não foi possível gerar a imagem: ${imageError.message}`)
    }
  }

  return (
    <div className={ui.card}>
      <h3 className={ui.cardTitle}>Compartilhar</h3>

      {video ? (
        <div className={styles.shareResult}>
          <video className={styles.sharePreview} src={video.url} autoPlay muted loop playsInline controls />
          <div className={ui.actions}>
            <button
              type="button"
              className={`${ui.button} ${ui.buttonPrimary} ${styles.bigButton}`}
              disabled={Boolean(busy)}
              onClick={() => share(video.blob, `${fileBase}.${video.extension}`)}
            >
              Compartilhar vídeo
            </button>
            <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} onClick={() => downloadFile(video.blob, `${fileBase}.${video.extension}`)}>
              Baixar
            </button>
          </div>
        </div>
      ) : (
        <div className={ui.actions}>
          {canRecord && (
            <button type="button" className={`${ui.button} ${ui.buttonPrimary} ${styles.bigButton}`} disabled={Boolean(busy)} onClick={makeVideo}>
              {busy === 'video' ? `Gerando vídeo… ${percent}%` : 'Vídeo do percurso'}
            </button>
          )}
          <button type="button" className={`${ui.button} ${ui.buttonSecondary} ${styles.bigButton}`} disabled={Boolean(busy)} onClick={shareImage}>
            Imagem
          </button>
        </div>
      )}
      <p className={ui.hint}>
        {video
          ? 'Vídeo no formato de story, pronto para WhatsApp, Instagram e outros apps.'
          : 'O vídeo mostra o ponto percorrendo o trajeto até o fim, com os números do treino.'}
      </p>
      {message && <p className={ui.success}>{message}</p>}
      {error && <p className={ui.error}>{error}</p>}
    </div>
  )
}
