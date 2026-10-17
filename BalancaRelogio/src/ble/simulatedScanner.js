// Adapter de scan simulado: reproduz a pesagem real capturada (70,05 kg),
// com a mesma interface do adapter Web Bluetooth. Serve para desenvolver
// e demonstrar o app sem a balança por perto.
import { WEIGHING_70_05, expandWeighing } from '../devices/scale/fixtures.js';

// A balança real envia um pacote a cada ~65 ms.
const DEFAULT_INTERVAL_MS = 65;

/**
 * Cria o adapter simulado.
 * @param {object} [options]
 * @param {number} [options.intervalMs] - intervalo entre pacotes
 * @param {number} [options.weightOffsetRaw] - deslocamento do peso (× 100); por padrão, aleatório em ±0,50 kg
 */
export function createSimulatedScanner({
  intervalMs = DEFAULT_INTERVAL_MS,
  weightOffsetRaw = Math.round((Math.random() - 0.5) * 100),
} = {}) {
  let timer = null;

  return {
    async start(onAdvertisement, { onEnd } = {}) {
      const packets = expandWeighing(WEIGHING_70_05, weightOffsetRaw);
      let index = 0;

      // Envia um pacote por vez; ao terminar, avisa com onEnd.
      const tick = () => {
        if (index >= packets.length) {
          timer = null;
          onEnd?.();
          return;
        }
        onAdvertisement({ ...packets[index], name: null, rssi: -60, timestamp: Date.now() });
        index += 1;
        timer = setTimeout(tick, intervalMs);
      };
      timer = setTimeout(tick, intervalMs);
    },

    stop() {
      clearTimeout(timer);
      timer = null;
    },
  };
}
