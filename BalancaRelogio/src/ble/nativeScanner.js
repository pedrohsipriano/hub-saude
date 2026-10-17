// Adapter de scan da balança no app Android (Bluetooth nativo).
// Mesma interface do webBluetoothScanner: start(onAdvertisement, { onEnd }) / stop().
// No Android o advertising é lido direto, sem a flag experimental do navegador.
import { BleClient } from '@capacitor-community/bluetooth-le'
import { dataViewToBytes, ensureNativeBle } from './nativeBle.js'

/** Cria o adapter de scan nativo. */
export function createNativeScanner() {
  let scanning = false

  return {
    async start(onAdvertisement) {
      await ensureNativeBle()
      scanning = true
      // Sem filtro: o company ID da balança muda a cada pacote, então o filtro
      // é feito pela sessão (byte baixo 0xC0). allowDuplicates repete os pacotes iguais.
      await BleClient.requestLEScan({ allowDuplicates: true }, (result) => {
        const manufacturerData = result.manufacturerData ?? {}
        for (const [companyId, view] of Object.entries(manufacturerData)) {
          // No Android a chave é o company ID em decimal, e os bytes já vêm sem ele.
          onAdvertisement({
            name: result.localName ?? null,
            companyId: Number(companyId),
            data: dataViewToBytes(view),
            rssi: result.rssi ?? null,
            timestamp: Date.now(),
          })
        }
      })
    },

    stop() {
      if (!scanning) return
      scanning = false
      BleClient.stopLEScan().catch(() => {})
    },
  }
}
