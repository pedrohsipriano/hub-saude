// Testes da sessão: uma pesagem completa deve gerar exatamente um evento final.
import { describe, expect, it, vi } from 'vitest';
import { createScaleSession } from './scaleSession.js';
import { WEIGHING_70_05, buildC0Packet, expandWeighing } from './fixtures.js';

/** Pacotes da pesagem capturada, 65 ms entre cada um (como a balança real). */
function packetsOf(steps, startAt = 0) {
  return expandWeighing(steps).map((packet, index) => ({ ...packet, timestamp: startAt + index * 65 }));
}

describe('createScaleSession', () => {
  it('emite onFinal uma única vez por pesagem, com 70,05 kg', () => {
    const onFinal = vi.fn();
    const onLive = vi.fn();
    const session = createScaleSession({ onFinal, onLive });

    packetsOf(WEIGHING_70_05).forEach((packet) => session.handleAdvertisement(packet));

    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(onFinal.mock.calls[0][0].weightKg).toBe(70.05);
    expect(onFinal.mock.calls[0][0].impedanceOhm).toBe(600);
    // Toda leitura válida chega à UI.
    expect(onLive).toHaveBeenCalledTimes(WEIGHING_70_05.reduce((sum, step) => sum + step.repeat, 0));
  });

  it('emite de novo na pesagem seguinte', () => {
    const onFinal = vi.fn();
    const session = createScaleSession({ onFinal });

    packetsOf(WEIGHING_70_05, 0).forEach((packet) => session.handleAdvertisement(packet));
    packetsOf(WEIGHING_70_05, 60000).forEach((packet) => session.handleAdvertisement(packet));

    expect(onFinal).toHaveBeenCalledTimes(2);
  });

  it('rearma após silêncio longo mesmo sem pacote de medição', () => {
    const onFinal = vi.fn();
    const session = createScaleSession({ onFinal, rearmAfterMs: 20000 });
    const final = buildC0Packet(0x0d, 7005, 6000, true);

    session.handleAdvertisement({ ...final, timestamp: 0 });
    session.handleAdvertisement({ ...final, timestamp: 1000 });
    session.handleAdvertisement({ ...final, timestamp: 30000 });

    expect(onFinal).toHaveBeenCalledTimes(2);
  });

  it('ignora outra balança C0 depois de fixar a primeira', () => {
    const onLive = vi.fn();
    const session = createScaleSession({ onLive });
    const own = buildC0Packet(1, 7005, 0, false);
    const other = buildC0Packet(1, 5000, 0, false);
    other.data.set([0x11, 0x22, 0x33, 0x44, 0x55, 0x66], 7);

    session.handleAdvertisement(own);
    session.handleAdvertisement(other);

    expect(onLive).toHaveBeenCalledTimes(1);
  });
});
