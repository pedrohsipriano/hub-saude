// Testes do parser C0 com os pacotes reais capturados no nRF Connect.
import { describe, expect, it } from 'vitest';
import { isOkokC0, parseOkokC0 } from './okokC0Parser.js';
import { CAPTURED_MAC, OKOK_C0_FIXTURES, hexToBytes } from './fixtures.js';

describe('parseOkokC0', () => {
  // Cada pacote capturado deve decodificar no peso, impedância e fase observados.
  it.each(OKOK_C0_FIXTURES)('decodifica $hex (company 0x$companyId)', (fixture) => {
    const reading = parseOkokC0(fixture.companyId, hexToBytes(fixture.hex));
    expect(reading).not.toBeNull();
    expect(reading.weightKg).toBe(fixture.weightKg);
    expect(reading.impedanceOhm).toBe(fixture.impedanceOhm);
    expect(reading.final).toBe(fixture.final);
    expect(reading.mac).toBe(CAPTURED_MAC);
    expect(reading.productId).toBe(0x0a01);
  });

  it('extrai o contador de pacotes do byte alto do company ID', () => {
    expect(parseOkokC0(0x0dc0, hexToBytes('1B5D17700A0125AABBCCDDEE01')).seq).toBe(0x0d);
  });

  it('ignora pacotes de outros fabricantes', () => {
    expect(isOkokC0(0x004c)).toBe(false);
    expect(parseOkokC0(0x004c, hexToBytes('1B5D17700A0125AABBCCDDEE01'))).toBeNull();
  });

  it('ignora pacotes curtos demais', () => {
    expect(parseOkokC0(0x0dc0, hexToBytes('1B5D1770'))).toBeNull();
  });

  it('ignora pacotes criptografados (bit7 do byte de impedância)', () => {
    expect(parseOkokC0(0x0dc0, hexToBytes('1B5D97700A0125AABBCCDDEE01'))).toBeNull();
  });
});
