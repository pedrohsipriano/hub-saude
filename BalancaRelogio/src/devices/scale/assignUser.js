// Atribuição de uma pesagem a um usuário quando várias pessoas usam a balança.
// A balança não identifica quem subiu: o app compara o peso com o último peso de cada um.

// O mais próximo precisa estar a até 5 kg do último peso...
const MAX_DISTANCE_KG = 5
// ...e pelo menos 2 kg mais perto que o segundo colocado; senão, o app pergunta.
const MIN_MARGIN_KG = 2

/**
 * @param {object} params
 * @param {number} params.weightKg - peso da pesagem nova
 * @param {Array<{ userId: string, name?: string, lastWeightKg: number | null }>} params.users
 * @returns {{ userId: string | null, needsConfirmation: boolean,
 *             candidates: Array<{ userId: string, name?: string, distanceKg: number | null }> }}
 *   candidates em ordem do mais provável para o menos provável
 */
export function assignWeighing({ weightKg, users }) {
  const candidates = users
    .map((user) => ({
      userId: user.userId,
      name: user.name,
      distanceKg: user.lastWeightKg == null ? null : Math.abs(user.lastWeightKg - weightKg),
    }))
    // Quem tem histórico vem antes; entre eles, o mais próximo primeiro.
    .sort((a, b) => (a.distanceKg ?? Infinity) - (b.distanceKg ?? Infinity))

  if (candidates.length === 0) return { userId: null, needsConfirmation: true, candidates }
  // Um usuário só: a pesagem é dele.
  if (candidates.length === 1) return { userId: candidates[0].userId, needsConfirmation: false, candidates }

  const [first, second] = candidates
  const confident =
    first.distanceKg != null &&
    first.distanceKg <= MAX_DISTANCE_KG &&
    (second.distanceKg == null || second.distanceKg - first.distanceKg >= MIN_MARGIN_KG)
  return { userId: confident ? first.userId : null, needsConfirmation: !confident, candidates }
}
