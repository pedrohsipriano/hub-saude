// Testes da configuração das notificações no relógio.
import { describe, expect, it } from 'vitest'
import { DEFAULT_APP_TYPES, WATCH_ICON_TYPES, iconTypeFor, nativeNotificationConfig } from './notificationTypes.js'

describe('notificações no relógio', () => {
  it('ícone: o escolhido na tela vence o padrão; app desconhecido = "Outros"', () => {
    expect(iconTypeFor('com.whatsapp')).toBe(10)
    expect(iconTypeFor('com.twitter.android')).toBe(8) // como o MActivePro mandou (log)
    expect(iconTypeFor('com.whatsapp', { 'com.whatsapp': 28 })).toBe(28)
    expect(iconTypeFor('com.app.qualquer')).toBe(0)
  })

  it('configuração para o serviço nativo: padrão + escolhas, bloqueados e modo do texto', () => {
    const config = nativeNotificationConfig({ enabled: true, contentMode: 'appOnly', blocked: ['com.spam'], types: { 'com.x': 18 } })
    expect(config).toMatchObject({ enabled: true, contentMode: 'appOnly', blocked: ['com.spam'], defaultType: 0 })
    expect(config.types['com.x']).toBe(18)
    expect(config.types['com.whatsapp']).toBe(DEFAULT_APP_TYPES['com.whatsapp'])
    expect(nativeNotificationConfig({ contentMode: 'outro' }).contentMode).toBe('full')
    // Lembretes do app no relógio: ligados, a não ser que a pessoa desligue.
    expect(nativeNotificationConfig({}).reminders).toBe(true)
    expect(nativeNotificationConfig({ reminders: false }).reminders).toBe(false)
  })

  it('tipos de 0 a 31, sem buracos', () => {
    expect(WATCH_ICON_TYPES.map((type) => type.id)).toEqual(Array.from({ length: 32 }, (_, i) => i))
  })
})
