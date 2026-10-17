// Testes do protocolo do relógio contra os quadros reais dos logs HCI.
import { describe, expect, it } from 'vitest'
import { bytesToHex } from '../../utils/hex.js'
import { OFFICIAL_APP_WRITES, WATCH_EVENTS, WATCH_RESPONSES, frame } from './fixtures.js'
import {
  CMD,
  SLEEP_QUERY_DAY,
  buildRead,
  buildSetPhoneType,
  buildSetStepGoal,
  buildSetTime,
  buildSetUserInfo,
  decodeFrame,
  encodeFrame,
  fromLocalEpochSeconds,
  localEpochSeconds,
  parseAscii,
  parseBattery,
  parseBpSlots,
  parseDaySlots,
  parseDaySummary,
  parseHourSteps,
  parseLiveHeartRate,
  parseSleep,
  buildAlertMessage,
  mergeUserInfo,
  truncateUtf8,
  isIncompleteFrame,
  concatBytes,
  parseSportRealtime,
  parseUserInfo,
} from './njjProtocol.js'

const hex = (bytes) => bytesToHex(bytes).replaceAll(' ', '')
const payloadOf = (hexFrame) => decodeFrame(frame(hexFrame)).payload

describe('montagem de quadros — igual ao app oficial', () => {
  it('leitura simples', () => {
    expect(hex(buildRead(CMD.FIRMWARE_VERSION))).toBe(OFFICIAL_APP_WRITES.readFirmware)
    expect(hex(buildRead(CMD.SLEEP, SLEEP_QUERY_DAY))).toBe(OFFICIAL_APP_WRITES.readSleep)
  })

  it('acertar a hora (16/10/2026 18:12:49, hora local)', () => {
    expect(hex(buildSetTime(new Date(2026, 9, 16, 18, 12, 49)))).toBe(OFFICIAL_APP_WRITES.setTime)
  })

  it('tipo de celular e meta de passos', () => {
    expect(hex(buildSetPhoneType())).toBe(OFFICIAL_APP_WRITES.setPhoneType)
    expect(hex(buildSetStepGoal(9000))).toBe(OFFICIAL_APP_WRITES.setStepGoal9000)
  })

  it('perfil com peso 70 kg', () => {
    const info = parseUserInfo(payloadOf(WATCH_RESPONSES.settings))
    expect(hex(buildSetUserInfo({ ...info, weightKg: 70 }))).toBe(OFFICIAL_APP_WRITES.setUserInfoWeight70)
  })

  it('recusa peso não inteiro ou fora do intervalo', () => {
    const info = parseUserInfo(payloadOf(WATCH_RESPONSES.settings))
    expect(() => buildSetUserInfo({ ...info, weightKg: 70.4 })).toThrow(RangeError)
    expect(() => buildSetUserInfo({ ...info, weightKg: 300 })).toThrow(RangeError)
  })
})

describe('decodeFrame', () => {
  it('aceita um quadro válido e separa comando, controle e dados', () => {
    const decoded = decodeFrame(frame(WATCH_RESPONSES.battery))
    expect(decoded.cmd).toBe(CMD.BATTERY)
    expect(decoded.control).toBe(0x03)
    expect(decoded.payload.length).toBe(5)
  })

  it('recusa checksum errado, cabeçalho errado e quadro truncado', () => {
    const bad = frame(WATCH_RESPONSES.battery)
    bad[bad.length - 1] ^= 0xff
    expect(decodeFrame(bad)).toBeNull()
    expect(decodeFrame(frame('AA21000000'))).toBeNull()
    expect(decodeFrame(frame('BC48030558A0'))).toBeNull()
  })

  it('encodeFrame → decodeFrame é ida e volta', () => {
    const decoded = decodeFrame(encodeFrame(0x41, 0x02, [1, 2, 3]))
    expect(Array.from(decoded.payload)).toEqual([1, 2, 3])
  })
})

describe('hora local', () => {
  it('ida e volta entre data local e segundos do relógio', () => {
    const date = new Date(2026, 9, 16, 18, 12, 49)
    expect(localEpochSeconds(date)).toBe(1792174369)
    expect(fromLocalEpochSeconds(1792174369)).toBe(date.getTime())
  })
})

describe('interpretação das respostas', () => {
  it('firmware', () => {
    expect(parseAscii(payloadOf(WATCH_RESPONSES.firmware))).toBe('NJ-F2H-2.1.5')
  })

  it('bateria 88 % / 4000 mV', () => {
    expect(parseBattery(payloadOf(WATCH_RESPONSES.battery))).toEqual({ percent: 88, millivolts: 4000 })
  })

  it('resumo do dia', () => {
    expect(parseDaySummary(payloadOf(WATCH_RESPONSES.daySummary))).toEqual({
      steps: 0,
      kcal: 0,
      distance: 0,
      heartRate: 71,
      spo2: 95,
      systolic: 113,
      diastolic: 75,
      ecgHeartRate: 80,
    })
  })

  it('FC, SpO2 e pressão do dia: posição 37 = 18:30', () => {
    const heartRate = parseDaySlots(payloadOf(WATCH_RESPONSES.heartRateDay))
    const spo2 = parseDaySlots(payloadOf(WATCH_RESPONSES.spo2Day))
    const pressure = parseBpSlots(payloadOf(WATCH_RESPONSES.bloodPressureDay))
    expect(heartRate).toHaveLength(48)
    expect(heartRate[37]).toBe(68)
    expect(spo2[37]).toBe(97)
    expect(pressure[37]).toEqual({ systolic: 116, diastolic: 76 })
  })

  it('passos por hora: 24 horas zeradas', () => {
    const hours = parseHourSteps(payloadOf(WATCH_RESPONSES.hourSteps))
    expect(hours).toHaveLength(24)
    expect(hours.every((hour) => hour.steps === 0)).toBe(true)
  })

  it('sono: "sem dados" vira null', () => {
    expect(parseSleep(payloadOf(WATCH_RESPONSES.sleep))).toBeNull()
  })

  it('sono no formato do SDK (quadro sintético)', () => {
    const start = localEpochSeconds(new Date(2026, 9, 16, 23, 0))
    const end = localEpochSeconds(new Date(2026, 9, 17, 7, 0))
    const u32 = (v) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff]
    const payload = [...new Array(12).fill(0), ...u32(start), ...u32(end), 1, 120, 2, 90, 0, 10, 1, 200]
    const sleep = parseSleep(Uint8Array.from(payload))
    expect(sleep.startMs).toBe(new Date(2026, 9, 16, 23, 0).getTime())
    expect(sleep.endMs).toBe(new Date(2026, 9, 17, 7, 0).getTime())
    expect(sleep).toMatchObject({ lightMinutes: 320, deepMinutes: 90, awakeMinutes: 10, asleepMinutes: 410 })
  })

  it('eventos: passos ao vivo e FC do ECG', () => {
    expect(parseSportRealtime(payloadOf(WATCH_EVENTS.sportRealtime)).steps).toBe(11)
    expect(parseLiveHeartRate(payloadOf(WATCH_EVENTS.liveHeartRate))).toEqual({ heartRate: 78, finished: false })
    expect(parseLiveHeartRate(payloadOf(WATCH_EVENTS.liveHeartRateFinal))).toEqual({ heartRate: 70, finished: true })
  })

  it('perfil gravado no relógio', () => {
    expect(parseUserInfo(payloadOf(WATCH_RESPONSES.settings))).toEqual({
      sex: 1,
      heightCm: 171,
      weightKg: 67,
      age: 23,
      birthDay: 1,
      birthMonth: 1,
      birthYear: 2000,
      skinTone: 0,
    })
  })
})

describe('sono (regras do SDK) e quadros partidos', () => {
  const u32 = (v) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff]

  it('ignora o "acordado" antes de pegar no sono, para no fim e guarda os totais do cabeçalho', () => {
    const start = localEpochSeconds(new Date(2026, 9, 16, 23, 0))
    const end = localEpochSeconds(new Date(2026, 9, 17, 1, 0)) // 2 h
    const header = [...u32(5), ...u32(80), ...u32(40)] // acordado 5, leve 80, profundo 40 (como o relógio informa)
    // 15 min acordado antes de dormir (não conta), 80 leve, 40 profundo, e uma fase além do fim (não conta).
    const payload = [...header, ...u32(start), ...u32(end), 0, 15, 1, 80, 2, 40, 1, 30]
    const sleep = parseSleep(Uint8Array.from(payload))
    expect(sleep).toMatchObject({ lightMinutes: 80, deepMinutes: 40, awakeMinutes: 0, asleepMinutes: 120 })
    expect(sleep.stages.map((entry) => entry.stage)).toEqual([1, 2])
    expect(sleep.stages[1].startMs).toBe(new Date(2026, 9, 16, 0 + 24, 20).getTime())
    expect(sleep.reported).toEqual({ awakeMinutes: 5, lightMinutes: 80, deepMinutes: 40 })
  })

  it('detecta quadro incompleto e junta os pedaços', () => {
    const full = Uint8Array.from([0xbc, 0x4f, 0x03, 0x02, 0x01, 0x02, 0x03])
    expect(isIncompleteFrame(full.slice(0, 4))).toBe(true)
    expect(isIncompleteFrame(full)).toBe(false)
    expect(Array.from(concatBytes(full.slice(0, 3), full.slice(3)))).toEqual(Array.from(full))
  })
})

describe('notificação para o relógio (0x0B)', () => {
  it('título vazio e texto " ": o tamanho do título não conta o ": " (código do SDK e logs reais)', () => {
    // O comentário do SDK (//BC0B02060002013A20207D) conta o ": " no tamanho, mas o código (size - 2)
    // e o MActivePro (logs: 3 + 12 + 2 + 69 = 86) não contam.
    expect(hex(buildAlertMessage({ type: 0, title: '', text: '' }))).toBe('BC0B02060000013A20207B')
  })

  it('tamanhos como nos logs do MActivePro: 3 + título + 2 + texto', () => {
    const frame = buildAlertMessage({ type: 8, title: 'Maria Silva', text: 'Oi, tudo bem? ' + 'x'.repeat(40) })
    expect(frame[0]).toBe(0xbc)
    expect(frame[1]).toBe(0x0b)
    expect(frame[4]).toBe(8)
    expect(frame[3]).toBe(3 + frame[5] + 2 + frame[6])
    expect([frame[7 + frame[5]], frame[8 + frame[5]]]).toEqual([0x3a, 0x20])
  })

  it('corta o texto em 120 bytes sem quebrar um caractere (acentos e emoji)', () => {
    const cut = truncateUtf8('ç'.repeat(61), 120) // ç = 2 bytes → 60 inteiros
    expect(cut.length).toBe(120)
    expect(new TextDecoder().decode(truncateUtf8('a😀', 3))).toBe('a')
    const frame = buildAlertMessage({ type: 10, title: 'T', text: 'é'.repeat(200) })
    expect(frame[6]).toBe(120)
  })
})

describe('perfil do app → relógio', () => {
  // Perfil gravado no relógio (log): masculino, 171 cm, 70 kg, 23 anos, tom de pele 3.
  const current = { sex: 1, heightCm: 171, weightKg: 70, age: 23, birthDay: 1, birthMonth: 1, birthYear: 2003, skinTone: 3 }

  it('troca altura, nascimento, idade e peso; mantém o tom de pele', () => {
    const { info, changed } = mergeUserInfo(current, { heightCm: 172.4, sex: 1, birthDate: '2000-05-20', age: 24, weightKg: 69.6 })
    expect(changed).toBe(true)
    expect(info).toEqual({ sex: 1, heightCm: 172, weightKg: 70, age: 24, birthDay: 20, birthMonth: 5, birthYear: 2000, skinTone: 3 })
  })

  it('nada diferente → não regrava; campos ausentes ou absurdos não mudam', () => {
    expect(mergeUserInfo(current, { heightCm: 171, sex: 1, weightKg: 70.2, age: 23 }).changed).toBe(false)
    expect(mergeUserInfo(current, { heightCm: 20, weightKg: null, birthDate: 'x' }).info).toEqual(current)
  })
})
