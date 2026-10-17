// Composição corporal com as mesmas fórmulas do app OKOK
// (com.chipsea.code.algorithm.CsAlgoBuilder, caminho Java para balança de 4 eletrodos).
// Fórmulas e verificação completa: README, seção "Fórmulas do OKOK".
//
// ATENÇÃO: esta balança envia impedância fixa (600,0 Ω). Por isso os resultados
// dependem só de peso, altura, idade e sexo — são estimativas, não bioimpedância real.

// Convenção do Chipsea para o sexo.
export const SEX_MALE = 1;
export const SEX_FEMALE = 0;

// Arredonda para N casas com "meio para cima", como o BigDecimal.ROUND_HALF_UP do app.
const roundTo = (value, decimals) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

// Limita um valor a um intervalo.
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// Escolhe o coeficiente conforme o sexo: [masculino, feminino].
const bySex = (sex, male, female) => (sex === SEX_MALE ? male : female);

/** % de gordura antes dos limites (usado também pela massa muscular). */
function rawFatPercent({ H, W, A, Z, S }) {
  const sum =
    S === SEX_MALE
      ? -0.3315 * H + 0.6216 * W + 0.0183 * A + 0.0085 * Z + 22.554
      : -0.3332 * H + 0.7509 * W + 0.0196 * A + 0.0072 * Z + 22.7193;
  return (sum / W) * 100;
}

/** Massa muscular (kg) antes do arredondamento. */
function rawMuscleMass(input) {
  const { H, W, A, Z, S } = input;
  const fatRaw = rawFatPercent(input);
  // Casos extremos de gordura usam uma estimativa simples pelo peso.
  if (fatRaw > 45) return W * 0.55 - 4;
  if (fatRaw < 5) return W * 0.95 - 1;
  const value =
    S === SEX_MALE
      ? 0.2867 * H + 0.3894 * W - 0.0408 * A - 0.01235 * Z - 15.7665
      : 0.3186 * H + 0.1934 * W - 0.0206 * A - 0.0132 * Z - 16.4556;
  return clamp(value, 20, 70);
}

/** % de água (0 para menores de 18 anos, como no app). */
function waterPercent({ H, W, A, Z, S }) {
  if (A <= 17) return 0;
  const sum =
    S === SEX_MALE
      ? 0.0939 * H + 0.3758 * W - 0.0032 * A - 0.006925 * Z + 0.097
      : 0.0877 * H + 0.2973 * W + 0.0128 * A - 0.00603 * Z + 0.5175;
  return roundTo(clamp((sum / W) * 100, 20, 85), 2);
}

/** Gordura visceral em passos de 0,5, entre 1 e 59 (0 para menores de 18). */
function visceralFat({ H, W, A, Z, S }) {
  if (A <= 17) return 0;
  const value =
    S === SEX_MALE
      ? -0.2675 * H + 0.42 * W + 0.1462 * A + 0.0123 * Z + 13.9871
      : -0.1651 * H + 0.2628 * W + 0.0649 * A + 0.0024 * Z + 12.3445;
  // Parte inteira, + 0,5 quando a fração passa de meio.
  let level = Math.trunc(value);
  if (value - level >= 0.5) level += 0.5;
  return level >= 1 ? Math.min(level, 59) : 1;
}

/** Idade metabólica: no máximo 10 anos acima/abaixo da real, entre 18 e 80. */
function metabolicAge({ H, W, A, Z, S }) {
  if (A <= 17) return 0;
  const value =
    S === SEX_MALE
      ? -0.7471 * H + 0.9161 * W + 0.4184 * A + 0.0517 * Z + 54.2267
      : -1.1165 * H + 1.5784 * W + 0.4615 * A + 0.0415 * Z + 83.2548;
  const age = clamp(Math.trunc(value), A - 10, A + 10);
  return clamp(age, 18, 80);
}

/**
 * Calcula IMC e composição corporal estimada.
 * @param {object} params
 * @param {number} params.weightKg - peso (kg)
 * @param {number} params.heightCm - altura (cm)
 * @param {number} params.age - idade (anos)
 * @param {number} params.sex - SEX_MALE (1) ou SEX_FEMALE (0)
 * @param {number} params.impedanceOhm - impedância (Ω); 0 ou ausente = sem composição
 * @returns {object} métricas; campos de composição ficam null quando não há impedância
 */
export function computeBodyComposition({ weightKg, heightCm, age, sex, impedanceOhm }) {
  // Nomes curtos iguais aos do código original, para facilitar a comparação.
  const input = { H: heightCm, W: weightKg, A: age, Z: impedanceOhm ?? 0, S: sex };
  const { H, W, A, Z, S } = input;

  // Métricas que dependem só de peso e altura.
  const bmi = roundTo(W / (H / 100) ** 2, 2);
  const standardWeightKg = roundTo(bySex(S, (H - 80) * 0.7, (H - 70) * 0.6), 2);
  const obesityPercent = roundTo(((W - standardWeightKg) / standardWeightKg) * 100, 2);
  const base = { bmi, standardWeightKg, obesityPercent, estimated: true };

  // Sem impedância o app OKOK não calcula composição; fazemos o mesmo.
  if (!(Z > 0)) {
    return { ...base, fatPercent: null, fatMassKg: null, leanMassKg: null, waterPercent: null,
      waterMassKg: null, muscleMassKg: null, musclePercent: null, skeletalMuscleKg: null,
      skeletalMusclePercent: null, boneMassKg: null, visceralFat: null, bmrKcal: null,
      metabolicAge: null, proteinPercent: null };
  }

  // Gordura: limitada entre 5 e 45 %, 2 casas.
  const fatPercent = roundTo(clamp(rawFatPercent(input), 5, 45), 2);
  const fatMassKg = (fatPercent * W) / 100;

  // Água e massa muscular.
  const water = waterPercent(input);
  const muscleRaw = rawMuscleMass(input);
  const muscleMassKg = roundTo(muscleRaw, 2);
  const musclePercent = roundTo((muscleRaw / W) * 100, 2);

  // Músculo esquelético (kg), limitado entre 20 e 70.
  const skeletalMuscleKg = roundTo(
    clamp(0.2573 * H + 0.1745 * W - 0.0161 * A + 2.4269 * S - 0.017 * Z - 20.2165, 20, 70),
    2,
  );

  // Ossos: o que sobra do peso sem gordura e músculo, entre 1 e 4 kg.
  const boneMassKg = roundTo(clamp(W - fatMassKg - muscleMassKg, 1, 4), 2);

  // Taxa metabólica basal (kcal/dia), 1 casa.
  const bmrKcal = roundTo(
    bySex(
      S,
      7.5037 * H + 13.1523 * W - 4.3376 * A - 0.3486 * Z - 311.7751,
      7.5432 * H + 9.9474 * W - 3.4382 * A - 0.309 * Z - 288.2821,
    ),
    1,
  );

  return {
    ...base,
    fatPercent,
    fatMassKg: roundTo(fatMassKg, 2),
    leanMassKg: roundTo(W - fatMassKg, 2),
    waterPercent: water,
    waterMassKg: roundTo((W * water) / 100, 2),
    muscleMassKg,
    musclePercent,
    skeletalMuscleKg,
    skeletalMusclePercent: roundTo((skeletalMuscleKg / W) * 100, 2),
    boneMassKg,
    visceralFat: visceralFat(input),
    bmrKcal,
    metabolicAge: metabolicAge(input),
    // Proteína = % músculo − % água (só adultos).
    proteinPercent: A > 17 ? roundTo(musclePercent - water, 2) : null,
  };
}
