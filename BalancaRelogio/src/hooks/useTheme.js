// Hook do tema: aplica a escolha (auto/claro/escuro) no <html> e devolve o tema efetivo,
// acompanhando a troca de claro/escuro do sistema quando a escolha é "auto".
// No app Android também acerta a cor dos ícones das barras do sistema.
import { useEffect, useSyncExternalStore } from 'react'
import { applySystemBars } from '../theme/systemBars.js'
import { applyTheme, resolveTheme, subscribeSystemTheme, systemPrefersDark } from '../theme/theme.js'

/**
 * @param {'auto' | 'light' | 'dark'} mode
 * @returns {'light' | 'dark'} tema efetivo
 */
export function useTheme(mode) {
  const systemDark = useSyncExternalStore(subscribeSystemTheme, systemPrefersDark, () => false)

  const resolved = resolveTheme(mode, systemDark)

  useEffect(() => {
    applyTheme(mode)
  }, [mode])

  useEffect(() => {
    applySystemBars(resolved)
  }, [resolved])

  return resolved
}
