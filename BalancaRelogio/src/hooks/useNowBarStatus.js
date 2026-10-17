// Now Bar da Samsung (app Android): o aparelho é compatível e o app já pode ligar o ajuste durante o treino?
// A permissão (WRITE_SECURE_SETTINGS) só pode ser dada pelo adb e se perde ao desinstalar o app;
// sem ela, a tela de treino mostra o comando. Ver NowBarSwitch.java.
import { useEffect, useState } from 'react'
import { HubBackground } from '../native/hubBackground.js'
import { isNativeApp } from '../platform.js'

/** Comando (no PC, com o celular no cabo) que libera o app a ligar a Now Bar durante o treino. */
export const NOW_BAR_GRANT_COMMAND = 'adb shell pm grant com.hubsaude.app android.permission.WRITE_SECURE_SETTINGS'

/** @returns {{ supported: boolean, permission: boolean, enabled: boolean } | null} null no navegador ou antes de ler */
export function useNowBarStatus() {
  const [status, setStatus] = useState(null)
  useEffect(() => {
    if (!isNativeApp()) return
    HubBackground.nowBarStatus()
      .then(setStatus)
      .catch(() => {})
  }, [])
  return status
}
