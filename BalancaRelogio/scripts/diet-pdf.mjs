#!/usr/bin/env node
// Lê um PDF de plano alimentar com os mesmos leitores do app e mostra o resultado.
// Útil para testar um modelo de PDF novo sem abrir o app.
//
// Uso (dentro de BalancaRelogio):
//   npm run diet:pdf -- "<arquivo.pdf>"                → resumo no terminal
//   npm run diet:pdf -- "<arquivo.pdf>" saida.json     → também grava o plano (importável no app)
import { readFileSync, writeFileSync } from 'node:fs'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { importDietFromPages } from '../src/diet/importers/index.js'
import { extractPdfPages } from '../src/diet/pdf/extractPdfText.js'

const [pdfPath, outPath] = process.argv.slice(2)
if (!pdfPath) {
  console.error('Uso: npm run diet:pdf -- "<arquivo.pdf>" [saida.json]')
  process.exit(1)
}

const pages = await extractPdfPages(pdfjs, new Uint8Array(readFileSync(pdfPath)))
const { label, plan, warnings } = importDietFromPages(pages)

console.log(`Leitor: ${label} · ${pages.length} página(s)`)
if (plan.prescribedBy || plan.prescribedAt) console.log(`Prescrito por: ${plan.prescribedBy || '—'} em ${plan.prescribedAt || '—'}`)
for (const meal of plan.meals) {
  console.log(`\n${meal.time}  ${meal.name}${meal.reminderText ? `  (lembrete: ${meal.reminderText})` : ''}`)
  for (const option of meal.options) {
    if (meal.options.length > 1) console.log(`  [${option.label}]`)
    for (const item of option.items) {
      console.log(`  • ${item.main}`)
      for (const substitute of item.substitutes) console.log(`      ou ${substitute}`)
    }
    if (option.notes) console.log(`  Nota: ${option.notes}`)
  }
}
console.log(`\nOrientações: ${plan.guidelines.length} · Lista de compras: ${plan.shoppingList.length} itens`)
warnings.forEach((warning) => console.log(`Aviso: ${warning}`))

if (outPath) {
  writeFileSync(outPath, JSON.stringify(plan, null, 2), 'utf8')
  console.log(`\nPlano gravado em ${outPath}`)
}
