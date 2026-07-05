import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { singleMock } = vi.hoisted(() => ({
  singleMock: vi.fn().mockResolvedValue({ data: { phone: '5511988887777' } }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ single: singleMock }) }) }),
    functions: { invoke: vi.fn() },
  },
}));

import {
  WahaAdapter,
  WahaSendTextSchema,
  WahaSendMediaSchema,
  WahaSendVoiceSchema,
} from '../wahaAdapter';

const conn: any = {
  id: 'waha-x',
  provider: 'waha',
  metadata: { url: 'https://waha.example.com', token: 'k', instance: 'sA' },
};

function okFetch(body: any = { id: { _serialized: 'm1' } }) {
  return vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify(body) });
}

beforeEach(() => {
  singleMock.mockResolvedValue({ data: { phone: '5511988887777' } });
});
afterEach(() => vi.restoreAllMocks());

describe('WAHA Zod schemas (contract)', () => {
  it('text payload requires session/chatId/text', () => {
    expect(WahaSendTextSchema.safeParse({ session: 's', chatId: '5511@c.us', text: 'oi' }).success).toBe(true);
    expect(WahaSendTextSchema.safeParse({ session: '', chatId: 'x', text: '' }).success).toBe(false);
  });

  it('chatId shape is enforced (rejects free-form phone numbers)', () => {
    expect(WahaSendTextSchema.safeParse({ session: 's', chatId: '5511988887777', text: 'oi' }).success).toBe(false);
  });

  it('media schema demands mimetype/filename/base64', () => {
    expect(WahaSendMediaSchema.safeParse({
      session: 's', chatId: '5511@c.us',
      file: { mimetype: 'image/png', filename: 'a.png', data: 'AAAA' },
    }).success).toBe(true);
    expect(WahaSendMediaSchema.safeParse({
      session: 's', chatId: '5511@c.us',
      file: { mimetype: '', filename: '', data: '' },
    }).success).toBe(false);
  });

  it('voice schema forces an audio/* mimetype', () => {
    expect(WahaSendVoiceSchema.safeParse({
      session: 's', chatId: '5511@c.us',
      file: { mimetype: 'audio/ogg', filename: 'v.ogg', data: 'AAAA' },
    }).success).toBe(true);
    expect(WahaSendVoiceSchema.safeParse({
      session: 's', chatId: '5511@c.us',
      file: { mimetype: 'image/png', filename: 'v.png', data: 'AAAA' },
    }).success).toBe(false);
  });
});

describe('WahaAdapter payloads — text / media / audio', () => {
  it('sendMessage POSTs a schema-valid text payload', async () => {
    const fetchMock = okFetch();
    (global as any).fetch = fetchMock;
    await new WahaAdapter().sendMessage(conn, 'c1', 'olá');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(WahaSendTextSchema.safeParse(body).success).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/sendText$/);
  });

  it('sendMedia routes image mime to /api/sendImage and validates schema', async () => {
    const fetchMock = okFetch();
    (global as any).fetch = fetchMock;
    const file = new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' });
    await new WahaAdapter().sendMedia(conn, 'c1', file, 'legenda');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/sendImage$/);
    const body = JSON.parse(init.body);
    expect(WahaSendMediaSchema.safeParse(body).success).toBe(true);
    expect(body.caption).toBe('legenda');
  });

  it('sendMedia routes video mime to /api/sendVideo and generic to /api/sendFile', async () => {
    const fetchMock = okFetch();
    (global as any).fetch = fetchMock;
    const vid = new File([new Uint8Array([1])], 'v.mp4', { type: 'video/mp4' });
    await new WahaAdapter().sendMedia(conn, 'c1', vid);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/sendVideo$/);

    const doc = new File([new Uint8Array([1])], 'd.pdf', { type: 'application/pdf' });
    await new WahaAdapter().sendMedia(conn, 'c1', doc);
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/api\/sendFile$/);
  });

  it('sendAudio posts to /api/sendVoice with audio/* mimetype', async () => {
    const fetchMock = okFetch();
    (global as any).fetch = fetchMock;
    const blob = new Blob([new Uint8Array([1, 2])], { type: 'audio/ogg' });
    await new WahaAdapter().sendAudio(conn, 'c1', blob);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/sendVoice$/);
    expect(WahaSendVoiceSchema.safeParse(JSON.parse(init.body)).success).toBe(true);
  });

  it('serialization errors (empty text) throw a schema-tagged error, no I/O', async () => {
    const fetchMock = okFetch();
    (global as any).fetch = fetchMock;
    await expect(new WahaAdapter().sendMessage(conn, 'c1', '')).rejects.toThrow(/payload inválido/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('serialization errors (bad audio mime) throw a schema-tagged error', async () => {
    const fetchMock = okFetch();
    (global as any).fetch = fetchMock;
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' });
    await expect(new WahaAdapter().sendAudio(conn, 'c1', blob)).rejects.toThrow(/voice inválido/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
