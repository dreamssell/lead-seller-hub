/**
 * chatReadTracker — persistência local de "última mensagem lida" por conversa
 * e broadcast entre abas para manter contadores de não-lidas consistentes.
 *
 * Escopo: por (ownerId, customerId). Guarda apenas um timestamp ISO — não
 * cria nada no banco de dados. Sincroniza abas via BroadcastChannel + storage.
 */

const KEY_PREFIX = 'chat:lastRead:';
const CHANNEL = 'chat-read-tracker';

export interface ReadEvent {
  ownerId: string;
  customerId: string;
  readAt: string; // ISO
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

export function markRead(ownerId: string | null | undefined, customerId: string, readAt: string = new Date().toISOString()): void {
  if (!ownerId) return;
  try {
    const prev = localStorage.getItem(key(ownerId, customerId));
    if (prev && prev >= readAt) return;
    localStorage.setItem(key(ownerId, customerId), readAt);
  } catch {}
  channel()?.postMessage({ ownerId, customerId, readAt } satisfies ReadEvent);
}

export function subscribeReadEvents(cb: (e: ReadEvent) => void): () => void {
  const ch = channel();
  const onMsg = (ev: MessageEvent) => { if (ev.data?.customerId) cb(ev.data as ReadEvent); };
  ch?.addEventListener('message', onMsg);
  const onStorage = (ev: StorageEvent) => {
    if (!ev.key || !ev.key.startsWith(KEY_PREFIX) || !ev.newValue) return;
    const [, rest] = ev.key.split(KEY_PREFIX);
    const [ownerId, customerId] = (rest || '').split(':');
    if (ownerId && customerId) cb({ ownerId, customerId, readAt: ev.newValue });
  };
  window.addEventListener('storage', onStorage);
  return () => {
    ch?.removeEventListener('message', onMsg);
    window.removeEventListener('storage', onStorage);
  };
}
