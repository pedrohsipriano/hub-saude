// Cores dos ícones das barras do sistema no app Android (Capacitor 8, plugin SystemBars):
// - barra de status (topo): ícones claros, porque fica sobre o cabeçalho azul do app;
// - barra de navegação/gestos (embaixo): segue o tema, porque fica sobre a barra de abas
//   (clara no tema claro → ícones escuros; escura no tema escuro → ícones claros).
import { SystemBars, SystemBarType, SystemBarsStyle } from '@capacitor/core'
import { isNativeApp } from '../platform.js'

/** Aplica as cores das barras para o tema efetivo ('light' | 'dark'). */
export function applySystemBars(theme) {
  if (!isNativeApp()) return
  SystemBars.setStyle({ style: SystemBarsStyle.Dark, bar: SystemBarType.StatusBar }).catch(() => {})
  SystemBars.setStyle({ style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light, bar: SystemBarType.NavigationBar }).catch(() => {})
}
