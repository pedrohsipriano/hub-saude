// Adapter BLE do relógio (modo conexão GATT) usando Web Bluetooth.
// Diferente da balança, não precisa da flag experimental do Chrome.
//
// Interface comum dos adapters do relógio:
//   connect() → Promise<{ name, write(bytes), subscribe(listener) → cancelar,
//                         onDisconnect(listener), disconnect() }>

// Serviço proprietário do relógio (base Realtek) — README, Módulo 2.
export const NJJ_SERVICE_UUID = '000001ff-3c17-d293-8e48-14fe2e4da212'
// As características são localizadas pelo início do UUID, sem depender da base.
const WRITE_UUID_PREFIX = '0000ff02'
const NOTIFY_UUID_PREFIX = '0000ff03'
// O manufacturer data dos relógios NJJ começa com BC BC (company ID 0xBCBC).
const NJJ_COMPANY_ID = 0xbcbc

/** Traduz os erros mais comuns para mensagens úteis. */
export function describeWatchError(error) {
  if (error?.name === 'NotFoundError') {
    return 'Nenhum relógio foi selecionado. Desligue o Bluetooth do celular (o relógio aceita uma conexão por vez) e tente de novo.'
  }
  if (error?.name === 'NetworkError') {
    return 'A conexão com o relógio caiu. Verifique se o celular não reconectou e tente de novo.'
  }
  if (error?.name === 'SecurityError') {
    return 'O Bluetooth só funciona em localhost ou https e depois de um clique no botão.'
  }
  return error?.message ?? 'Erro desconhecido no Bluetooth.'
}

/** Cria o adapter de conexão via Web Bluetooth. */
export function createWebBluetoothWatchConnector() {
  return {
    async connect() {
      if (typeof navigator === 'undefined' || !navigator.bluetooth) {
        throw new Error('Este navegador não tem Web Bluetooth. Use o Chrome ou o Edge no computador.')
      }

      // Seletor do navegador: aparelhos com nome "WATCH…" ou com o manufacturer data da NJJ.
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'WATCH' }, { manufacturerData: [{ companyIdentifier: NJJ_COMPANY_ID }] }],
        optionalServices: [NJJ_SERVICE_UUID],
      })

      // Conecta e encontra o canal de dados (FF02 escrita / FF03 notificação).
      const server = await device.gatt.connect()
      const service = await server.getPrimaryService(NJJ_SERVICE_UUID)
      const characteristics = await service.getCharacteristics()
      const writeCharacteristic = characteristics.find((c) => c.uuid.startsWith(WRITE_UUID_PREFIX))
      const notifyCharacteristic = characteristics.find((c) => c.uuid.startsWith(NOTIFY_UUID_PREFIX))
      if (!writeCharacteristic || !notifyCharacteristic) {
        device.gatt.disconnect()
        throw new Error('O relógio conectou, mas o canal de dados (FF02/FF03) não foi encontrado.')
      }

      // Repassa cada notificação como bytes para quem assinou.
      const listeners = new Set()
      const onValue = (event) => {
        const view = event.target.value
        const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice()
        listeners.forEach((listener) => listener(bytes))
      }
      notifyCharacteristic.addEventListener('characteristicvaluechanged', onValue)
      await notifyCharacteristic.startNotifications()

      // Avisa quando a conexão cair (ex.: o celular reconectou ao relógio).
      const disconnectListeners = new Set()
      device.addEventListener('gattserverdisconnected', () => disconnectListeners.forEach((listener) => listener()))

      return {
        name: device.name ?? 'Relógio',
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        async write(bytes) {
          // O app oficial usa escrita sem resposta.
          if (writeCharacteristic.writeValueWithoutResponse) await writeCharacteristic.writeValueWithoutResponse(bytes)
          else await writeCharacteristic.writeValue(bytes)
        },
        onDisconnect(listener) {
          disconnectListeners.add(listener)
        },
        async disconnect() {
          notifyCharacteristic.removeEventListener('characteristicvaluechanged', onValue)
          if (device.gatt.connected) device.gatt.disconnect()
        },
      }
    },
  }
}
