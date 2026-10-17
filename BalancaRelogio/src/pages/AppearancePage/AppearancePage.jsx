// Mais → Aparência: escolha do tema (automático, claro ou escuro), guardada neste aparelho.
import ui from '../../styles/controls.module.css'
import { APP_VERSION_LABEL } from '../../appVersion.js'
import { THEME_MODES } from '../../theme/theme.js'
import styles from './AppearancePage.module.css'

/**
 * @param {object} props
 * @param {'auto' | 'light' | 'dark'} props.theme - escolha atual
 * @param {(theme: string) => void} props.onChange
 */
export default function AppearancePage({ theme, onChange }) {
  return (
    <div className={ui.card}>
      <h3 className={ui.cardTitle}>Tema</h3>
      <fieldset className={styles.options}>
        <legend className={ui.label}>Cores do app</legend>
        {THEME_MODES.map((mode) => (
          <label key={mode.id} className={styles.option}>
            <input type="radio" name="theme" value={mode.id} checked={theme === mode.id} onChange={() => onChange(mode.id)} />
            {mode.label}
          </label>
        ))}
      </fieldset>
      <p className={ui.hint}>O botão de sol/lua no cabeçalho alterna entre claro e escuro. O relatório em PDF sai sempre claro.</p>
      <p className={ui.hint}>Hub de Saúde {APP_VERSION_LABEL}</p>
    </div>
  )
}
