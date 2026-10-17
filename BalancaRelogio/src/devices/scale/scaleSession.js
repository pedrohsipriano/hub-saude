// Sessão da balança: transforma o fluxo de pacotes repetidos em eventos úteis.
//
// Uma pesagem gera dezenas de pacotes: "acordou" (peso 0), "medindo" (peso subindo)
// e "final" (o mesmo pacote repetido por ~13 s). A sessão:
//   - repassa toda leitura válida para a UI (onLive), para mostrar o peso ao vivo;
//   - emite onFinal UMA vez por pesagem, no primeiro pacote final;
//   - só "rearma" depois de ver um pacote não final (início da próxima pesagem)
//     ou depois de um silêncio longo (a balança desligou).
import { parseOkokC0 } from './okokC0Parser.js';

// Silêncio (ms) após o qual consideramos que a pesagem anterior terminou.
const DEFAULT_REARM_AFTER_MS = 20000;

/**
 * Cria uma sessão de leitura da balança.
 * @param {object} options
 * @param {(reading: object) => void} [options.onLive] - chamada a cada leitura válida
 * @param {(reading: object) => void} [options.onFinal] - chamada uma vez por pesagem concluída
 * @param {number} [options.rearmAfterMs] - silêncio que encerra uma pesagem
 */
export function createScaleSession({ onLive, onFinal, rearmAfterMs = DEFAULT_REARM_AFTER_MS } = {}) {
  // true = a próxima leitura final deve ser emitida.
  let armed = true;
  // MAC da primeira balança vista; pacotes de outras balanças C0 são ignorados.
  let lockedMac = null;
  // Momento do último pacote aceito, para detectar silêncio.
  let lastPacketAt = 0;

  return {
    /**
     * Processa um advertising recebido do adaptador BLE.
     * @param {{ companyId: number, data: Uint8Array, timestamp?: number }} advertisement
     */
    handleAdvertisement({ companyId, data, timestamp = Date.now() }) {
      const reading = parseOkokC0(companyId, data);
      if (!reading) return;

      // Fixa a sessão na primeira balança encontrada.
      if (lockedMac && reading.mac !== lockedMac) return;
      lockedMac = reading.mac;

      // Silêncio longo: a balança dormiu, então a próxima final é uma pesagem nova.
      if (timestamp - lastPacketAt > rearmAfterMs) armed = true;
      lastPacketAt = timestamp;

      onLive?.({ ...reading, timestamp });

      // Pacote não final = pesagem em andamento; rearma para a próxima final.
      if (!reading.final) {
        armed = true;
        return;
      }

      // Primeiro pacote final da pesagem: emite e desarma até a próxima.
      if (armed && reading.weightKg > 0) {
        armed = false;
        onFinal?.({ ...reading, timestamp });
      }
    },

    /** Volta ao estado inicial (usado ao trocar de adaptador ou reconectar). */
    reset() {
      armed = true;
      lockedMac = null;
      lastPacketAt = 0;
    },
  };
}
