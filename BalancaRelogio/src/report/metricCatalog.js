// Catálogo das métricas exibidas na tela de medição, no histórico e no relatório.
// "key" é o campo de computeBodyComposition (ou weightKg); "detail" é um valor
// complementar mostrado junto (ex.: gordura em % com a massa gorda em kg).

export const METRIC_CATALOG = [
  { key: 'weightKg', title: 'Peso', unit: 'kg', decimals: 2 },
  { key: 'bmi', title: 'IMC', unit: 'kg/m²', decimals: 2 },
  {
    key: 'fatPercent',
    title: 'Gordura corporal',
    unit: '%',
    decimals: 1,
    detail: { key: 'fatMassKg', label: 'Massa gorda', unit: 'kg', decimals: 2 },
  },
  { key: 'visceralFat', title: 'Gordura visceral', unit: '', decimals: 1 },
  {
    key: 'waterPercent',
    title: 'Água corporal',
    unit: '%',
    decimals: 1,
    detail: { key: 'waterMassKg', label: 'Peso da água', unit: 'kg', decimals: 2 },
  },
  {
    key: 'muscleMassKg',
    title: 'Massa muscular',
    unit: 'kg',
    decimals: 2,
    detail: { key: 'musclePercent', label: 'Percentual', unit: '%', decimals: 1 },
  },
  {
    key: 'skeletalMusclePercent',
    title: 'Músculo esquelético',
    unit: '%',
    decimals: 1,
    detail: { key: 'skeletalMuscleKg', label: 'Peso', unit: 'kg', decimals: 2 },
  },
  { key: 'leanMassKg', title: 'Massa livre de gordura', unit: 'kg', decimals: 2 },
  { key: 'boneMassKg', title: 'Massa óssea', unit: 'kg', decimals: 2 },
  { key: 'proteinPercent', title: 'Proteína', unit: '%', decimals: 1 },
  { key: 'bmrKcal', title: 'Taxa metabólica basal', unit: 'kcal', decimals: 0 },
  { key: 'metabolicAge', title: 'Idade metabólica', unit: 'anos', decimals: 0 },
  { key: 'obesityPercent', title: 'Grau de obesidade', unit: '%', decimals: 1 },
];
