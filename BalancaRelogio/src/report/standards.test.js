// As faixas devem reproduzir os rótulos do print do OKOK
// (capturas/okok-app/okok-69.95kg.png: H 171 cm, 23 anos, sexo = 1, 69,95 kg).
import { describe, expect, it } from 'vitest';
import { SEX_MALE, computeBodyComposition } from '../devices/scale/bodyComposition.js';
import { classify, getStandard } from './standards.js';

const PROFILE = { heightCm: 171, age: 23, sex: SEX_MALE, weightKg: 69.95 };
const values = { weightKg: 69.95, ...computeBodyComposition({ ...PROFILE, impedanceOhm: 600 }) };

describe('getStandard + classify — rótulos do OKOK', () => {
  it.each([
    ['weightKg', 'Saudável'],
    ['bmi', 'Saudável'],
    ['fatPercent', 'Alto'],
    ['waterPercent', 'Saudável'],
    ['muscleMassKg', 'Saudável'],
    ['skeletalMusclePercent', 'Excelente'],
    ['visceralFat', 'Saudável'],
    ['boneMassKg', 'Saudável'],
    ['proteinPercent', 'Saudável'],
    ['bmrKcal', 'Saudável'],
    ['obesityPercent', 'Saudável'],
  ])('%s → %s', (metric, label) => {
    expect(classify(values[metric], getStandard(metric, PROFILE)).label).toBe(label);
  });

  it('massa livre de gordura não tem faixa', () => {
    expect(getStandard('leanMassKg', PROFILE)).toBeNull();
  });

  it('valores fora das faixas caem na primeira ou na última', () => {
    const bands = getStandard('bmi', PROFILE);
    expect(classify(10, bands).label).toBe('Baixo');
    expect(classify(55, bands).label).toBe('Obeso');
    expect(classify(null, bands)).toBeNull();
  });
});
