// Contract test — simulates the "same WhatsApp number on two devices" case
// that the CRM 360 requires:
//
//   1. Peer sends an inbound message  →  fromMe=false, counterparty = peer JID.
//   2. Owner replies from a 2nd device →  fromMe=true,  counterparty = peer JID
//                                         (never the owner's own number).
//
// Both must resolve to the SAME phone so the messages end up on the same
// customer/thread inside the platform. We replicate the counterparty-extraction
// logic used by the edge function and assert both directions land on the
// peer's phone, with the right direction label.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

function normalizePhone(from?: string | null): string | null {
  if (!from || typeof from !== 'string') return null;
  if (from.endsWith('@g.us')) return null;
  if (from.endsWith('@lid')) return null;
  const digits = from.replace(/\D/g, '');
  return digits || null;
}

function resolveCounterparty(body: any) {
  const gowsData = body?.data ?? null;
  const webPayload = body?.payload ?? {};
  const info = gowsData?.Info ?? null;
  const fromMe =
    webPayload?.fromMe === true ||
    info?.IsFromMe === true;
  const rawFrom = fromMe
    ? (webPayload?.to || info?.Chat || webPayload?.from)
    : (webPayload?.from || info?.Chat || info?.Sender);
  const senderAlt = info?.SenderAlt || info?.RecipientAlt;
  const rawIsLid = typeof rawFrom === 'string' && rawFrom.includes('@lid');
  const phone = rawIsLid
    ? normalizePhone(senderAlt) || normalizePhone(rawFrom)
    : normalizePhone(rawFrom) || normalizePhone(senderAlt);
  return {
    phone,
    fromMe,
    direction: fromMe ? 'outbound_native' : 'inbound',
    sender_type: fromMe ? 'agent' : 'client',
  };
}

const PEER = '5527998413189@s.whatsapp.net';

Deno.test('inbound WEBJS message → correlated to peer phone as client', () => {
  const r = resolveCounterparty({
    event: 'message',
    payload: { id: 'A', from: PEER, body: 'oi', fromMe: false },
  });
  assertEquals(r.phone, '5527998413189');
  assertEquals(r.fromMe, false);
  assertEquals(r.direction, 'inbound');
  assertEquals(r.sender_type, 'client');
});

Deno.test('outbound from a 2nd device (WEBJS) → same peer phone as agent', () => {
  const r = resolveCounterparty({
    event: 'message',
    payload: { id: 'B', to: PEER, body: 'resposta', fromMe: true },
  });
  assertEquals(r.phone, '5527998413189');
  assertEquals(r.fromMe, true);
  assertEquals(r.direction, 'outbound_native');
  assertEquals(r.sender_type, 'agent');
});

Deno.test('GOWS inbound with IsFromMe=false lands on peer phone', () => {
  const r = resolveCounterparty({
    event: 'gows.MessageEventData',
    data: { Info: { Chat: PEER, IsFromMe: false, ID: 'C' }, Message: { conversation: 'oi' } },
  });
  assertEquals(r.phone, '5527998413189');
  assertEquals(r.direction, 'inbound');
});

Deno.test('GOWS fromMe from other device stays on peer phone (Info.Chat = peer)', () => {
  const r = resolveCounterparty({
    event: 'gows.MessageEventData',
    data: { Info: { Chat: PEER, IsFromMe: true, ID: 'D' }, Message: { conversation: 'ok' } },
  });
  assertEquals(r.phone, '5527998413189');
  assertEquals(r.direction, 'outbound_native');
});

Deno.test('LID peer resolves via SenderAlt so refresh keeps thread', () => {
  const r = resolveCounterparty({
    event: 'message',
    payload: { from: '16433216020536@lid', body: 'oi', fromMe: false, id: 'E' },
    data: { Info: { SenderAlt: PEER, IsFromMe: false } },
  } as any);
  assertEquals(r.phone, '5527998413189');
});
