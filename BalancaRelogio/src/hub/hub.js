// Instância única do hub e a regra de persistência:
// todo evento "measurement" é gravado no banco local e, depois,
// o hub avisa com "measurements:changed" para as telas recarregarem.
import { createEventBus } from './eventBus.js';
import { addMeasurements } from '../storage/db.js';

// O protótipo tem um único usuário.
export const DEFAULT_USER_ID = 'default';

export const hub = createEventBus();

// Evita assinar duas vezes (ex.: recarga do módulo em desenvolvimento).
let persistenceStarted = false;

/** Liga a gravação automática das medições publicadas no hub. */
export function startPersistence() {
  if (persistenceStarted) return;
  persistenceStarted = true;

  hub.on('measurement', async (event) => {
    try {
      // Uma linha por métrica, no formato de série temporal do README.
      // Cada métrica pode ter o próprio horário (ex.: FC das 18:30 vinda do relógio).
      // A chave é determinística: sincronizar de novo atualiza a linha em vez de duplicar.
      // A unidade não é gravada: ela é fixa por métrica e ninguém a lê do banco (menos espaço por linha).
      const rows = event.metrics.map(({ metric, value, timestamp = event.timestamp }) => ({
        id: `${event.userId}|${event.device}|${metric}|${timestamp}`,
        userId: event.userId,
        device: event.device,
        timestamp,
        metric,
        value,
      }));
      await addMeasurements(rows);
      hub.emit('measurements:changed', event);
    } catch (error) {
      console.error('Falha ao gravar a medição no banco local', error);
      hub.emit('storage:error', error);
    }
  });
}
