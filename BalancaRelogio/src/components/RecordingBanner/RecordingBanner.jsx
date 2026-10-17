// Faixa "treino em andamento" mostrada nas outras abas enquanto um treino grava.
import styles from './RecordingBanner.module.css'

/**
 * @param {object} props
 * @param {{ label: string }} props.type - tipo de exercício
 * @param {boolean} props.paused
 * @param {() => void} props.onOpen - volta para a aba Treino
 */
export default function RecordingBanner({ type, paused, onOpen }) {
  return (
    <button type="button" className={`${styles.banner} ${paused ? styles.paused : ''}`} onClick={onOpen}>
      <span className={styles.dot} aria-hidden="true" />
      {type.label} {paused ? 'pausado' : 'gravando'} · toque para voltar ao treino
    </button>
  )
}
