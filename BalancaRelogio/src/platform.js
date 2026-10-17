// Detecção de plataforma: o mesmo código roda no navegador do PC e no app Android (Capacitor).
import { Capacitor } from '@capacitor/core'

/** true dentro do app nativo (Android); false no navegador. */
export function isNativeApp() {
  return Capacitor.isNativePlatform()
}

/** 'android', 'ios' ou 'web'. */
export function platformName() {
  return Capacitor.getPlatform()
}
