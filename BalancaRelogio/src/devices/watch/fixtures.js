// Quadros reais dos logs HCI de 16/10/2026 (capturas/relogio, README "Protocolo").
// Usados pelos testes e pelo simulador do relógio. Os textos de notificações
// (mensagens pessoais) ficaram de fora de propósito.
import { hexToBytes } from '../../utils/hex.js'

export { hexToBytes }

// Respostas do relógio (controle 03), por comando consultado.
export const WATCH_RESPONSES = {
  // Firmware "NJ-F2H-2.1.5".
  firmware: 'BC3E030C4E4A2D4632482D322E312E35A6',
  // Bateria 88 % / 4000 mV.
  battery: 'BC48030558A00F000007',
  // Resumo do dia: 0 passos; FC 71, SpO2 95, pressão 113/75, ECG 80.
  daySummary: 'BC690314000000000000000000000000475F714B5000720125',
  // FC do dia (18:30:43): posição 37 (18:30) = 68 bpm.
  heartRateDay: 'BC5F03305454004D47543B464B4C4A474748734D475948514548414F503E524F004700430050006800440000000000000000000093',
  // SpO2 do dia (18:30:43): posição 37 = 97 %.
  spo2Day: 'BC600330616000615F62605F6162625F5F616060626262605F616062615F626000610061005F006000610000000000000000000012',
  // Pressão do dia (18:30:43): posição 37 = 116/76.
  bloodPressureDay:
    'BC6B03607C4A754D000075487C4A754D7C4F75487C4A6E4B7C4F744C7C4A744C7C4F6E4B754D6E4B7C4F74477C4A744C7C4F74477C4A744C7C4F74470000744C00006E460000744C000074470000744C000000000000000000000000000000000000000031',
  // Passos por hora: tudo zero (0 passos no dia).
  hourSteps: `BC4A0360${'00'.repeat(96)}00`,
  // Sono: sem dados.
  sleep: 'BC4F03010000',
  // Treinos do relógio (0x50, SPORT_RECORD): sem dados (log de 16/10/2026).
  sportRecord: 'BC5003010000',
  // Perfil + ajustes (200 bytes): sexo 01, 171 cm, 67 kg, 23 anos, tom de pele 00.
  settings:
    'BC4E03C82169D26A01AB43170101D007001D0300070100000005010000010000FFFFFFFF0000000002000000000000FFFF020001010007078082868183848500000050010100010100011E010A010101DD0400000000000000000100110CA06162A3A485868788898A908B8C8D8E8F000000010000000000000000000000000000000000000000000000000000000000000000000F100900010100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004A',
}

// Eventos espontâneos do relógio.
export const WATCH_EVENTS = {
  // Passos ao vivo: 11 passos.
  sportRealtime: 'BC5103100B00000029000000020000000000000036',
  // FC ao vivo durante o ECG: 78 bpm medindo; 70 bpm no fim.
  liveHeartRate: 'BC780302004E4E',
  liveHeartRateFinal: 'BC780302024648',
}

// Comandos enviados pelo app oficial (para conferir os nossos encoders).
export const OFFICIAL_APP_WRITES = {
  // Hora 16/10/2026 18:12:49.
  setTime: 'BC4302042169D26AC6',
  // Perfil com peso 70 kg (18:48:44); os demais campos iguais ao "settings".
  setUserInfoWeight70: 'BC41020901AB46170101D00700E2',
  // Meta de 9000 passos.
  setStepGoal9000: 'BC490204282300004B',
  // Tipo de celular Android.
  setPhoneType: 'BC6702010202',
  // Leitura do firmware.
  readFirmware: 'BC3E01010000',
  // Leitura do sono (dia 03, como o app oficial).
  readSleep: 'BC4F01010303',
}

/** Atalho: hex → bytes de um quadro das tabelas acima. */
export const frame = (hex) => hexToBytes(hex)
