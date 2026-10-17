// Testes do ajuste às ruas (Roads API), com um fetch falso.
import { describe, expect, it } from 'vitest'
import { routePosition } from '../../workouts/simulatedRoute.js'
import { mergeSnapped, snapBatches, snapTrackToRoads, snapUrl } from './roads.js'

// Volta simulada: um ponto a cada 3 m (1,3 km) e um segundo segmento curto depois de uma pausa.
const track = [
  ...Array.from({ length: 434 }, (_, i) => ({ ...routePosition(i * 3), segment: 0 })),
  ...Array.from({ length: 20 }, (_, i) => ({ ...routePosition(i * 3), segment: 1 })),
]

describe('snapBatches', () => {
  it('afina para ~20 m, separa por segmento e limita 100 pontos por pedido, repetindo o ponto de emenda', () => {
    const batches = snapBatches(track)
    expect(batches.every((batch) => batch.coords.length <= 100 && batch.coords.length >= 2)).toBe(true)
    expect(new Set(batches.map((batch) => batch.segment))).toEqual(new Set([0, 1]))
    const first = batches.filter((batch) => batch.segment === 0)
    // ~1300 m / 21 m ≈ 63 pontos → um pedido só para o segmento 0.
    expect(first).toHaveLength(1)
    // Termina no último ponto do segmento.
    expect(first[0].coords.at(-1)).toEqual({ lat: track[433].lat, lon: track[433].lon })
  })

  it('emenda: o pedido seguinte começa no último ponto do anterior', () => {
    const batches = snapBatches(track, { minSpacing: 0, batchSize: 100 }).filter((batch) => batch.segment === 0)
    expect(batches.length).toBeGreaterThan(1)
    expect(batches[1].coords[0]).toEqual(batches[0].coords.at(-1))
  })

  it('URL com o caminho em "lat,lon|lat,lon" e interpolação', () => {
    const url = new URL(snapUrl([{ lat: -23.5, lon: -46.6 }, { lat: -23.501, lon: -46.6 }], 'K'))
    expect(url.searchParams.get('path')).toBe('-23.500000,-46.600000|-23.501000,-46.600000')
    expect(url.searchParams.get('interpolate')).toBe('true')
    expect(url.searchParams.get('key')).toBe('K')
  })
})

describe('snapTrackToRoads', () => {
  // Fetch falso: devolve os próprios pontos do pedido como "ajustados".
  const echoFetch = async (url) => {
    const path = new URL(url).searchParams.get('path').split('|')
    const snappedPoints = path.map((pair) => {
      const [latitude, longitude] = pair.split(',').map(Number)
      return { location: { latitude, longitude } }
    })
    return { ok: true, status: 200, json: async () => ({ snappedPoints }) }
  }

  it('junta os pedidos sem repetir o ponto de emenda', async () => {
    const snapped = await snapTrackToRoads(track, { apiKey: 'K', fetchImpl: echoFetch })
    expect(snapped[0]).toMatchObject({ segment: 0 })
    expect(snapped.at(-1)).toMatchObject({ segment: 1 })
    expect(mergeSnapped([[{ lat: 0, lon: 0, segment: 0 }], [{ lat: 0, lon: 0, segment: 0 }]])).toHaveLength(1)
  })

  it('erro do Google vira mensagem legível', async () => {
    const deniedFetch = async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'This API key is not authorized to use this service or API.' } }) })
    await expect(snapTrackToRoads(track, { apiKey: 'K', fetchImpl: deniedFetch })).rejects.toThrow('not authorized')
  })
})
