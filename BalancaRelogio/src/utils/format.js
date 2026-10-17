// Formatação de números e datas no padrão brasileiro.

/**
 * Formata um número com casas decimais fixas (ex.: 70,05).
 * @param {number | null | undefined} value
 * @param {number} [decimals]
 * @returns {string} "--" quando não há valor
 */
export function formatNumber(value, decimals = 1) {
  if (value == null || Number.isNaN(value)) return '--';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Data curta (dd/mm/aaaa). */
export function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString('pt-BR');
}

/** Só a hora (hh:mm). */
export function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Minutos em "7 h 30 min". */
export function formatMinutes(minutes) {
  if (minutes == null) return '--';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} h ${String(rest).padStart(2, '0')} min` : `${rest} min`;
}

/** Data e hora (dd/mm/aaaa hh:mm). */
export function formatDateTime(timestamp) {
  return new Date(timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Nome da classe CSS de um tom de faixa (ex.: 'good' → 'toneGood').
 * Cada CSS Module que usa tons define as classes .tone-low, .tone-good etc.
 */
export function toneClassName(tone) {
  return `tone${tone.charAt(0).toUpperCase()}${tone.slice(1)}`;
}

/** Dia e mês (dd/mm). */
export function formatDayMonth(timestamp) {
  return new Date(timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
