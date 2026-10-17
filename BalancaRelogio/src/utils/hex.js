// Conversões entre texto hexadecimal e bytes (usadas por fixtures, testes e logs).

/**
 * Converte "BC 3E 01" ou "BC3E01" em bytes.
 * @param {string} hex
 * @returns {Uint8Array}
 */
export function hexToBytes(hex) {
  const clean = hex.replace(/\s+/g, '')
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/**
 * Converte bytes em "BC 3E 01".
 * @param {Uint8Array | number[]} bytes
 * @returns {string}
 */
export function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ')
}
