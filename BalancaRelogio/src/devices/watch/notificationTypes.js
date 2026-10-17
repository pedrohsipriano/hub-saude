// Notificações do celular no relógio (funções puras): tipos de ícone, ícone padrão de cada app
// e a configuração enviada ao serviço nativo (que repassa as notificações mesmo com o app fechado).
//
// Os números de tipo vêm do SDK da NJJ (MessageTypeConst). Nos logs, o MActivePro mandou o X (Twitter)
// como tipo 8, diferente do SDK (Twitter = 15): por isso o "Testar ícones" mostra no relógio o ícone de
// cada número, e cada app pode ter o ícone trocado na tela.

export const WATCH_ICON_TYPES = [
  { id: 0, label: 'Outros' },
  { id: 1, label: 'Chamada' },
  { id: 2, label: 'Chamada perdida' },
  { id: 3, label: 'SMS' },
  { id: 4, label: 'E-mail' },
  { id: 5, label: 'Agenda' },
  { id: 6, label: 'FaceTime' },
  { id: 7, label: 'QQ' },
  { id: 8, label: 'X / Skype' },
  { id: 9, label: 'WeChat' },
  { id: 10, label: 'WhatsApp' },
  { id: 11, label: 'Gmail' },
  { id: 12, label: 'Hangouts' },
  { id: 13, label: 'Inbox' },
  { id: 14, label: 'LINE' },
  { id: 15, label: 'Twitter' },
  { id: 16, label: 'Facebook' },
  { id: 17, label: 'Messenger' },
  { id: 18, label: 'Instagram' },
  { id: 19, label: 'Weibo' },
  { id: 20, label: 'KakaoTalk' },
  { id: 21, label: 'Facebook Pages' },
  { id: 22, label: 'Viber' },
  { id: 23, label: 'VK' },
  { id: 24, label: 'Telegram' },
  { id: 25, label: 'GD' },
  { id: 26, label: 'Snapchat' },
  { id: 27, label: 'LinkedIn' },
  { id: 28, label: 'WhatsApp Business' },
  { id: 29, label: 'Zalo' },
  { id: 30, label: 'Outlook' },
  { id: 31, label: 'VK (mensagens)' },
]

// Ícone padrão por app Android (pacote → tipo). Apps fora da lista usam "Outros" (0).
export const DEFAULT_APP_TYPES = {
  'com.whatsapp': 10,
  'com.whatsapp.w4b': 28,
  'org.telegram.messenger': 24,
  'org.telegram.plus': 24,
  'com.instagram.android': 18,
  'com.facebook.katana': 16,
  'com.facebook.orca': 17,
  'com.facebook.pages.app': 21,
  'com.twitter.android': 8, // confirmado no log do MActivePro
  'com.google.android.gm': 11,
  'com.microsoft.office.outlook': 30,
  'com.samsung.android.email.provider': 4,
  'com.linkedin.android': 27,
  'com.snapchat.android': 26,
  'jp.naver.line.android': 14,
  'com.skype.raider': 8,
  'com.viber.voip': 22,
  'com.tencent.mm': 9,
  'com.kakao.talk': 20,
  'com.vkontakte.android': 23,
  'com.zing.zalo': 29,
  // SMS e agenda (Samsung e Google)
  'com.samsung.android.messaging': 3,
  'com.google.android.apps.messaging': 3,
  'com.android.mms': 3,
  'com.samsung.android.calendar': 5,
  'com.google.android.calendar': 5,
  // Telefone: chamadas perdidas (as chamadas tocando já vão como "Chamada", tipo 1)
  'com.samsung.android.dialer': 2,
  'com.google.android.dialer': 2,
  'com.android.server.telecom': 2,
}

export const DEFAULT_NOTIFICATION_SETTINGS = {
  enabled: false,
  contentMode: 'full', // 'full' = remetente e mensagem; 'appOnly' = só o nome do app (privacidade)
  blocked: [], // pacotes que não vão para o relógio
  types: {}, // ícone escolhido na tela para cada pacote (substitui o padrão)
}

/** Ícone (tipo) de um app: o escolhido na tela, senão o padrão, senão "Outros". */
export function iconTypeFor(packageName, overrides = {}) {
  return overrides[packageName] ?? DEFAULT_APP_TYPES[packageName] ?? 0
}

/** Configuração no formato do plugin nativo (configureNotifications). */
export function nativeNotificationConfig(settings) {
  return {
    enabled: Boolean(settings.enabled),
    contentMode: settings.contentMode === 'appOnly' ? 'appOnly' : 'full',
    blocked: settings.blocked ?? [],
    types: { ...DEFAULT_APP_TYPES, ...settings.types },
    defaultType: 0,
  }
}
