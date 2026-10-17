// Barramento de eventos do hub: os módulos (balança, relógio) publicam eventos
// e os interessados (banco, UI) assinam, sem que um módulo importe o outro.

/**
 * Cria um barramento simples de publicação/assinatura.
 * @returns {{ on: (type: string, listener: Function) => () => void, emit: (type: string, payload?: any) => void }}
 */
export function createEventBus() {
  // Para cada tipo de evento, o conjunto de funções interessadas.
  const listeners = new Map();

  return {
    /** Assina um tipo de evento. Devolve a função que cancela a assinatura. */
    on(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
      return () => listeners.get(type)?.delete(listener);
    },

    /** Publica um evento para todos os assinantes daquele tipo. */
    emit(type, payload) {
      listeners.get(type)?.forEach((listener) => listener(payload));
    },
  };
}
