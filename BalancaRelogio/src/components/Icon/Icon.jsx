// Ícones em SVG (traço), sem biblioteca externa. A cor vem do texto (currentColor).
import styles from './Icon.module.css'

// Desenho de cada ícone em uma grade 24 × 24.
const PATHS = {
  home: (
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9.5h4.5v-5.5h4v5.5h4.5V10" />
    </>
  ),
  devices: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="3" />
      <path d="M9 6V3h6v3M9 18v3h6v-3M12 9.5v2.5l1.5 1.5" />
    </>
  ),
  diet: (
    <>
      <path d="M6 3v7a2 2 0 0 0 4 0V3M8 10v11" />
      <path d="M17 21V3c-2.2 1.2-3.5 4-3.5 7.5H17" />
    </>
  ),
  progress: (
    <>
      <path d="M3 20h18" />
      <path d="M6 16l4-5 3 3 5-7" />
      <path d="M15 7h3v3" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1-3.5 3.8-5.5 7-5.5s6 2 7 5.5" />
    </>
  ),
  // Cronômetro (aba Treino).
  workout: (
    <>
      <circle cx="12" cy="13.5" r="7" />
      <path d="M12 13.5V10M10 3h4M12 3v3.5M18 7.5l1.5-1.5" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  // Modo claro / escuro (botão do cabeçalho).
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  bell: (
    <>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
}

/**
 * @param {object} props
 * @param {keyof typeof PATHS} props.name
 * @param {string} [props.label] - texto para leitores de tela; sem ele o ícone é decorativo
 */
export default function Icon({ name, label }) {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
    >
      {PATHS[name]}
    </svg>
  )
}
