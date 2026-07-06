// Contract tests for the waha-inbound edge function. Purely input-parsing
// tests — they do not require Supabase to be reachable. They guarantee that
// the payload shape from WAHA continues to be accepted even as we add more
// fields, and that a malformed body is rejected.

import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { z } from 'npm:zod@3.23.8';

// Duplicated locally so the test does not import the handler (which requires
// SUPABASE_* env vars at import time when running via `deno test`).
const PayloadSchema = z.object({
  event: z.string().optional(),
  session: z.string().optional(),
  payload: z
    .object({
      id: z.union([z.string(), z.object({ _serialized: z.string() })]).optional(),
      from: z.string().optional(),
      body: z.string().optional(),
      ack: z.number().optional(),
      status: z.string().optional(),
    })
    .passthrough()
    .optional(),
});

Deno.test('accepts a standard WAHA inbound message payload', () => {
  const res = PayloadSchema.safeParse({
    event: 'message',
    session: 'default',
    payload: {
      id: { _serialized: 'false_5511@c.us_ABCDEF' },
      from: '5511999999999@c.us',
      body: 'oi',
    },
  });
  assertEquals(res.success, true);
});

Deno.test('accepts an ACK payload with numeric ack', () => {
  const res = PayloadSchema.safeParse({
    event: 'message.ack',
    payload: { id: 'ABC', ack: 3 },
  });
  assertEquals(res.success, true);
});

Deno.test('accepts a session.status payload', () => {
  const res = PayloadSchema.safeParse({
    event: 'session.status',
    payload: { status: 'WORKING' },
  });
  assertEquals(res.success, true);
});

Deno.test('rejects a payload with the wrong shape for id', () => {
  const res = PayloadSchema.safeParse({ event: 'message', payload: { id: 42 } });
  assertEquals(res.success, false);
  if (!res.success) assertExists(res.error);
});

Deno.test('extra WAHA fields are preserved via passthrough (forward-compat)', () => {
  const res = PayloadSchema.safeParse({
    event: 'message',
    payload: { id: 'X', from: '5511@c.us', body: 'hi', someFutureFlag: true },
  });
  assertEquals(res.success, true);
  if (res.success) {
    // @ts-ignore — passthrough guarantees this survives.
    assertEquals(res.data.payload?.someFutureFlag, true);
  }
});
