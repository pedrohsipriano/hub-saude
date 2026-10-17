// Hook dos planos alimentares de um usuário: vários planos, um deles o "principal"
// (o que vale para a agenda de hoje, a tela inicial e os lembretes).
// Também importa planos de PDF (leitores em diet/importers) ou JSON e marca refeições feitas.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { MEAL_STATUS, mealStatuses, statusValue } from '../diet/adherence.js'
import { DIET_DEVICE, MEAL_DONE_METRIC, normalizePlan } from '../diet/dietPlan.js'
import { hub } from '../hub/hub.js'
import { deleteMeasurement, getDietRecord, saveDietRecord } from '../storage/db.js'
import { useMeasurementRows } from './useMeasurementRows.js'

const EMPTY_RECORD = { plans: [], activeId: null }

/** Nome do plano a partir do nome do arquivo ("Plano alimentar - Fulano.pdf" → "Plano alimentar - Fulano"). */
const nameFromFile = (file) => file.name.replace(/\.(pdf|json)$/i, '').trim() || 'Plano'

/** Arquivo é PDF? (pelo tipo ou pela extensão) */
const isPdf = (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name)

/**
 * @param {string | null} userId
 */
export function useDiet(userId) {
  const [state, setState] = useState({ record: EMPTY_RECORD, loaded: false, forUser: null })
  const { rows } = useMeasurementRows(userId)

  // Carrega os planos quando o usuário muda.
  useEffect(() => {
    if (!userId) return undefined
    let active = true
    getDietRecord(userId)
      .then((record) => active && setState({ record, loaded: true, forUser: userId }))
      .catch((error) => {
        console.error('Falha ao carregar os planos alimentares', error)
        if (active) setState({ record: EMPTY_RECORD, loaded: true, forUser: userId })
      })
    return () => {
      active = false
    }
  }, [userId])

  // Enquanto os planos do usuário atual não carregaram, nada aparece.
  const current = state.forUser === userId
  const record = current ? state.record : EMPTY_RECORD
  const activeEntry = record.plans.find((entry) => entry.id === record.activeId) ?? record.plans[0] ?? null

  /** Grava a lista de planos no banco e no estado. */
  const persist = useCallback(
    async (next) => {
      await saveDietRecord(userId, next)
      setState({ record: next, loaded: true, forUser: userId })
    },
    [userId],
  )

  /** Adiciona um plano; o primeiro plano do usuário vira o principal. */
  const addPlan = useCallback(
    async (rawPlan, { name = 'Plano', source = 'manual', makeActive = false } = {}) => {
      const entry = { id: `plano-${Date.now()}`, name, source, importedAt: Date.now(), plan: normalizePlan(rawPlan) }
      const activeId = makeActive || !record.plans.length ? entry.id : record.activeId
      await persist({ plans: [...record.plans, entry], activeId })
      return entry
    },
    [record, persist],
  )

  /** Salva as alterações de um plano (padrão: o principal). */
  const savePlan = useCallback(
    async (rawPlan, planId = activeEntry?.id) => {
      if (!planId) return (await addPlan(rawPlan, { name: 'Plano principal' })).plan
      const plan = normalizePlan(rawPlan)
      await persist({ ...record, plans: record.plans.map((entry) => (entry.id === planId ? { ...entry, plan } : entry)) })
      return plan
    },
    [record, persist, activeEntry, addPlan],
  )

  /** Define o plano principal. */
  const setActive = useCallback((planId) => persist({ ...record, activeId: planId }), [record, persist])

  /** Renomeia um plano. */
  const renamePlan = useCallback(
    (planId, name) => persist({ ...record, plans: record.plans.map((entry) => (entry.id === planId ? { ...entry, name } : entry)) }),
    [record, persist],
  )

  /** Remove um plano; se era o principal, o primeiro que sobrar assume. */
  const removePlan = useCallback(
    async (planId) => {
      const plans = record.plans.filter((entry) => entry.id !== planId)
      await persist({ plans, activeId: record.activeId === planId ? plans[0]?.id ?? null : record.activeId })
    },
    [record, persist],
  )

  /**
   * Importa um arquivo de plano: PDF (lido pelo app) ou JSON.
   * @returns {Promise<{ entry: object, label: string, warnings: string[] }>}
   */
  const importFile = useCallback(
    async (file, { makeActive = false } = {}) => {
      if (isPdf(file)) {
        // O leitor de PDF só é carregado quando necessário.
        const { readDietPdf } = await import('../diet/pdf/readDietPdf.js')
        const result = await readDietPdf(file, { previousPlan: activeEntry?.plan ?? null })
        const entry = await addPlan(result.plan, { name: nameFromFile(file), source: `PDF · ${result.label}`, makeActive })
        return { entry, label: result.label, warnings: result.warnings }
      }
      const entry = await addPlan(JSON.parse(await file.text()), { name: nameFromFile(file), source: 'arquivo JSON', makeActive })
      return { entry, label: 'JSON', warnings: [] }
    },
    [activeEntry, addPlan],
  )

  // Refeições marcadas: métrica "mealDone:<id da refeição>" no horário da refeição,
  // valor 1 = feita (seguiu o plano) e -1 = não fez corretamente (fora do plano).
  const statuses = useMemo(() => mealStatuses(rows), [rows])
  // Já marcadas, de um jeito ou de outro (saem da "próxima refeição").
  const doneIds = useMemo(() => new Set(statuses.keys()), [statuses])

  /**
   * Marca uma refeição do dia ({ meal, at } de mealsOfDay) como feita ('done'), fora do plano ('off')
   * ou desmarca (null). Trocar de uma para a outra regrava a mesma linha.
   */
  const setMealStatus = useCallback(
    async ({ meal, at }, status) => {
      const metric = `${MEAL_DONE_METRIC}:${meal.id}`
      if (!status) {
        // Mesmo formato de id usado pelo hub ao gravar.
        await deleteMeasurement(`${userId}|${DIET_DEVICE}|${metric}|${at}`)
        hub.emit('measurements:changed')
        return
      }
      hub.emit('measurement', { userId, device: DIET_DEVICE, timestamp: at, metrics: [{ metric, value: statusValue(status), unit: '' }] })
    },
    [userId],
  )

  /** Atalho da tela inicial: marca como feita ou desmarca. */
  const toggleDone = useCallback((entry) => setMealStatus(entry, entry.done ? null : MEAL_STATUS.DONE), [setMealStatus])

  return {
    plans: record.plans,
    activeId: activeEntry?.id ?? null,
    plan: activeEntry?.plan ?? null,
    loaded: current && state.loaded,
    doneIds,
    statuses,
    setMealStatus,
    addPlan,
    savePlan,
    setActive,
    renamePlan,
    removePlan,
    importFile,
    toggleDone,
  }
}
