// Pacotes reais capturados no nRF Connect (README, "Dados capturados").
// São usados pelos testes e pelo simulador de pesagem.
import { hexToBytes } from '../../utils/hex.js';

// Reexporta para os testes da balança, que já importam daqui.
export { hexToBytes };

// MAC da balança capturada (aparece nos bytes [7..12] de todo pacote).
export const CAPTURED_MAC = 'AA:BB:CC:DD:EE:01';

// Cada item: company ID, dados em hex e o que se espera decodificar deles.
export const OKOK_C0_FIXTURES = [
  { companyId: 0x01c0, hex: '000000000A0124AABBCCDDEE01', weightKg: 0, impedanceOhm: 0, final: false },
  { companyId: 0x16c0, hex: '01A417700A0124AABBCCDDEE01', weightKg: 4.2, impedanceOhm: 600, final: false },
  { companyId: 0x19c0, hex: '0D1617700A0124AABBCCDDEE01', weightKg: 33.5, impedanceOhm: 600, final: false },
  { companyId: 0x06c0, hex: '1ACC00000A0124AABBCCDDEE01', weightKg: 68.6, impedanceOhm: 0, final: false },
  { companyId: 0x1dc0, hex: '1B5800000A0124AABBCCDDEE01', weightKg: 70.0, impedanceOhm: 0, final: false },
  { companyId: 0x25c0, hex: '1B5D00000A0124AABBCCDDEE01', weightKg: 70.05, impedanceOhm: 0, final: false },
  { companyId: 0x0dc0, hex: '1B5D17700A0125AABBCCDDEE01', weightKg: 70.05, impedanceOhm: 600, final: true },
  { companyId: 0x07c0, hex: '1B6717700A0125AABBCCDDEE01', weightKg: 70.15, impedanceOhm: 600, final: true },
  { companyId: 0xe5c0, hex: '1B5317700A0124AABBCCDDEE01', weightKg: 69.95, impedanceOhm: 600, final: false },
  { companyId: 0x10c0, hex: '1B5317700A0125AABBCCDDEE01', weightKg: 69.95, impedanceOhm: 600, final: true },
  { companyId: 0x13c0, hex: '1B3017700A0125AABBCCDDEE01', weightKg: 69.6, impedanceOhm: 600, final: true },
];

/**
 * Monta um pacote C0 sintético com o mesmo formato da balança real.
 * @param {number} seq - contador de pacotes (byte alto do company ID)
 * @param {number} weightRaw - peso × 100
 * @param {number} impedanceRaw - impedância × 10
 * @param {boolean} final - pacote final da pesagem
 * @returns {{ companyId: number, data: Uint8Array }}
 */
export function buildC0Packet(seq, weightRaw, impedanceRaw, final) {
  const mac = hexToBytes(CAPTURED_MAC.replaceAll(':', ''));
  const data = new Uint8Array([
    (weightRaw >> 8) & 0xff,
    weightRaw & 0xff,
    (impedanceRaw >> 8) & 0xff,
    impedanceRaw & 0xff,
    0x0a, // productId (byte alto)
    0x01, // productId (byte baixo)
    final ? 0x25 : 0x24, // atributo: kg, ÷100, bit0 = final
    ...mac,
  ]);
  return { companyId: ((seq & 0xff) << 8) | 0xc0, data };
}

/**
 * Expande uma sequência de etapas em pacotes, como a balança real envia.
 * O contador (seq) sobe a cada pacote de medição e para no pacote final.
 * @param {Array<{weightRaw: number, impedanceRaw: number, final: boolean, repeat: number}>} steps
 * @param {number} [weightOffsetRaw] - deslocamento do peso (× 100), para simular pesagens diferentes
 * @returns {Array<{ companyId: number, data: Uint8Array }>}
 */
export function expandWeighing(steps, weightOffsetRaw = 0) {
  const packets = [];
  let seq = 1;
  for (const step of steps) {
    // Pacotes "acordou" (peso 0) não recebem o deslocamento.
    const weightRaw = step.weightRaw > 0 ? step.weightRaw + weightOffsetRaw : 0;
    for (let i = 0; i < step.repeat; i += 1) {
      packets.push(buildC0Packet(seq, weightRaw, step.impedanceRaw, step.final));
      if (!step.final) seq += 1;
    }
  }
  return packets;
}

// Sequência da pesagem capturada às 16:49 (display: 70,05 kg).
// Cada etapa: peso × 100, impedância × 10, final e quantos pacotes repetir.
export const WEIGHING_70_05 = [
  { weightRaw: 0, impedanceRaw: 0, final: false, repeat: 5 },
  { weightRaw: 6860, impedanceRaw: 0, final: false, repeat: 6 },
  { weightRaw: 6950, impedanceRaw: 0, final: false, repeat: 1 },
  { weightRaw: 6990, impedanceRaw: 0, final: false, repeat: 1 },
  { weightRaw: 6995, impedanceRaw: 0, final: false, repeat: 8 },
  { weightRaw: 7000, impedanceRaw: 0, final: false, repeat: 2 },
  { weightRaw: 7005, impedanceRaw: 0, final: false, repeat: 7 },
  { weightRaw: 7005, impedanceRaw: 6000, final: true, repeat: 40 },
];
