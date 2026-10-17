// Monta o modelo do "Relatório de Progresso" a partir do perfil e das pesagens.
// Função pura: a página do relatório só desenha o que sai daqui.
import { computeBodyComposition } from '../devices/scale/bodyComposition.js';
import { METRIC_CATALOG } from './metricCatalog.js';
import { classify, getStandard } from './standards.js';

// Quantas pesagens aparecem na tabela e no gráfico de cada métrica.
export const DEFAULT_HISTORY_SIZE = 4;

/**
 * Calcula todas as métricas de uma pesagem com o perfil atual.
 * @param {{ timestamp: number, weightKg: number, impedanceOhm: number }} weighing
 * @param {{ heightCm: number, age: number, sex: number }} profile
 */
export function evaluateWeighing(weighing, profile) {
  const composition = computeBodyComposition({
    weightKg: weighing.weightKg,
    heightCm: profile.heightCm,
    age: profile.age,
    sex: profile.sex,
    impedanceOhm: weighing.impedanceOhm,
  });
  return { timestamp: weighing.timestamp, values: { weightKg: weighing.weightKg, ...composition } };
}

/**
 * Gera o modelo do relatório.
 * @param {object} params
 * @param {{ name?: string, heightCm: number, age: number, sex: number }} params.profile
 * @param {Array<{ timestamp: number, weightKg: number, impedanceOhm: number }>} params.weighings
 * @param {number} [params.historySize]
 * @param {number | null} [params.since] - só pesagens a partir deste timestamp (período do relatório)
 * @returns {null | { profile: object, latest: object, first: object, count: number, sections: Array<object> }}
 *   null quando não há pesagens no período
 */
export function buildProgressReport({ profile, weighings, historySize = DEFAULT_HISTORY_SIZE, since = null }) {
  const inPeriod = since == null ? weighings ?? [] : (weighings ?? []).filter((weighing) => weighing.timestamp >= since);
  if (!inPeriod.length) return null;

  // Da mais antiga para a mais recente; a última é a pesagem "atual".
  const evaluated = [...inPeriod]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((weighing) => evaluateWeighing(weighing, profile));
  const latest = evaluated.at(-1);
  // Primeira pesagem do período, para a comparação "início → agora".
  const first = evaluated[0];
  const recent = evaluated.slice(-historySize);

  // Contexto das faixas de referência (algumas dependem do peso atual).
  const context = { ...profile, weightKg: latest.values.weightKg };

  const sections = METRIC_CATALOG.map((metric) => {
    const current = latest.values[metric.key];
    // Métricas sem valor (ex.: sem impedância) ficam fora do relatório.
    if (current == null) return null;
    const bands = getStandard(metric.key, context);
    // Variação desde a primeira pesagem do período (null se houver uma só).
    const startValue = first.values[metric.key] ?? null;
    const delta = evaluated.length > 1 && startValue != null ? Math.round((current - startValue) * 100) / 100 : null;
    return {
      ...metric,
      current,
      startValue,
      delta,
      detailValue: metric.detail ? latest.values[metric.detail.key] : null,
      bands,
      band: classify(current, bands),
      history: recent
        .map((entry) => ({ timestamp: entry.timestamp, value: entry.values[metric.key] }))
        .filter((point) => point.value != null),
    };
  }).filter(Boolean);

  return { profile, latest, first, count: evaluated.length, sections };
}

/**
 * Nome do arquivo PDF no mesmo padrão do relatório de referência:
 * NOMEEMMAIUSCULASRelatorioProgressoDDMMAAAA.
 * @param {string} name
 * @param {number} timestamp
 */
export function reportFileName(name, timestamp) {
  const cleanName = (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[^A-Za-z0-9]/g, '') // remove espaços e símbolos
    .toUpperCase();
  const date = new Date(timestamp);
  const ddmmyyyy = [date.getDate(), date.getMonth() + 1]
    .map((part) => String(part).padStart(2, '0'))
    .join('')
    .concat(String(date.getFullYear()));
  return `${cleanName}RelatorioProgresso${ddmmyyyy}`;
}
