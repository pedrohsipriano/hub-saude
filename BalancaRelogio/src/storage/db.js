// Adapter do banco local (IndexedDB). Toda a persistência passa por aqui,
// para que no app nativo/mobile baste trocar este arquivo (ex.: por SQLite).
// Para ocupar pouco espaço no celular, o trajeto dos treinos é guardado simplificado e em binário
// (workouts/trackCodec.js), e os registros de envio antigos ao Health Connect são apagados.
import { decodeTrack, encodeTrack, simplifyTrack } from '../workouts/trackCodec.js';

const DB_NAME = 'hub-saude';
const MEASUREMENTS = 'measurements';
const PROFILES = 'profiles';
const EXPORTS = 'exports';
const DIETS = 'diets';
const WORKOUTS = 'workouts';
// Tabelas que o app precisa. Se faltar alguma, a abertura sobe a versão e cria (autorreparo).
const REQUIRED_STORES = [MEASUREMENTS, PROFILES, EXPORTS, DIETS, WORKOUTS];

// A conexão é aberta uma vez e reaproveitada.
let dbPromise = null;

/** Cria as tabelas que ainda não existem (chamado em toda atualização de versão). */
function createMissingStores(db) {
  if (!db.objectStoreNames.contains(MEASUREMENTS)) {
    // Séries temporais: { id, userId, device, metric, timestamp, value, unit }.
    const store = db.createObjectStore(MEASUREMENTS, { keyPath: 'id', autoIncrement: true });
    store.createIndex('byUser', 'userId');
    store.createIndex('byTimestamp', 'timestamp');
  }
  if (!db.objectStoreNames.contains(PROFILES)) {
    // Um perfil por usuário: { userId, name, heightCm, birthDate, sex, goals }.
    db.createObjectStore(PROFILES, { keyPath: 'userId' });
  }
  if (!db.objectStoreNames.contains(EXPORTS)) {
    // Registros já enviados a serviços externos: { key, exportedAt }.
    db.createObjectStore(EXPORTS, { keyPath: 'key' });
  }
  if (!db.objectStoreNames.contains(DIETS)) {
    // Planos alimentares de cada usuário: { userId, plans: [...], activeId }.
    db.createObjectStore(DIETS, { keyPath: 'userId' });
  }
  if (!db.objectStoreNames.contains(WORKOUTS)) {
    // Treinos gravados: { id, userId, type, name, startedAt, endedAt, distanceM, movingTimeMs, points, splits, ... }.
    const store = db.createObjectStore(WORKOUTS, { keyPath: 'id' });
    store.createIndex('byUser', 'userId');
  }
}

/**
 * Abre o banco numa versão (sem versão = a versão atual; cria o banco se não existir).
 * @param {number} [version]
 */
function openAt(version) {
  return new Promise((resolve, reject) => {
    const request = version ? indexedDB.open(DB_NAME, version) : indexedDB.open(DB_NAME);
    request.onupgradeneeded = () => createMissingStores(request.result);
    request.onsuccess = () => {
      const db = request.result;
      // Outra aba pediu uma versão nova: fecha esta conexão para não travar a atualização.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
}

/** Abre o banco e, se faltar alguma tabela, sobe a versão para criá-la. */
async function openWithRepair() {
  const db = await openAt();
  const missing = REQUIRED_STORES.filter((name) => !db.objectStoreNames.contains(name));
  if (!missing.length) return db;
  const nextVersion = db.version + 1;
  db.close();
  return openAt(nextVersion);
}

/** Conexão compartilhada com o banco. */
function openDb() {
  if (!dbPromise) {
    dbPromise = openWithRepair().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

/** Converte uma requisição do IndexedDB em Promise. */
function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Espera uma transação terminar (ou falhar). */
function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/**
 * Grava várias linhas de medição numa única transação.
 * Usa "put": uma linha com o mesmo id é substituída (sincronizar de novo não duplica).
 * @param {Array<object>} rows
 */
export async function addMeasurements(rows) {
  const db = await openDb();
  const transaction = db.transaction(MEASUREMENTS, 'readwrite');
  const store = transaction.objectStore(MEASUREMENTS);
  rows.forEach((row) => store.put(row));
  await transactionDone(transaction);
}

/**
 * Lista todas as medições de um usuário.
 * @param {string} userId
 * @returns {Promise<Array<object>>}
 */
export async function listMeasurements(userId) {
  const db = await openDb();
  const store = db.transaction(MEASUREMENTS, 'readonly').objectStore(MEASUREMENTS);
  return requestToPromise(store.index('byUser').getAll(userId));
}

/**
 * Lê o perfil de um usuário (ou undefined se ainda não existir).
 * @param {string} userId
 */
export async function getProfile(userId) {
  const db = await openDb();
  const store = db.transaction(PROFILES, 'readonly').objectStore(PROFILES);
  return requestToPromise(store.get(userId));
}

/**
 * Lista as medições de todos os usuários (usado para atribuir pesagens).
 * @returns {Promise<Array<object>>}
 */
export async function listAllMeasurements() {
  const db = await openDb();
  return requestToPromise(db.transaction(MEASUREMENTS, 'readonly').objectStore(MEASUREMENTS).getAll());
}

/**
 * Apaga uma linha de medição pelo id.
 * @param {string | number} id
 */
export async function deleteMeasurement(id) {
  const db = await openDb();
  const transaction = db.transaction(MEASUREMENTS, 'readwrite');
  transaction.objectStore(MEASUREMENTS).delete(id);
  await transactionDone(transaction);
}

/**
 * Apaga uma pesagem: todas as linhas de um aparelho naquele horário (peso, impedância…).
 * @param {string} userId
 * @param {string} device
 * @param {number} timestamp
 */
export async function deleteMeasurementsAt(userId, device, timestamp) {
  const db = await openDb();
  const transaction = db.transaction(MEASUREMENTS, 'readwrite');
  const store = transaction.objectStore(MEASUREMENTS);
  const rows = await requestToPromise(store.index('byUser').getAll(userId));
  rows.filter((row) => row.device === device && row.timestamp === timestamp).forEach((row) => store.delete(row.id));
  await transactionDone(transaction);
}

/** Lista todos os perfis (usuários). */
export async function listProfiles() {
  const db = await openDb();
  return requestToPromise(db.transaction(PROFILES, 'readonly').objectStore(PROFILES).getAll());
}

/**
 * Apaga um perfil e o plano alimentar dele (as medições ficam no banco).
 * @param {string} userId
 */
export async function deleteProfile(userId) {
  const db = await openDb();
  const transaction = db.transaction([PROFILES, DIETS], 'readwrite');
  transaction.objectStore(PROFILES).delete(userId);
  transaction.objectStore(DIETS).delete(userId);
  await transactionDone(transaction);
}

/**
 * Lê os planos alimentares de um usuário.
 * Registros antigos ({ userId, plan }) viram um plano "principal".
 * @returns {Promise<{ plans: Array<{ id: string, name: string, source: string, importedAt: number, plan: object }>, activeId: string | null }>}
 */
export async function getDietRecord(userId) {
  const db = await openDb();
  const record = await requestToPromise(db.transaction(DIETS, 'readonly').objectStore(DIETS).get(userId));
  if (!record) return { plans: [], activeId: null };
  if (record.plans) return { plans: record.plans, activeId: record.activeId ?? record.plans[0]?.id ?? null };
  // Formato antigo: um plano só.
  const plan = record.plan ? [{ id: 'principal', name: 'Plano principal', source: 'importado', importedAt: 0, plan: record.plan }] : [];
  return { plans: plan, activeId: plan[0]?.id ?? null };
}

/**
 * Salva os planos alimentares de um usuário.
 * @param {string} userId
 * @param {{ plans: Array<object>, activeId: string | null }} record
 */
export async function saveDietRecord(userId, record) {
  const db = await openDb();
  const transaction = db.transaction(DIETS, 'readwrite');
  transaction.objectStore(DIETS).put({ userId, plans: record.plans, activeId: record.activeId });
  await transactionDone(transaction);
}

/**
 * Treino → registro compacto: o trajeto (e o ajustado às ruas) simplificado e em binário.
 * A distância, as parciais e a subida já foram calculadas com o trajeto inteiro.
 */
function packWorkout(workout) {
  const { points, snappedPoints, ...record } = workout;
  if (points?.length) record.track = encodeTrack(simplifyTrack(points, 2), workout.startedAt);
  if (snappedPoints?.length) record.snapped = encodeTrack(simplifyTrack(snappedPoints, 1), workout.startedAt);
  return record;
}

/** Registro → treino com os pontos. Registros antigos (pontos como objetos) passam como estão. */
function unpackWorkout(record) {
  if (!record.track && !record.snapped) return record;
  const { track, snapped, ...workout } = record;
  workout.points = track ? decodeTrack(track, record.startedAt) : [];
  if (snapped) workout.snappedPoints = decodeTrack(snapped, record.startedAt);
  return workout;
}

/**
 * Salva (cria ou substitui) um treino, no formato compacto.
 * @param {{ id: string, userId: string }} workout
 */
export async function saveWorkout(workout) {
  const db = await openDb();
  const transaction = db.transaction(WORKOUTS, 'readwrite');
  transaction.objectStore(WORKOUTS).put(packWorkout(workout));
  await transactionDone(transaction);
}

/**
 * Lista os treinos de um usuário (do mais recente para o mais antigo).
 * Treinos gravados no formato antigo são convertidos para o compacto na primeira leitura.
 * @param {string} userId
 */
export async function listWorkouts(userId) {
  const db = await openDb();
  const store = db.transaction(WORKOUTS, 'readonly').objectStore(WORKOUTS);
  const records = await requestToPromise(store.index('byUser').getAll(userId));
  const legacy = records.filter((record) => Array.isArray(record.points) || Array.isArray(record.snappedPoints));
  if (legacy.length) {
    const transaction = db.transaction(WORKOUTS, 'readwrite');
    legacy.forEach((record) => transaction.objectStore(WORKOUTS).put(packWorkout(record)));
    await transactionDone(transaction);
  }
  return records.map(unpackWorkout).sort((a, b) => b.startedAt - a.startedAt);
}

/**
 * Apaga um treino e as linhas de resumo dele no banco de medições.
 * @param {{ id: string }} workout
 * @param {Array<string>} measurementIds - ids das linhas do hub geradas pelo treino
 */
export async function deleteWorkout(workout, measurementIds = []) {
  const db = await openDb();
  const transaction = db.transaction([WORKOUTS, MEASUREMENTS], 'readwrite');
  transaction.objectStore(WORKOUTS).delete(workout.id);
  measurementIds.forEach((id) => transaction.objectStore(MEASUREMENTS).delete(id));
  await transactionDone(transaction);
}

/**
 * Filtra as chaves que ainda não foram enviadas.
 * @param {string[]} keys
 * @returns {Promise<string[]>}
 */
export async function filterNotExported(keys) {
  if (!keys.length) return [];
  const db = await openDb();
  const store = db.transaction(EXPORTS, 'readonly').objectStore(EXPORTS);
  const found = await Promise.all(keys.map((key) => requestToPromise(store.get(key))));
  return keys.filter((_, index) => !found[index]);
}

/**
 * Lista todos os envios registrados ({ key: "tipo|horário", exportedAt }), para a confirmação da sincronização.
 * @returns {Promise<Array<{ key: string, exportedAt: number }>>}
 */
export async function listExports() {
  const db = await openDb();
  return requestToPromise(db.transaction(EXPORTS, 'readonly').objectStore(EXPORTS).getAll());
}

/**
 * Apaga os registros de envio de dados mais antigos que `before` (a recuperação só olha os últimos 30 dias,
 * então essas chaves não servem mais para evitar duplicar).
 * @param {number} before - horário (ms) do dado
 * @returns {Promise<number>} quantos foram apagados
 */
export async function pruneExports(before) {
  const db = await openDb();
  const transaction = db.transaction(EXPORTS, 'readwrite');
  const store = transaction.objectStore(EXPORTS);
  const records = await requestToPromise(store.getAll());
  const old = records.filter((record) => Number(record.key.split('|')[1]) < before && (record.exportedAt ?? 0) < before);
  old.forEach((record) => store.delete(record.key));
  await transactionDone(transaction);
  return old.length;
}

/**
 * Marca chaves como enviadas.
 * @param {string[]} keys
 */
export async function markExported(keys) {
  if (!keys.length) return;
  const db = await openDb();
  const transaction = db.transaction(EXPORTS, 'readwrite');
  const store = transaction.objectStore(EXPORTS);
  const exportedAt = Date.now();
  keys.forEach((key) => store.put({ key, exportedAt }));
  await transactionDone(transaction);
}

/**
 * Cria ou atualiza o perfil (a chave é o userId).
 * @param {{ userId: string }} profile
 */
export async function saveProfile(profile) {
  const db = await openDb();
  const transaction = db.transaction(PROFILES, 'readwrite');
  transaction.objectStore(PROFILES).put(profile);
  await transactionDone(transaction);
}
