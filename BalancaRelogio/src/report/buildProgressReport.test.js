// Testes do modelo do relatório de progresso.
import { describe, expect, it } from 'vitest';
import { SEX_MALE } from '../devices/scale/bodyComposition.js';
import { buildProgressReport, reportFileName } from './buildProgressReport.js';

const PROFILE = { name: 'Pessoa Teste', heightCm: 171, age: 23, sex: SEX_MALE };
const day = (n) => Date.UTC(2026, 9, n, 12);
const WEIGHINGS = [
  { timestamp: day(5), weightKg: 70.4, impedanceOhm: 600 },
  { timestamp: day(1), weightKg: 71.2, impedanceOhm: 600 },
  { timestamp: day(3), weightKg: 70.9, impedanceOhm: 600 },
  { timestamp: day(7), weightKg: 70.05, impedanceOhm: 600 },
  { timestamp: day(9), weightKg: 69.95, impedanceOhm: 600 },
];

describe('buildProgressReport', () => {
  const report = buildProgressReport({ profile: PROFILE, weighings: WEIGHINGS });

  it('usa a pesagem mais recente como atual', () => {
    expect(report.latest.values.weightKg).toBe(69.95);
  });

  it('mostra só as 4 pesagens mais recentes, em ordem cronológica', () => {
    const weight = report.sections.find((s) => s.key === 'weightKg');
    expect(weight.history.map((p) => p.value)).toEqual([70.9, 70.4, 70.05, 69.95]);
  });

  it('classifica o valor atual de cada métrica', () => {
    const fat = report.sections.find((s) => s.key === 'fatPercent');
    expect(fat.band.label).toBe('Alto');
    expect(fat.detailValue).toBeCloseTo(14.87, 2);
  });

  it('sem impedância, o relatório tem só peso, IMC e obesidade', () => {
    const noZ = buildProgressReport({
      profile: PROFILE,
      weighings: WEIGHINGS.map((w) => ({ ...w, impedanceOhm: 0 })),
    });
    expect(noZ.sections.map((s) => s.key)).toEqual(['weightKg', 'bmi', 'obesityPercent']);
  });

  it('período: filtra pelas datas e calcula a variação desde o início', () => {
    const report = buildProgressReport({ profile: PROFILE, weighings: WEIGHINGS, since: day(5) })
    expect(report.count).toBe(3)
    const weight = report.sections.find((s) => s.key === 'weightKg')
    expect(weight.startValue).toBe(70.4)
    expect(weight.delta).toBeCloseTo(-0.45, 2)
    expect(buildProgressReport({ profile: PROFILE, weighings: WEIGHINGS, since: day(20) })).toBeNull()
  })

  it('devolve null sem pesagens', () => {
    expect(buildProgressReport({ profile: PROFILE, weighings: [] })).toBeNull();
  });
});

describe('reportFileName', () => {
  it('segue o padrão NOMERelatorioProgressoDDMMAAAA', () => {
    expect(reportFileName('Pessoa Téste da Silva', new Date(2026, 6, 7).getTime())).toBe(
      'PESSOATESTEDASILVARelatorioProgresso07072026',
    );
  });
});
