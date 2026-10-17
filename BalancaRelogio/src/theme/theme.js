// Tema do app: 'auto' (segue o sistema), 'light' (claro) ou 'dark' (escuro).
// O tema escolhido vira o atributo data-theme no <html>, e o tokens.css troca as cores por ele.
// Sem escolha (auto), vale o modo claro/escuro do celular ou do PC.

export const THEME_MODES = [
  { id: 'auto', label: 'Automático (igual ao sistema)' },
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Escuro' },
]

// Mesma chave das preferências do App (usePersistentState).
const SETTINGS_KEY = 'hubSaude.settings'

/** Consulta do modo escuro do sistema. */
function darkQuery() {
  return typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null
}

/** Aplica o tema no <html> (auto = sem atributo, segue o sistema). */
export function applyTheme(mode) {
  const root = document.documentElement
  if (mode === 'light' || mode === 'dark') root.dataset.theme = mode
  else delete root.dataset.theme
}

/** Aplica o tema salvo antes do primeiro desenho, para a tela não piscar no tema errado. */
export function applyStoredTheme() {
  try {
    applyTheme(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}').theme)
  } catch {
    // Sem armazenamento local: segue o sistema.
  }
}

/** Tema efetivo ('light' | 'dark') a partir da escolha e do sistema. */
export function resolveTheme(mode, systemDark) {
  if (mode === 'light' || mode === 'dark') return mode
  return systemDark ? 'dark' : 'light'
}

/** O sistema está no modo escuro? */
export function systemPrefersDark() {
  return Boolean(darkQuery()?.matches)
}

/** Tema efetivo agora (lido do <html> e do sistema), para quem não é componente React (ex.: o mapa). */
export function currentTheme() {
  return resolveTheme(document.documentElement.dataset.theme, systemPrefersDark())
}

/** Avisa quando o sistema troca entre claro e escuro (para useSyncExternalStore). */
export function subscribeSystemTheme(callback) {
  const query = darkQuery()
  query?.addEventListener('change', callback)
  return () => query?.removeEventListener('change', callback)
}
