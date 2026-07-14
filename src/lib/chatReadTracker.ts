/**
 * chatReadTracker — persistência local de "última mensagem lida" por conversa,
 * ledger de leitores (quem/quando abriu a conversa) e broadcast entre abas para
 * manter contadores de não-lidas e indicadores de "vistas por" consistentes.
 *
 * Escopo: por (ownerId, customerId). Guarda apenas timestamps ISO e metadados
 * leves do usuário (id + label) — não cria nada no banco de dados.
 * Sincroniza abas via BroadcastChannel + storage.
 */

const KEY_PREFIX = 'chat:lastRead:';
const READERS_PREFIX = 'chat:readers:';
const CHANNEL = 'chat-read-tracker';
const MAX_READERS_PER_CONV = 8;

export interface ReadEvent {
  ownerId: string;
  customerId: string;
  readAt: string; // ISO
  reader?: ReaderInfo | null;
}

export interface ReaderInfo {
  id: string;
  label: string;
  avatarUrl?: string | null;
}

export interface ReaderEntry extends ReaderInfo {
  readAt: string;
}

let bc: BroadcastChannel | null = null;
function channel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!bc) {
    try { bc = new BroadcastChannel(CHANNEL); } catch { bc = null; }
  }
  return bc;
}

function key(ownerId: string, customerId: string) {
  return `${KEY_PREFIX}${ownerId}:${customerId}`;
}

function readersKey(ownerId: string, customerId: string) {
  return `${READERS_PREFIX}${ownerId}:${customerId}`;
}

export function getLastRead(ownerId: string | null | undefined, customerId: string): string | null {
  if (!ownerId) return null;
  try { return localStorage.getItem(key(ownerId, customerId)); } catch { return null; }
}

export function getAllLastReads(ownerId: string | null | undefined): Record<string, string> {
  if (!ownerId) return {};
  const out: Record<string, string> = {};
  try {
    const prefix = `${KEY_PREFIX}${ownerId}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      const cid = k.slice(prefix.length);
      const v = localStorage.getItem(k);
      if (v) out[cid] = v;
    }
  } catch {}
  return out;
}

export function getReaders(ownerId: string | null | undefined, customerId: string): ReaderEntry[] {
  if (!ownerId) return [];
  try {
    const raw = localStorage.getItem(readersKey(ownerId, customerId));
    if (!raw) return [];
    const arr = JSON.parse(raw) as ReaderEntry[];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function upsertReader(ownerId: string, customerId: string, reader: ReaderInfo, readAt: string): void {
  try {
    const cur = getReaders(ownerId, customerId).filter((r) => r.id !== reader.id);
    cur.push({ ...reader, readAt });
    cur.sort((a, b) => (b.readAt || '').localeCompare(a.readAt || ''));
    const trimmed = cur.slice(0, MAX_READERS_PER_CONV);
    localStorage.setItem(readersKey(ownerId, customerId), JSON.stringify(trimmed));
  } catch {}
}

export function markRead(
  ownerId: string | null | undefined,
  customerId: string,
  readAt: string = new Date().toISOString(),
  reader?: ReaderInfo | null,
): void {
  if (!ownerId) return;
  try {
    const prev = localStorage.getItem(key(ownerId, customerId));
    if (!prev || prev < readAt) localStorage.setItem(key(ownerId, customerId), readAt);
  } catch {}
  if (reader?.id) upsertReader(ownerId, customerId, reader, readAt);
  channel()?.postMessage({ ownerId, customerId, readAt, reader: reader || null } satisfies ReadEvent);
}

export function subscribeReadEvents(cb: (e: ReadEvent) => void): () => void {
  const ch = channel();
  const onMsg = (ev: MessageEvent) => {
    const d = ev.data as ReadEvent | undefined;
    if (!d?.customerId) return;
    if (d.reader?.id && d.ownerId) upsertReader(d.ownerId, d.customerId, d.reader, d.readAt);
    cb(d);
  };
  ch?.addEventListener('message', onMsg);
  const onStorage = (ev: StorageEvent) => {
    if (!ev.key || !ev.newValue) return;
    if (ev.key.startsWith(KEY_PREFIX)) {
      const rest = ev.key.slice(KEY_PREFIX.length);
      const [ownerId, customerId] = rest.split(':');
      if (ownerId && customerId) cb({ ownerId, customerId, readAt: ev.newValue });
    } else if (ev.key.startsWith(READERS_PREFIX)) {
      const rest = ev.key.slice(READERS_PREFIX.length);
      const [ownerId, customerId] = rest.split(':');
      if (ownerId && customerId) cb({ ownerId, customerId, readAt: new Date().toISOString() });
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    ch?.removeEventListener('message', onMsg);
    window.removeEventListener('storage', onStorage);
  };
}
