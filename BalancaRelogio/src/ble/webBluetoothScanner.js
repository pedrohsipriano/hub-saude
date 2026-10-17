// Adapter de transporte BLE (modo scan) usando Web Bluetooth — protótipo no Chrome/Edge.
//
// Interface comum dos adapters de scan:
//   start(onAdvertisement, { onEnd }) → Promise<void>
//   stop()
// onAdvertisement recebe { name, companyId, data: Uint8Array, rssi, timestamp },
// com `data` já SEM os 2 bytes do company ID.
//
// Limitação: ler advertising exige device.watchAdvertisements(), que só existe com a flag
// chrome://flags/#enable-experimental-web-platform-features ligada.

// O company ID da balança muda a cada pacote (byte alto = contador), então
// listamos os 256 valores possíveis com byte baixo 0xC0.
const C0_COMPANY_IDS = Array.from({ length: 256 }, (_, high) => (high << 8) | 0xc0);

/** Indica se o navegador tem o que o adapter precisa. */
export function getWebBluetoothSupport() {
  if (typeof navigator === 'undefined' || !navigator.bluetooth) {
    return { ok: false, reason: 'Este navegador não tem Web Bluetooth. Use o Chrome ou o Edge no computador.' };
  }
  return { ok: true, reason: null };
}

/** Traduz os erros mais comuns do Web Bluetooth para mensagens úteis. */
export function describeBleError(error) {
  if (error?.name === 'NotFoundError') {
    return 'Nenhuma balança foi selecionada. Suba na balança para acordá-la e tente de novo.';
  }
  if (error?.name === 'SecurityError') {
    return 'O Bluetooth só funciona em localhost ou https e depois de um clique no botão.';
  }
  return error?.message ?? 'Erro desconhecido no Bluetooth.';
}

/** Cria o adapter de scan via Web Bluetooth. */
export function createWebBluetoothScanner() {
  let device = null;
  let listener = null;
  let abortController = null;

  return {
    async start(onAdvertisement) {
      const support = getWebBluetoothSupport();
      if (!support.ok) throw new Error(support.reason);

      // Abre o seletor do navegador mostrando só aparelhos com manufacturer data C0.
      device = await navigator.bluetooth.requestDevice({
        filters: C0_COMPANY_IDS.map((companyIdentifier) => ({ manufacturerData: [{ companyIdentifier }] })),
        // Sem isto o navegador não entrega os bytes do manufacturer data.
        optionalManufacturerData: C0_COMPANY_IDS,
      });

      if (typeof device.watchAdvertisements !== 'function') {
        throw new Error(
          'Ative a flag chrome://flags/#enable-experimental-web-platform-features e reinicie o navegador para ler a balança.',
        );
      }

      // Repassa cada manufacturer data recebido no formato comum dos adapters.
      listener = (event) => {
        event.manufacturerData.forEach((dataView, companyId) => {
          onAdvertisement({
            name: device.name ?? null,
            companyId,
            data: new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength),
            rssi: event.rssi ?? null,
            timestamp: Date.now(),
          });
        });
      };
      device.addEventListener('advertisementreceived', listener);

      // O AbortController permite parar de escutar em stop().
      abortController = new AbortController();
      await device.watchAdvertisements({ signal: abortController.signal });
    },

    stop() {
      abortController?.abort();
      if (device && listener) device.removeEventListener('advertisementreceived', listener);
      device = null;
      listener = null;
      abortController = null;
    },
  };
}
