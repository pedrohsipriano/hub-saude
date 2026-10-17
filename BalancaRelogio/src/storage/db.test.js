// Teste do autorreparo do banco: reproduz o erro "One of the specified object stores was not found"
// (banco já na versão 3, mas sem a tabela "diets", criado por uma versão intermediária do app).
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import {
  addMeasurements,
  deleteWorkout,
  getDietRecord,
  listExports,
  listMeasurements,
  listWorkouts,
  markExported,
  pruneExports,
  saveDietRecord,
  saveWorkout,
} from './db.js'

/** Cria o banco "quebrado": versão 3 com só as tabelas antigas. */
function createBrokenDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('hub-saude', 3)
    request.onupgradeneeded = () => {
      const db = request.result
      const store = db.createObjectStore('measurements', { keyPath: 'id', autoIncrement: true })
      store.createIndex('byUser', 'userId')
      store.createIndex('byTimestamp', 'timestamp')
      db.createObjectStore('profiles', { keyPath: 'userId' })
      db.createObjectStore('exports', { keyPath: 'key' })
      // A tabela "diets" ficou de fora.
    }
    request.onsuccess = () => {
      request.result.close()
      resolve()
    }
    request.onerror = () => reject(request.error)
  })
}

describe('banco local — autorreparo', () => {
  it('cria a tabela que falta e permite salvar e ler planos', async () => {
    await createBrokenDatabase()

    await saveDietRecord('u1', { plans: [{ id: 'p1', name: 'Plano', source: 'teste', importedAt: 1, plan: { meals: [] } }], activeId: 'p1' })
    const record = await getDietRecord('u1')

    expect(record.activeId).toBe('p1')
    expect(record.plans[0].name).toBe('Plano')
  })

  it('converte o formato antigo { plan } em um plano principal', async () => {
    // Grava direto no formato antigo, como a versão anterior do app fazia.
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('hub-saude')
      request.onsuccess = () => {
        const tx = request.result.transaction('diets', 'readwrite')
        tx.objectStore('diets').put({ userId: 'u2', plan: { meals: [] } })
        tx.oncomplete = () => {
          request.result.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
      request.onerror = () => reject(request.error)
    })

    const record = await getDietRecord('u2')
    expect(record).toMatchObject({ activeId: 'principal', plans: [{ id: 'principal', name: 'Plano principal' }] })
  })

  it('treinos: a tabela nova também é criada; apagar remove o resumo do banco de medições', async () => {
    await saveWorkout({ id: 'u|1', userId: 'u', startedAt: 1 })
    await saveWorkout({ id: 'u|2', userId: 'u', startedAt: 2 })
    await addMeasurements([{ id: 'u|workout|workoutDuration|1', userId: 'u', device: 'workout', metric: 'workoutDuration', timestamp: 1, value: 60 }])
    expect((await listWorkouts('u')).map((w) => w.id)).toEqual(['u|2', 'u|1'])
    await deleteWorkout({ id: 'u|1' }, ['u|workout|workoutDuration|1'])
    expect((await listWorkouts('u')).map((w) => w.id)).toEqual(['u|2'])
    expect(await listMeasurements('u')).toEqual([])
  })

  it('treino com trajeto: guardado compacto (binário) e lido de volta como pontos', async () => {
    const start = 1_800_000_000_000
    const points = Array.from({ length: 200 }, (_, i) => ({ lat: -23.5 + i * 0.00001, lon: -46.6, alt: 760, acc: 5, t: start + i * 1000, segment: 0 }))
    await saveWorkout({ id: 'c|1', userId: 'c', startedAt: start, points })
    const [workout] = await listWorkouts('c')
    // Linha reta: sobram só as pontas.
    expect(workout.points).toHaveLength(2)
    expect(workout.points[1].lat).toBeCloseTo(points.at(-1).lat, 6)
    expect(workout.track).toBeUndefined()
  })

  it('apaga os registros de envio antigos', async () => {
    await markExported(['weight|100', `weight|${Date.now()}`])
    expect(await pruneExports(1000)).toBe(0) // enviados agora: ficam (exportedAt recente)
    const all = await listExports()
    expect(all.length).toBeGreaterThanOrEqual(2)
  })
})
