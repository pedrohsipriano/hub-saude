// Plugin nativo do próprio app (android/app/src/main/java/com/hubsaude/app/HubBackgroundPlugin.java).
// Registrado num lugar só: o Capacitor não aceita registrar o mesmo plugin duas vezes.
// Relógio, notificações do celular, bateria, impressão (PDF) e a notificação do treino em andamento.
import { registerPlugin } from '@capacitor/core'

export const HubBackground = registerPlugin('HubBackground')
