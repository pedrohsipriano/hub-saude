// Relógio simulado: responde às leituras com os quadros reais capturados nos logs HCI,
// com a mesma interface do adapter Web Bluetooth. Serve para desenvolver e testar sem o relógio.
import { WATCH_EVENTS, WATCH_RESPONSES, frame } from '../devices/watch/fixtures.js'
import { CMD, CONTROL, decodeFrame, encodeFrame } from '../devices/watch/njjProtocol.js'

/**
 * @param {object} [options]
 * @param {number} [options.delayMs] - atraso das respostas
 * @param {boolean} [options.emitEvents] - envia passos ao vivo de vez em quando
 */
export function createSimulatedWatchConnector({ delayMs = 30, emitEvents = true } = {}) {
  return {
    async connect() {
      const listeners = new Set()
      const disconnectListeners = new Set()
      const timers = new Set()
      // Quadros que o app escreveu (útil nos testes).
      const writes = []
      let connected = true

      // Respostas por comando consultado.
      const responses = new Map([
        [CMD.FIRMWARE_VERSION, frame(WATCH_RESPONSES.firmware)],
        [CMD.BATTERY, frame(WATCH_RESPONSES.battery)],
        [CMD.DAY_SUMMARY, frame(WATCH_RESPONSES.daySummary)],
        [CMD.HR_DAY, frame(WATCH_RESPONSES.heartRateDay)],
        [CMD.SPO2_DAY, frame(WATCH_RESPONSES.spo2Day)],
        [CMD.BP_DAY, frame(WATCH_RESPONSES.bloodPressureDay)],
        [CMD.HOUR_STEPS, frame(WATCH_RESPONSES.hourSteps)],
        [CMD.SLEEP, frame(WATCH_RESPONSES.sleep)],
        [CMD.SPORT_RECORD, frame(WATCH_RESPONSES.sportRecord)],
        [CMD.SETTINGS, frame(WATCH_RESPONSES.settings)],
      ])

      /** Entrega um quadro aos assinantes depois do atraso. */
      const emit = (bytes) => {
        const timer = setTimeout(() => {
          timers.delete(timer)
          if (connected) listeners.forEach((listener) => listener(bytes))
        }, delayMs)
        timers.add(timer)
      }

      /** Ao gravar o perfil, atualiza os ajustes simulados (como o relógio real faria). */
      const applyUserInfo = (payload) => {
        const settings = decodeFrame(responses.get(CMD.SETTINGS)).payload
        settings.set(payload.slice(0, 9), 4)
        responses.set(CMD.SETTINGS, encodeFrame(CMD.SETTINGS, CONTROL.SYNC, settings))
      }

      // Passos ao vivo a cada 5 s, para a tela mostrar eventos espontâneos.
      if (emitEvents) {
        const interval = setInterval(() => emit(frame(WATCH_EVENTS.sportRealtime)), 5000)
        timers.add(interval)
      }

      return {
        name: 'WATCH X PRO (simulado)',
        writes,
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        async write(bytes) {
          writes.push(bytes)
          const decoded = decodeFrame(bytes)
          if (!decoded) return
          if (decoded.control === CONTROL.READ && responses.has(decoded.cmd)) emit(responses.get(decoded.cmd))
          if (decoded.control === CONTROL.WRITE && decoded.cmd === CMD.USER_INFO) applyUserInfo(decoded.payload)
        },
        onDisconnect(listener) {
          disconnectListeners.add(listener)
        },
        async disconnect() {
          connected = false
          timers.forEach((timer) => {
            clearTimeout(timer)
            clearInterval(timer)
          })
          timers.clear()
          disconnectListeners.forEach((listener) => listener())
        },
      }
    },
  }
}
