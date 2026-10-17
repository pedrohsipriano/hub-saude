// Testes dos leitores de PDF com páginas sintéticas no layout do WebDiet (sem dados reais).
import { describe, expect, it } from 'vitest'
import { importDietFromPages } from './index.js'
import { assignMealTimes } from './mealTimes.js'
import { normalizeName, sentenceCase } from './webDiet.js'

/** Trecho de texto na posição (x, y) com fonte `size` e largura aproximada pelo número de letras. */
const t = (str, x, y, size = 7.5, width = str.length * size * 0.45) => ({ str, x, y, size, width })
const page = (number, items) => ({ number, width: 595, height: 842, items })

// Página 1: cabeçalho, café da manhã (rowspan, linha larga, quebra de linha, bloco "- ou -") e início do almoço.
const PAGE_1 = page(1, [
  t('Profissional Exemplo', 430, 790, 9),
  t('NUTRICIONISTA - CRN0 00000', 410, 777, 9),
  t('Página 1/2 | Paciente Fulano | Prescrito em: 01/02/2026.', 46, 36, 7.5),
  t('Cardápio Mensal', 234, 709, 13.5),
  t('Café da manhã', 241, 643, 13.5),
  t('Opção principal', 47, 610, 6),
  t('Opção de substituição', 302, 610, 6.8),
  // Linha que atravessa as duas colunas (sem substituição).
  t('Escolha 1 porção do grupo "Frutas" na lista de substituição (em anexo).', 47, 575, 7.5, 303),
  // Principal centralizado entre 3 substituições; a de cima fica a 18 pt (mais longe que a linha larga).
  t('Pão francês - 1 Unidade(s) (50g)', 47, 540),
  t('Tapioca - 2 Colher(es) (40g)', 302, 558),
  t('Cuscuz - 6 Colher(es) (90g)', 302, 540),
  t('Pão integral - 2 Fatia(s) (50g)', 302, 523),
  // Substituição quebrada em duas linhas.
  t('Queijo branco - 1 Fatia(s) (30g)', 47, 500),
  t('Requeijão light - 2 Colher(es)', 302, 504),
  t('cheia(s) (60g)', 302, 495),
  t('Suco de laranja - 1 Copo(s) (240ml)', 47, 480, 7.5, 260),
  t('• Opções de substituição para Suco de laranja:', 43, 460, 9),
  t('Suco de uva - 1 Copo(s) (240ml)', 43, 436, 9),
  t('- ou -', 220, 436, 9),
  t('Suco de caju - 1 Copo(s) (240ml)', 250, 436, 9),
  t('Almoço', 270, 350, 13.5),
  t('Opção principal', 47, 316, 6),
  t('Opção de substituição', 302, 316, 6.8),
  t('Arroz - 5 Colher(es) (125g)', 47, 282),
  t('Macarrão - 5 Colher(es) (125g)', 302, 282),
])

// Página 2: continuação do almoço, observações longas, jantar com 2 opções e lista de compras.
const PAGE_2 = page(2, [
  t('Feijão - 2 Concha(s) (130g)', 47, 702),
  t('Grão de bico - 2 Colher(es) (90g)', 302, 702),
  t('Observações:', 43, 660, 9),
  t('ORIENTAÇÃO NUTRICIONAL', 43, 640, 9),
  t('Coma vegetais em metade do prato e varie as cores ao longo da semana, escolhendo', 43, 615, 9),
  t('legumes da estação e preparações com pouco óleo.', 43, 603, 9),
  t('Após o almoço, tomar 1 cápsula de vitamina D, conforme a orientação do plano.', 43, 580, 9),
  t('Jantar', 275, 540, 13.5),
  t('Opção principal', 47, 510, 6),
  t('Opção de substituição', 302, 510, 6.8),
  t('Frango - 2 Bife(s) (100g)', 47, 490),
  t('Observações:', 43, 470, 9),
  t('OU, TROCAR POR OVOS.', 43, 450, 9),
  t('Jantar - Opção 2', 236, 420, 13.5),
  t('Opção principal', 47, 390, 6),
  t('Opção de substituição', 302, 390, 6.8),
  t('Omelete - 2 Ovo(s)', 47, 370),
  t('Lista de compras', 233, 300, 13.5),
  t('◯', 43, 270, 9),
  t('Arroz', 61, 270, 9),
  t('◯', 43, 256, 9),
  t('Feijão', 61, 256, 9),
])

describe('importDietFromPages — WebDiet', () => {
  const { importer, plan, warnings } = importDietFromPages([PAGE_1, PAGE_2])
  const meal = (name) => plan.meals.find((m) => m.name === name)

  it('reconhece o formato e lê profissional, data e refeições', () => {
    expect(importer).toBe('webdiet')
    expect(plan.prescribedBy).toBe('Profissional Exemplo — NUTRICIONISTA - CRN0 00000')
    expect(plan.prescribedAt).toBe('01/02/2026')
    expect(plan.meals.map((m) => m.name)).toEqual(['Café da manhã', 'Almoço', 'Jantar'])
    expect(warnings[0]).toMatch(/Horários sugeridos/)
  })

  it('casa cada substituição com o principal certo (linha larga não recebe substituição)', () => {
    const [choose, bread, cheese, juice] = meal('Café da manhã').options[0].items
    expect(choose.substitutes).toEqual([])
    expect(bread.substitutes).toEqual(['Tapioca - 2 Colher(es) (40g)', 'Cuscuz - 6 Colher(es) (90g)', 'Pão integral - 2 Fatia(s) (50g)'])
    // Linha quebrada juntada.
    expect(cheese.substitutes).toEqual(['Requeijão light - 2 Colher(es) cheia(s) (60g)'])
    // Bloco "Opções de substituição para …" com "- ou -".
    expect(juice.substitutes).toEqual(['Suco de uva - 1 Copo(s) (240ml)', 'Suco de caju - 1 Copo(s) (240ml)'])
  })

  it('tabela que continua na página seguinte', () => {
    expect(meal('Almoço').options[0].items).toEqual([
      { main: 'Arroz - 5 Colher(es) (125g)', substitutes: ['Macarrão - 5 Colher(es) (125g)'] },
      { main: 'Feijão - 2 Concha(s) (130g)', substitutes: ['Grão de bico - 2 Colher(es) (90g)'] },
    ])
  })

  it('observações: longas viram orientações; curtas, nota; "Após o almoço" vira lembrete', () => {
    expect(plan.guidelines[0]).toBe('Orientação nutricional')
    expect(plan.guidelines[1]).toMatch(/^Coma vegetais .* pouco óleo\.$/)
    expect(meal('Almoço').reminderText).toBe('Depois do(a) almoço: tomar 1 cápsula de vitamina D')
    expect(meal('Jantar').options[0].notes).toBe('Ou, trocar por ovos.')
  })

  it('"Jantar - Opção 2" vira a 2ª opção do Jantar; lista de compras', () => {
    expect(meal('Jantar').options.map((o) => o.label)).toEqual(['Opção 1', 'Opção 2'])
    expect(meal('Jantar').options[1].items[0].main).toBe('Omelete - 2 Ovo(s)')
    expect(plan.shoppingList).toEqual(['Arroz', 'Feijão'])
  })
})

describe('leitor genérico e horários', () => {
  it('PDF que não é do WebDiet: títulos com horário e itens com "ou"', () => {
    const generic = page(1, [
      t('07:30 Café da manhã', 47, 700, 11),
      t('Pão integral ou tapioca', 47, 680, 11),
      t('Almoço', 47, 640, 11),
      t('Arroz | Batata', 47, 620, 11),
    ])
    const { importer, plan } = importDietFromPages([generic])
    expect(importer).toBe('texto')
    expect(plan.meals.map((m) => [m.name, m.time])).toEqual([
      ['Café da manhã', '07:30'],
      ['Almoço', '12:00'],
    ])
    expect(plan.meals[0].options[0].items[0]).toEqual({ main: 'Pão integral', substitutes: ['tapioca'] })
  })

  it('mantém os horários do plano atual e respeita a ordem das refeições', () => {
    const raw = { meals: [{ name: 'Café da manhã' }, { name: 'Pre treino' }, { name: 'Jantar' }] }
    const previous = { meals: [{ name: 'Pré-treino', time: '18:15' }, { name: 'Jantar', time: '17:00' }] }
    const { plan, suggested } = assignMealTimes(raw, normalizeName, previous)
    // Jantar 17:00 viria antes do pré-treino: é empurrado para 1 h depois.
    expect(plan.meals.map((m) => m.time)).toEqual(['07:00', '18:15', '19:15'])
    expect(suggested).toEqual(['Café da manhã'])
  })

  it('PDF sem texto (escaneado) → erro explicativo', () => {
    expect(() => importDietFromPages([page(1, [])])).toThrow(/não tem texto/)
  })

  it('sentenceCase só mexe em textos todos em maiúsculas', () => {
    expect(sentenceCase('OU, COMER A FRUTA.')).toBe('Ou, comer a fruta.')
    expect(sentenceCase('Pão francês')).toBe('Pão francês')
  })
})
