// Testes dos treinos: cálculos de GPS, gravação com pausa e resumo.
import { describe, expect, it } from 'vitest'
import { activityType, defaultWorkoutName } from './activityTypes.js'
import { formatDuration, formatKm, formatPace, formatSpeed, speedToPace } from './format.js'
import { cleanTrack, elevationGain, haversine, projectTrack, recentSpeed, splits, trackDistance } from './geo.js'
import {
  addPoint,
  buildWorkout,
  createRecording,
  finishRecording,
  movingTimeMs,
  pauseRecording,
  resumeRecording,
  summarizeRecording,
  workoutMeasurementIds,
  workoutToMeasurement,
} from './recording.js'
import { cumulativeDistances, easeInOut, routeAtProgress, simplifyForReplay } from './replay.js'
import { LAP_M, SIM_START, routePosition } from './simulatedRoute.js'
import { decodeTrack, encodeTrack, simplifyTrack, trackFromJson, trackToJson } from './trackCodec.js'

// ~0,001° de latitude ≈ 111,2 m.
const METERS_PER_DEG_LAT = 111195
const at = (meters, t, segment = 0, extra = {}) => ({ lat: meters / METERS_PER_DEG_LAT, lon: 0, t, segment, acc: 5, ...extra })

describe('geo', () => {
  it('haversine: 1° de latitude ≈ 111,2 km', () => {
    expect(haversine({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111195, -1)
  })

  it('não liga segmentos separados por pausa', () => {
    const points = [at(0, 0, 0), at(100, 30000, 0), at(500, 60000, 1), at(600, 90000, 1)]
    expect(trackDistance(points)).toBeCloseTo(200, 0)
  })

  it('descarta pontos imprecisos e saltos impossíveis', () => {
    const points = [at(0, 0), at(10, 5000, 0, { acc: 80 }), at(15, 5000), at(5000, 6000)]
    expect(cleanTrack(points, { maxSpeed: 8 }).length).toBe(2)
  })

  it('parciais por km com tempo interpolado', () => {
    // 2,5 km a 5 min/km (3,333 m/s), um ponto a cada 100 m (30 s).
    const points = Array.from({ length: 26 }, (_, i) => at(i * 100, i * 30000))
    const result = splits(points)
    expect(result.map((s) => Math.round(s.durationMs / 1000))).toEqual([300, 300, 150])
    expect(result[2].distanceM).toBeCloseTo(500, 0)
  })

  it('subida acumulada ignora ruído pequeno', () => {
    const alts = [100, 101, 99, 105, 104, 110, 108]
    // 100 → 105 → 110 (as oscilações de 1–2 m não contam).
    expect(elevationGain(alts.map((alt, i) => at(i, i * 1000, 0, { alt })))).toBe(10)
  })

  it('projectTrack: um traço por segmento, dentro do retângulo', () => {
    const strokes = projectTrack([at(0, 0, 0), at(100, 1, 0), at(200, 2, 1), at(300, 3, 1)], 100, 60)
    expect(strokes).toHaveLength(2)
    strokes.flat().forEach(({ x, y }) => {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(60)
    })
  })
})

describe('gravação', () => {
  it('pausa não conta no tempo em movimento e ignora pontos', () => {
    let rec = createRecording('run', 0)
    rec = addPoint(rec, at(0, 0))
    rec = addPoint(rec, at(300, 60000))
    rec = pauseRecording(rec, 60000)
    rec = addPoint(rec, at(9999, 90000)) // ignorado: está pausado
    rec = resumeRecording(rec, 120000)
    rec = addPoint(rec, at(300, 120000))
    rec = addPoint(rec, at(600, 180000))
    rec = finishRecording(rec, 180000)
    expect(rec.points).toHaveLength(4)
    expect(movingTimeMs(rec, 999999)).toBe(120000)

    const summary = summarizeRecording(rec, { weightKg: 70 })
    expect(summary.distanceM).toBe(600)
    expect(summary.movingTimeMs).toBe(120000)
    expect(summary.elapsedMs).toBe(180000)
    expect(summary.paceSecPerKm).toBeCloseTo(200, 0)
    // 9,8 MET × 70 kg × 2 min.
    expect(summary.calories).toBe(Math.round(9.8 * 70 * (2 / 60)))
  })

  it('exercício sem GPS: só tempo e calorias', () => {
    const rec = finishRecording(createRecording('gym', 0), 45 * 60000)
    const summary = summarizeRecording(rec, { weightKg: 80 })
    expect(summary.distanceM).toBe(0)
    expect(summary.paceSecPerKm).toBeNull()
    expect(summary.calories).toBe(300) // 5 MET × 80 kg × 0,75 h
  })

  it('evento do hub e nome padrão', () => {
    const event = workoutToMeasurement({ id: 'w1', type: 'run', startedAt: 1000, endedAt: 2000, distanceM: 5000, movingTimeMs: 1500000, calories: 400 }, 'u')
    expect(event.metrics.map((m) => [m.metric, m.value])).toEqual([
      ['workoutDistance', 5000],
      ['workoutDuration', 1500],
      ['workoutCalories', 400],
    ])
    expect(defaultWorkoutName('run', new Date(2026, 9, 17, 7).getTime())).toBe('Corrida da manhã')
    expect(activityType('xyz').id).toBe('other')
  })
})

describe('formatação e montagem do treino', () => {
  it('tempo, distância, ritmo e velocidade', () => {
    expect(formatDuration(65000)).toBe('1:05')
    expect(formatDuration(3723000)).toBe('1:02:03')
    expect(formatKm(5234)).toBe('5,23')
    expect(formatPace(312)).toBe('5:12')
    expect(formatPace(null)).toBe('--')
    expect(formatSpeed(5)).toBe('18,0')
    expect(speedToPace(0)).toBeNull()
  })

  it('buildWorkout: id do dono + início, nome padrão e ids das linhas do hub', () => {
    const rec = { ...finishRecording(createRecording('walk', new Date(2026, 9, 17, 19).getTime()), new Date(2026, 9, 17, 19, 30).getTime()), userId: 'u' }
    const workout = buildWorkout(rec, { weightKg: null })
    expect(workout.id).toBe(`u|${rec.startedAt}`)
    expect(workout.name).toBe('Caminhada da noite')
    expect(workout.weightKnown).toBe(false)
    expect(workoutMeasurementIds(workout)[0]).toBe(`u|workout|workoutDistance|${rec.startedAt}`)
  })

  it('recentSpeed: velocidade dos últimos 30 s do segmento atual', () => {
    const points = Array.from({ length: 11 }, (_, i) => at(i * 10, i * 5000))
    expect(recentSpeed(points)).toBeCloseTo(2, 1)
    expect(recentSpeed(points.slice(0, 1))).toBeNull()
  })
})

describe('trajeto simulado', () => {
  it('começa na partida, fecha a volta e anda a distância pedida', () => {
    expect(routePosition(0)).toMatchObject(SIM_START)
    expect(LAP_M).toBe(1300)
    expect(haversine(routePosition(LAP_M), SIM_START)).toBeLessThan(0.01)
    expect(haversine(routePosition(100), routePosition(103))).toBeCloseTo(3, 1)
    // Uma volta inteira, um ponto a cada 3 m, mede ~1,3 km.
    const points = Array.from({ length: 434 }, (_, i) => ({ ...routePosition(i * 3), t: i * 1000, segment: 0 }))
    expect(trackDistance(points)).toBeCloseTo(1300, -1)
    // Subida de 9 m, contada em degraus de pelo menos 3 m (o último degrau pode ficar de fora).
    const gain = elevationGain(points)
    expect(gain).toBeGreaterThanOrEqual(6)
    expect(gain).toBeLessThanOrEqual(9)
  })
})

describe('percurso animado', () => {
  // 1 km em linha reta (um ponto a cada 100 m) e um segundo segmento de 200 m depois de uma pausa.
  const line = [
    ...Array.from({ length: 11 }, (_, i) => at(i * 100, i * 1000, 0)),
    ...Array.from({ length: 3 }, (_, i) => at(2000 + i * 100, 20000 + i * 1000, 1)),
  ]

  it('distância acumulada não soma o salto da pausa', () => {
    const cumulative = cumulativeDistances(line)
    expect(cumulative[10]).toBeCloseTo(1000, 0)
    expect(cumulative[11]).toBeCloseTo(1000, 0)
    expect(cumulative.at(-1)).toBeCloseTo(1200, 0)
  })

  it('o ponto fica na fração certa da distância e o trecho termina nele', () => {
    const half = routeAtProgress(line, 0.5)
    expect(haversine(half.head, line[0])).toBeCloseTo(600, 0)
    expect(half.points.at(-1)).toBe(half.head)
    expect(routeAtProgress(line, 1).points).toBe(line)
    // No começo, a cabeça está sobre o ponto de partida.
    expect(haversine(routeAtProgress(line, 0).head, line[0])).toBeLessThan(0.01)
    // Já no segundo segmento: a cabeça é do segmento 1.
    expect(routeAtProgress(line, 0.95).head.segment).toBe(1)
  })

  it('suavização e redução de pontos', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(1)).toBe(1)
    expect(easeInOut(0.5)).toBeCloseTo(0.5)
    const many = Array.from({ length: 2000 }, (_, i) => at(i * 3, i * 1000, i < 1000 ? 0 : 1))
    const reduced = simplifyForReplay(many, 400)
    expect(reduced.length).toBeLessThanOrEqual(404)
    expect(reduced[0]).toBe(many[0])
    expect(reduced.at(-1)).toBe(many.at(-1))
    // Mantém o fim do segmento 0 e o começo do 1.
    expect(reduced).toContain(many[999])
    expect(reduced).toContain(many[1000])
  })
})

describe('formato compacto do trajeto', () => {
  // Volta simulada com um ponto a cada 3 m: lados retos (muitos pontos redundantes) e 4 cantos.
  const lap = Array.from({ length: 434 }, (_, i) => ({ ...routePosition(i * 3), t: i * 1000, segment: 0 }))

  it('simplifica as retas e mantém o desenho e a distância', () => {
    const simple = simplifyTrack(lap, 2)
    expect(simple.length).toBeLessThan(lap.length / 10)
    expect(simple[0]).toBe(lap[0])
    expect(simple.at(-1)).toBe(lap.at(-1))
    expect(trackDistance(simple)).toBeCloseTo(trackDistance(lap), -1)
  })

  it('não junta trechos separados por pausa', () => {
    const twoSegments = [...lap.slice(0, 50), ...lap.slice(50, 100).map((p) => ({ ...p, segment: 1 }))]
    const simple = simplifyTrack(twoSegments)
    expect(new Set(simple.map((p) => p.segment))).toEqual(new Set([0, 1]))
    expect(simple.filter((p) => p.segment === 1)[0]).toBe(twoSegments[50])
  })

  it('codifica e decodifica com erro abaixo de 0,1 m e 0,1 s', () => {
    const start = 1_800_000_000_000
    const points = [
      { lat: -23.5874123, lon: -46.6576456, alt: 760.37, t: start, segment: 0 },
      { lat: -23.5875, lon: -46.6577, alt: null, t: start + 1234, segment: 2 },
    ]
    const track = encodeTrack(points, start)
    expect(track.lat).toBeInstanceOf(Int32Array)
    const back = decodeTrack(track, start)
    expect(haversine(back[0], points[0])).toBeLessThan(0.1)
    expect(back[0].alt).toBeCloseTo(760.4, 1)
    expect(back[1]).toMatchObject({ alt: null, segment: 2, t: start + 1200 })
    expect(decodeTrack(trackFromJson(trackToJson(track)), start)).toEqual(back)
  })
})
