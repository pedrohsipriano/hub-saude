// Adapter do Health Connect: único ponto do app que chama o plugin @capgo/capacitor-health.
// Só funciona no app Android; no navegador, isAvailable() responde "indisponível".
import { Health } from '@capgo/capacitor-health'
import { isNativeApp } from '../../platform.js'
import { PERMISSION_SCOPES } from './healthConnectMapping.js'

const DAY_MS = 24 * 60 * 60 * 1000

/** Tipos de leitura e escrita pedidos ao usuário (a leitura inclui o que o app grava, para confirmar o envio). */
function permissionScopes() {
  return PERMISSION_SCOPES
}

/** Verifica se o Health Connect existe neste aparelho. */
export async function checkAvailability() {
  if (!isNativeApp()) return { available: false, reason: 'O Health Connect só existe no app Android.' }
  try {
    return await Health.isAvailable()
  } catch (error) {
    return { available: false, reason: error.message }
  }
}

/** Abre a tela de permissões do Health Connect. Devolve o que foi autorizado. */
export function requestPermissions() {
  return Health.requestAuthorization(permissionScopes())
}

/** Consulta as permissões já concedidas, sem abrir tela. */
export function checkPermissions() {
  return Health.checkAuthorization(permissionScopes())
}

/** Grava uma amostra (opções no formato do Health.saveSample). */
export function saveSample(options) {
  return Health.saveSample(options)
}

/**
 * Lê os últimos dias: passos somados por dia, FC e sessões de sono.
 * @param {number} [days]
 */
export async function readRecent(days = 7) {
  const endDate = new Date().toISOString()
  const startDate = new Date(Date.now() - days * DAY_MS).toISOString()
  const [steps, heartRate, sleep] = await Promise.all([
    Health.queryAggregated({ dataType: 'steps', startDate, endDate, bucket: 'day', aggregation: 'sum' }),
    Health.readSamples({ dataType: 'heartRate', startDate, endDate, limit: 2000, ascending: true }),
    Health.readSamples({ dataType: 'sleep', startDate, endDate, limit: 50, ascending: true }),
  ])
  return { steps: steps.samples, heartRate: heartRate.samples, sleep: sleep.samples }
}

// Máximo de amostras lidas por tipo na confirmação (contagens nesse limite aparecem como "pelo menos").
export const VERIFY_LIMIT = 5000

/**
 * Lê de volta os últimos dias de cada tipo, com a origem de cada amostra (confirmação da sincronização).
 * Um tipo que falhar (ex.: sem permissão) vira { error } sem derrubar os outros.
 * @param {string[]} types
 * @param {number} days
 * @returns {Promise<Record<string, Array<object> | { error: string }>>}
 */
export async function readForVerification(types, days) {
  const endDate = new Date().toISOString()
  const startDate = new Date(Date.now() - days * DAY_MS).toISOString()
  const entries = await Promise.all(
    types.map(async (dataType) => {
      try {
        const { samples } = await Health.readSamples({ dataType, startDate, endDate, limit: VERIFY_LIMIT, ascending: false })
        return [dataType, samples]
      } catch (error) {
        return [dataType, { error: error.message }]
      }
    }),
  )
  return Object.fromEntries(entries)
}

/** Abre as configurações do Health Connect (para o usuário revisar permissões). */
export function openSettings() {
  return Health.openHealthConnectSettings()
}
