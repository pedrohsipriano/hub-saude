// Inicialização única do Bluetooth nativo (plugin @capacitor-community/bluetooth-le).
// No Android, pede as permissões de Bluetooth na primeira chamada.
import { BleClient } from '@capacitor-community/bluetooth-le'

let initialized = null

/** Garante que o BleClient foi inicializado uma vez só. */
export function ensureNativeBle() {
  if (!initialized) {
    // neverForLocation: o app não usa o Bluetooth para descobrir localização
    // (exige a flag correspondente no AndroidManifest.xml).
    initialized = BleClient.initialize({ androidNeverForLocation: true }).catch((error) => {
      initialized = null
      throw error
    })
  }
  return initialized
}

/** Converte o DataView do plugin em bytes independentes. */
export function dataViewToBytes(view) {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice()
}

/** Converte bytes no DataView que o plugin espera. */
export function bytesToDataView(bytes) {
  const copy = Uint8Array.from(bytes)
  return new DataView(copy.buffer)
}
