// Conexão com o relógio no app Android pelo serviço nativo WatchService (plugin HubBackground):
// a conexão continua com o app fechado, reconecta sozinha e repassa as notificações do celular.
// O app, quando aberto, "pega carona" nessa conexão — mesma interface dos outros adapters:
//   connect() → { name, address, state, write(bytes), subscribe(listener), onDisconnect(listener),
//                 onState(listener), detach(), disconnect() }
import { BleClient } from '@capacitor-community/bluetooth-le'
import { HubBackground } from '../native/hubBackground.js'
import { bytesToHex, hexToBytes } from '../utils/hex.js'
import { ensureNativeBle } from './nativeBle.js'
import { NJJ_SERVICE_UUID } from './webBluetoothWatchConnector.js'

// Plugin do próprio app, registrado em native/hubBackground.js (reexportado para as telas do relógio).
export { HubBackground }

// Quanto esperar a primeira conexão antes de devolver o controle à tela (o serviço continua tentando).
const CONNECT_WAIT_MS = 25000

// Estados em que não adianta esperar mais.
const FINAL_STATES = ['connected', 'no-permission']

/**
 * Espera o serviço chegar em "connected" (ou o tempo acabar) e devolve o estado. Além de escutar os avisos,
 * confere o estado atual a cada 2 s: o aviso de "conectado" pode ter chegado antes de começar a escutar.
 */
function waitForConnected(timeoutMs) {
  return new Promise((resolve) => {
    let done = false
    let handle = null
    const finish = (state) => {
      if (done) return
      done = true
      clearTimeout(timer)
      clearInterval(poll)
      handle?.remove()
      resolve(state)
    }
    const check = () =>
      HubBackground.watchStatus()
        .then((status) => {
          if (FINAL_STATES.includes(status.state)) finish(status.state)
        })
        .catch(() => {})
    const timer = setTimeout(() => {
      HubBackground.watchStatus().then(
        (status) => finish(status.state === 'stopped' ? 'connecting' : status.state),
        () => finish('reconnecting'),
      )
    }, timeoutMs)
    const poll = setInterval(check, 2000)
    HubBackground.addListener('watchState', ({ state }) => {
      if (FINAL_STATES.includes(state)) finish(state)
    }).then((listener) => {
      handle = listener
      if (done) listener.remove()
    })
    check()
  })
}

/**
 * Relógio já pareado no Bluetooth do celular (Configurações → Bluetooth): não precisa estar anunciando
 * para conectar. Prefere o que já está ligado ao celular agora.
 * @returns {Promise<{ address: string, name: string } | null>}
 */
async function findBondedWatch() {
  const { devices } = await HubBackground.bondedDevices()
  const watches = devices.filter((device) => /watch/i.test(device.name ?? '') && device.type !== 'classic')
  const chosen = watches.find((device) => device.connected) ?? watches[0]
  return chosen ? { address: chosen.address, name: chosen.name ?? 'relógio' } : null
}

/** Busca pelo Bluetooth (lista do Android) e pede o pareamento ao celular, para as próximas conexões. */
async function pickAndPair() {
  const device = await BleClient.requestDevice({ namePrefix: 'WATCH', optionalServices: [NJJ_SERVICE_UUID] })
  // Pareado no celular, o Android mantém a ligação sozinho. Se o relógio não aceitar parear, conecta assim mesmo.
  await HubBackground.pairWatch({ address: device.deviceId }).catch(() => {})
  return { address: device.deviceId, name: device.name ?? 'relógio' }
}

export function createWatchServiceConnector() {
  return {
    /** Relógio lembrado e estado do serviço (sem conectar). */
    status: () => HubBackground.watchStatus(),

    /** Esquece o relógio (para o serviço e apaga o endereço salvo). */
    forget: () => HubBackground.watchStop({ forget: true }),

    /**
     * Escolhe o relógio e liga o serviço que mantém a conexão:
     * - address: o relógio escolhido na lista dos pareados no celular;
     * - sem relógio lembrado: o pareado no Bluetooth do celular; se não houver, a busca (e pareia);
     * - chooseNew: a busca, para trocar de relógio.
     * Com o serviço já ligado, só se conecta a ele.
     * @param {{ chooseNew?: boolean, address?: string, name?: string }} [options]
     */
    async connect({ chooseNew = false, address = null, name = null } = {}) {
      // Permissões de Bluetooth (o serviço precisa delas para conectar).
      await ensureNativeBle()
      let status = await HubBackground.watchStatus()
      let target = address ? { address, name: name ?? 'relógio' } : null
      if (!target && chooseNew) target = await pickAndPair()
      if (!target && !status.address) target = (await findBondedWatch()) ?? (await pickAndPair())
      if (target) {
        await HubBackground.watchStart(target)
        status = { ...status, ...target, state: 'connecting' }
      } else if (!status.running || !status.keepConnected) {
        await HubBackground.watchStart({ address: status.address, name: status.name ?? 'relógio' })
        status = { ...status, state: 'connecting' }
      }

      const state = await waitForConnected(CONNECT_WAIT_MS)
      if (state === 'no-permission') throw new Error('Permita o Bluetooth ("Dispositivos próximos") para o app nas configurações do Android.')

      // Bytes do relógio e mudanças de estado vindos do serviço.
      const dataListeners = new Set()
      const stateListeners = new Set()
      const disconnectListeners = new Set()
      const dataHandle = await HubBackground.addListener('watchData', ({ data }) => {
        const bytes = hexToBytes(data)
        dataListeners.forEach((listener) => listener(bytes))
      })
      const stateHandle = await HubBackground.addListener('watchState', ({ state: next }) => {
        stateListeners.forEach((listener) => listener(next))
        if (next === 'stopped') disconnectListeners.forEach((listener) => listener())
      })
      const detach = async () => {
        await dataHandle.remove()
        await stateHandle.remove()
      }
      // Estado atual (pode ter mudado enquanto os ouvintes eram registrados).
      const latest = await HubBackground.watchStatus().catch(() => null)
      const currentState = latest?.state && latest.state !== 'stopped' ? latest.state : state

      return {
        name: status.name ?? 'Relógio',
        address: status.address,
        state: currentState,
        /** Estado atual do serviço (para corrigir a tela se um aviso se perder). */
        async refreshState() {
          return (await HubBackground.watchStatus()).state
        },
        async write(bytes) {
          await HubBackground.watchWrite({ data: bytesToHex(bytes) })
        },
        subscribe(listener) {
          dataListeners.add(listener)
          return () => dataListeners.delete(listener)
        },
        onDisconnect(listener) {
          disconnectListeners.add(listener)
        },
        onState(listener) {
          stateListeners.add(listener)
          return () => stateListeners.delete(listener)
        },
        /** Só solta a tela (o serviço continua mantendo o relógio conectado). */
        detach,
        /** Desconecta de verdade: para o serviço e não reconecta mais. */
        async disconnect() {
          await detach()
          await HubBackground.watchStop()
        },
      }
    },
  }
}
