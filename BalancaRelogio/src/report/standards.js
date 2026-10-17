// Faixas de referência de cada métrica, iguais às do app OKOK
// (com.chipsea.code.util.StandardUtil e DataEngine.getNewMuscleStandardRange).
// Cada faixa: { from, to, label, tone }. O "tone" define a cor na UI e no relatório.
import { SEX_MALE } from '../devices/scale/bodyComposition.js';

// Tons possíveis de uma faixa.
export const TONE = {
  LOW: 'low', // abaixo do ideal
  GOOD: 'good', // saudável
  EXCELLENT: 'excellent', // acima do ideal, mas positivo
  HIGH: 'high', // acima do ideal, atenção
  DANGER: 'danger', // bem acima do ideal
};

// Rótulos reutilizados.
const LOW = ['Baixo', TONE.LOW];
const GOOD = ['Saudável', TONE.GOOD];
const EXCELLENT = ['Excelente', TONE.EXCELLENT];
const HIGH = ['Alto', TONE.HIGH];

/**
 * Monta as faixas a partir dos limites e dos rótulos.
 * Ex.: limites [a, b, c] e rótulos [X, Y] → [a–b: X], [b–c: Y].
 */
function bandsFrom(limits, labels) {
  return labels.map(([label, tone], index) => ({
    from: limits[index],
    to: limits[index + 1],
    label,
    tone,
  }));
}

// IMC: padrão "outros países" do OKOK (o mesmo da OMS).
const BMI_LIMITS = [14, 18.5, 24.9, 29.9, 40];
const BMI_LABELS = [LOW, GOOD, HIGH, ['Obeso', TONE.DANGER]];

/** % de gordura por sexo e idade. */
function fatLimits(sex, age) {
  if (sex === SEX_MALE) {
    if (age <= 39) return [5, 11, 17, 27, 45];
    if (age <= 59) return [5, 12, 18, 28, 45];
    return [5, 14, 20, 30, 45];
  }
  if (age <= 39) return [5, 21, 28, 40, 45];
  if (age <= 59) return [5, 22, 29, 41, 45];
  return [5, 23, 30, 42, 45];
}

/** % de água por sexo e idade. */
function waterLimits(sex, age) {
  if (sex === SEX_MALE) return age <= 30 ? [37.8, 53.6, 57.0, 66.0] : [37.8, 52.3, 55.6, 66.0];
  return age <= 30 ? [37.8, 49.5, 52.9, 66.0] : [37.8, 48.1, 51.5, 66.0];
}

/** Massa muscular (kg) por sexo e altura. */
function muscleLimits(sex, heightCm) {
  if (sex === SEX_MALE) {
    if (heightCm < 160) return [30, 38.5, 46.5, 54];
    if (heightCm <= 170) return [36, 44, 52.4, 60];
    return [39, 49.4, 59.4, 69];
  }
  if (heightCm < 150) return [10, 21.9, 34.7, 47];
  if (heightCm <= 160) return [27, 32.9, 37.5, 42];
  return [30, 36.5, 42.5, 48];
}

/** Massa óssea (kg): valor-base por sexo e idade; faixas em 70 %, 100 % e 130 % dele. */
function boneLimits(sex, age) {
  let base = 2.4;
  if (sex === SEX_MALE) {
    if (age > 75) base = 3.1;
    else if (age > 54) base = 2.8;
  } else if (age <= 39) {
    base = 1.7;
  } else if (age <= 60) {
    base = 2.1;
  }
  return [0.7 * base, base, Math.round(1.3 * base * 10) / 10, 5];
}

/** TMB de referência (Mifflin-St Jeor), usada pelo OKOK para classificar o metabolismo. */
function referenceBmr({ sex, age, heightCm, weightKg }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === SEX_MALE ? base + 5 : base - 161;
}

/**
 * Faixas de referência de uma métrica para um perfil.
 * @param {string} metricKey - chave da métrica (ex.: 'fatPercent')
 * @param {{ sex: number, age: number, heightCm: number, weightKg: number }} context
 * @returns {Array<{ from: number, to: number, label: string, tone: string }> | null}
 *   null quando a métrica não tem faixa (ex.: massa livre de gordura)
 */
export function getStandard(metricKey, context) {
  const { sex, age, heightCm } = context;
  const heightM2 = (heightCm / 100) ** 2;

  switch (metricKey) {
    case 'weightKg':
      // Peso: os limites do IMC convertidos para kg na altura do usuário.
      return bandsFrom(BMI_LIMITS.map((bmi) => Math.round(bmi * heightM2 * 100) / 100), BMI_LABELS);
    case 'bmi':
      return bandsFrom(BMI_LIMITS, BMI_LABELS);
    case 'fatPercent':
      return bandsFrom(fatLimits(sex, age), [LOW, GOOD, HIGH, ['Obeso', TONE.DANGER]]);
    case 'visceralFat':
      return bandsFrom([0, 9, 14, 30], [GOOD, HIGH, ['Muito alto', TONE.DANGER]]);
    case 'waterPercent':
      return bandsFrom(waterLimits(sex, age), [LOW, GOOD, EXCELLENT]);
    case 'muscleMassKg':
      return bandsFrom(muscleLimits(sex, heightCm), [LOW, GOOD, EXCELLENT]);
    case 'skeletalMusclePercent':
      return bandsFrom(sex === SEX_MALE ? [26, 31, 39, 45] : [21, 25, 30, 35], [LOW, GOOD, EXCELLENT]);
    case 'boneMassKg':
      return bandsFrom(boneLimits(sex, age), [LOW, GOOD, EXCELLENT]);
    case 'proteinPercent':
      return bandsFrom([10, 16, 20, 25], [LOW, GOOD, EXCELLENT]);
    case 'bmrKcal': {
      // Normal = até 5 % abaixo ou acima da TMB de referência.
      const reference = referenceBmr(context);
      return bandsFrom(
        [0.6 * reference, 0.95 * reference, 1.05 * reference, 2 * reference].map(Math.round),
        [LOW, GOOD, EXCELLENT],
      );
    }
    case 'metabolicAge':
      // Idade metabólica até a idade real é bom; acima, atenção.
      return bandsFrom([18, age + 0.5, 80], [GOOD, HIGH]);
    case 'obesityPercent':
      return bandsFrom([-20, 10, 20, 60], [GOOD, HIGH, ['Obeso', TONE.DANGER]]);
    case 'whr':
      // Relação cintura-quadril (OMS): risco a partir de 0,90 (homens) e 0,85 (mulheres).
      return bandsFrom(sex === SEX_MALE ? [0.6, 0.9, 1.2] : [0.6, 0.85, 1.2], [GOOD, HIGH]);
    default:
      return null;
  }
}

/**
 * Encontra a faixa de um valor (limite inferior inclusivo, superior exclusivo).
 * Valores abaixo da primeira faixa caem nela; acima da última, na última.
 * @returns {{ from: number, to: number, label: string, tone: string } | null}
 */
export function classify(value, bands) {
  if (value == null || !bands?.length) return null;
  return bands.find((band) => value < band.to) ?? bands.at(-1);
}
