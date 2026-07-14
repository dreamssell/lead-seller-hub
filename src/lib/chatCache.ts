/**
 * Cache local (IndexedDB com fallback para localStorage) para o ambiente do WhatsApp/Chat.
 *
 * Objetivo: exibir a lista de conversas e as mensagens da conversa aberta
 * instantaneamente na próxima visita, e deixar o fetch de rede rodar em
 * segundo plano para preencher o que mudou desde o último acesso.
 *
 * Regras de projeto:
 *  - Escopo por ownerId + canal (mesmo dispositivo, empresas diferentes ficam isoladas).
 *  - Cap por conversa: 200 últimas mensagens (evita crescimento indefinido no cliente).
 *  - Zero impacto no banco: cache é local; nenhuma tabela nova.
 *  - Nunca lança — falhas silenciam e o fluxo original segue normalmente.
 */

const DB_NAME = 'lead-seller-chat-cache';
const DB_VERSION = 1;
const STORE = 'kv';
const MAX_MSGS_PER_CONV = 200;

type Serializable = unknown;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) {
    try {
      const raw = localStorage.getItem(`cc:${key}`);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch { return null; }
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

async function idbSet(key: string, value: Serializable): Promise<void> {
  const db = await openDb();
  if (!db) {
    try { localStorage.setItem(`cc:${key}`, JSON.stringify(value)); } catch {}
    return;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch { resolve(); }
  });
}

const convsKey = (ownerId: string, channel: string) => `convs:${ownerId}:${channel}`;
const msgsKey = (ownerId: string, customerId: string) => `msgs:${ownerId}:${customerId}`;

export async function getCachedConvs<T = any>(ownerId: string | null | undefined, channel: string): Promise<T[] | null> {
  if (!ownerId) return null;
  const val = await idbGet<{ items: T[] } | T[]>(convsKey(ownerId, channel));
  if (!val) return null;
  return Array.isArray(val) ? val : (val as any).items ?? null;
}

export async function setCachedConvs<T = any>(ownerId: string | null | undefined, channel: string, items: T[]): Promise<void> {
  if (!ownerId) return;
  await idbSet(convsKey(ownerId, channel), { items, at: Date.now() });
}

export interface CachedMessagesEntry<T = any> {
  items: T[];
  lastAt: string | null; // ISO created_at da última mensagem em cache
  at: number;
}

export async function getCachedMessages<T = any>(ownerId: string | null | undefined, customerId: string): Promise<CachedMessagesEntry<T> | null> {
  if (!ownerId) return null;
  return (await idbGet<CachedMessagesEntry<T>>(msgsKey(ownerId, customerId))) || null;
}

export async function setCachedMessages<T extends { created_at?: string | null }>(ownerId: string | null | undefined, customerId: string, items: T[]): Promise<void> {
  if (!ownerId) return;
  const trimmed = items.slice(-MAX_MSGS_PER_CONV);
  const lastAt = trimmed.length ? String(trimmed[trimmed.length - 1].created_at || '') : null;
  await idbSet(msgsKey(ownerId, customerId), { items: trimmed, lastAt, at: Date.now() });
}

/** Remove todo o cache — útil em logout ou trocas de owner sensíveis. */
export async function clearChatCache(): Promise<void> {
  const db = await openDb();
  if (!db) {
    try {
      Object.keys(localStorage).forEach((k) => { if (k.startsWith('cc:')) localStorage.removeItem(k); });
    } catch {}
    return;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch { resolve(); }
  });
}
