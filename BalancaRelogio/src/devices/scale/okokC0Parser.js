// Parser do pacote de advertising da balança OKOK, variante "C0".
// Referência: README, seção "Dados capturados", e o parser oficial do app OKOK
// (com.chipsea.btlib.protocal.chipseaBroadcastFrame.okokBroadcasetV2Parser).
//
// Os offsets abaixo NÃO incluem os 2 bytes do company ID.
// Layout dos 13 bytes de dados:
//   [0,1]   peso bruto (big-endian)
//   [2,3]   impedância × 10 (bit7 de [2] = pacote criptografado)
//   [4,5]   productId (modelo da balança)
//   [6]     atributo: bit0 = final, bits1-2 = resolução, bits3-4 = unidade
//   [7..12] MAC da balança

// Tamanho mínimo do payload (sem o company ID).
const MIN_LENGTH = 13;

// Resolução do peso (bits 1-2 do atributo) → divisor.
const RESOLUTION_DIVISOR = { 0: 10, 1: 1, 2: 100, 3: 10 };

// Unidade do peso (bits 3-4 do atributo) → função que converte para kg.
// A unidade 3 (stone:lb) não foi observada e fica sem suporte por enquanto.
const UNIT_TO_KG = {
  0: (value) => value, // kg
  1: (value) => value / 2, // jin (meio quilo)
  2: (value) => value / 2.204623, // libra
};

// Arredonda para 2 casas, evitando ruído de ponto flutuante (ex.: 70.05000000001).
const round2 = (value) => Math.round(value * 100) / 100;

// Lê um inteiro de 16 bits big-endian a partir de dois bytes.
const u16be = (high, low) => (high << 8) | low;

/**
 * Indica se o company ID pertence à variante C0.
 * O byte baixo é sempre 0xC0; o byte alto é o contador de pacotes (measureSeqNo).
 * @param {number} companyId
 * @returns {boolean}
 */
export function isOkokC0(companyId) {
  return (companyId & 0xff) === 0xc0;
}

/**
 * Formata 6 bytes como MAC "AA:BB:CC:DD:EE:FF".
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function formatMac(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(':');
}

/**
 * Converte um pacote C0 em uma leitura da balança.
 * @param {number} companyId - company ID do manufacturer data (ex.: 0x0DC0)
 * @param {Uint8Array} data - payload SEM os 2 bytes do company ID
 * @returns {null | {
 *   seq: number, weightKg: number, impedanceOhm: number, final: boolean,
 *   productId: number, mac: string
 * }} null quando o pacote não é C0, é curto demais, é criptografado ou usa unidade sem suporte
 */
export function parseOkokC0(companyId, data) {
  // Descarta pacotes de outros fabricantes ou incompletos.
  if (!isOkokC0(companyId) || !data || data.length < MIN_LENGTH) return null;

  // Pacotes criptografados existem em outros modelos; a nossa balança não usa.
  const encrypted = (data[2] & 0x80) !== 0;
  if (encrypted) return null;

  // Decodifica o byte de atributo.
  const attribute = data[6];
  const final = (attribute & 0x01) === 0x01;
  const divisor = RESOLUTION_DIVISOR[(attribute >> 1) & 0x03];
  const toKg = UNIT_TO_KG[(attribute >> 3) & 0x03];
  if (!toKg) return null;

  // Peso: valor bruto ÷ divisor da resolução, convertido para kg.
  const weightKg = round2(toKg(u16be(data[0], data[1]) / divisor));

  // Impedância: o OKOK lê como "r1" = valor ÷ 10. Esta balança envia 600,0 Ω fixo no pacote final.
  const impedanceOhm = u16be(data[2], data[3]) / 10;

  return {
    seq: (companyId >> 8) & 0xff,
    weightKg,
    impedanceOhm,
    final,
    productId: u16be(data[4], data[5]),
    mac: formatMac(data.subarray(7, 13)),
  };
}
