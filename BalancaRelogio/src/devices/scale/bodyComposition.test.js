// Testes das fórmulas de composição corporal.
// Gabarito: print do app OKOK (capturas/okok-app/okok-69.95kg.png),
// perfil H 171 cm, 23 anos, sexo = 1, pesagem 69,95 kg, Z = 600 Ω.
import { describe, expect, it } from 'vitest';
import { SEX_FEMALE, SEX_MALE, computeBodyComposition } from './bodyComposition.js';

const OKOK_PROFILE = { weightKg: 69.95, heightCm: 171, age: 23, sex: SEX_MALE, impedanceOhm: 600 };

describe('computeBodyComposition — gabarito do OKOK', () => {
  const result = computeBodyComposition(OKOK_PROFILE);

  // [métrica, valor exibido no OKOK, casas decimais exibidas]
  it.each([
    ['bmi', 23.9, 1],
    ['fatPercent', 21.3, 1],
    ['fatMassKg', 14.9, 1],
    ['waterPercent', 54.6, 1],
    ['waterMassKg', 38.2, 1],
    ['muscleMassKg', 52.1, 1],
    ['skeletalMuscleKg', 27.8, 1],
    ['skeletalMusclePercent', 39.8, 1],
    ['visceralFat', 8.0, 1],
    ['proteinPercent', 19.9, 1],
    ['obesityPercent', 9.8, 1],
    ['leanMassKg', 55.08, 2],
    ['metabolicAge', 31, 0],
  ])('%s ≈ %d (como no OKOK)', (metric, expected, decimals) => {
    expect(result[metric]).toBeCloseTo(expected, decimals);
  });

  // Estas duas diferem um pouco do OKOK porque o app usa uma biblioteca nativa.
  it('ossos e metabolismo ficam próximos do OKOK (2,89 kg e 1582 kcal)', () => {
    expect(Math.abs(result.boneMassKg - 2.89)).toBeLessThan(0.1);
    expect(Math.abs(result.bmrKcal - 1582)).toBeLessThan(1);
  });

  it('marca os resultados como estimativa', () => {
    expect(result.estimated).toBe(true);
  });
});

describe('computeBodyComposition — casos-limite', () => {
  it('sem impedância calcula só IMC e obesidade', () => {
    const result = computeBodyComposition({ ...OKOK_PROFILE, impedanceOhm: 0 });
    expect(result.bmi).toBeCloseTo(23.92, 2);
    expect(result.fatPercent).toBeNull();
    expect(result.bmrKcal).toBeNull();
  });

  it('menores de 18 anos não têm água, visceral, idade metabólica nem proteína', () => {
    const result = computeBodyComposition({ ...OKOK_PROFILE, age: 15 });
    expect(result.waterPercent).toBe(0);
    expect(result.visceralFat).toBe(0);
    expect(result.metabolicAge).toBe(0);
    expect(result.proteinPercent).toBeNull();
  });

  it('usa o ramo feminino e respeita os limites das fórmulas', () => {
    const result = computeBodyComposition({ ...OKOK_PROFILE, sex: SEX_FEMALE });
    expect(result.standardWeightKg).toBeCloseTo((171 - 70) * 0.6, 2);
    expect(result.fatPercent).toBeGreaterThanOrEqual(5);
    expect(result.fatPercent).toBeLessThanOrEqual(45);
    expect(result.boneMassKg).toBeGreaterThanOrEqual(1);
    expect(result.boneMassKg).toBeLessThanOrEqual(4);
  });
});
