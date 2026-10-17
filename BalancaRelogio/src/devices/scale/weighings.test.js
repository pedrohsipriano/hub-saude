// Testes da conversão pesagem ↔ linhas do banco.
import { describe, expect, it } from 'vitest';
import { groupWeighings, latestWeightByUser, weighingToMeasurement } from './weighings.js';

describe('latestWeightByUser', () => {
  it('último peso de cada pessoa', () => {
    const rows = [
      { userId: 'a', device: 'scale', metric: 'weight', timestamp: 1, value: 70 },
      { userId: 'a', device: 'scale', metric: 'weight', timestamp: 3, value: 69.5 },
      { userId: 'b', device: 'scale', metric: 'weight', timestamp: 2, value: 58 },
      { userId: 'b', device: 'scale', metric: 'impedance', timestamp: 2, value: 600 },
    ];
    expect(Object.fromEntries(latestWeightByUser(rows))).toEqual({ a: 69.5, b: 58 });
  });
});

describe('weighings', () => {
  it('ida e volta: evento do hub → linhas do banco → pesagem', () => {
    const event = weighingToMeasurement({ timestamp: 1000, weightKg: 70.05, impedanceOhm: 600 }, 'default');
    const rows = event.metrics.map((m) => ({ userId: event.userId, device: event.device, timestamp: event.timestamp, ...m }));

    expect(groupWeighings(rows)).toEqual([{ timestamp: 1000, weightKg: 70.05, impedanceOhm: 600 }]);
  });

  it('ordena por horário e ignora linhas de outros dispositivos', () => {
    const rows = [
      { device: 'scale', metric: 'weight', timestamp: 2000, value: 69.9 },
      { device: 'watch', metric: 'steps', timestamp: 1500, value: 8000 },
      { device: 'scale', metric: 'weight', timestamp: 1000, value: 70.1 },
    ];

    expect(groupWeighings(rows).map((w) => w.timestamp)).toEqual([1000, 2000]);
  });
});
