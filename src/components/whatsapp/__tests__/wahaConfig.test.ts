import { describe, it, expect } from 'vitest';
import {
  WahaConfigSchema,
  buildWahaWebhookUrl,
  renderWahaTemplate,
  DEFAULT_WAHA_TEXT_TEMPLATE,
  readWahaConfig,
} from '../wahaConfig';

describe('wahaConfig — schema', () => {
  it('requires all WAHA + Chatwoot-compat mandatory fields', () => {
    const res = WahaConfigSchema.safeParse({});
    expect(res.success).toBe(false);
    if (!res.success) {
      const keys = res.error.issues.map((i) => i.path.join('.'));
      for (const req of [
        'url', 'token',
        'chatwoot_account_id', 'chatwoot_account_token',
        'chatwoot_inbox_id', 'chatwoot_inbox_identifier',
      ]) {
        expect(keys).toContain(req);
      }
    }
  });

  it('trims URL trailing slash and defaults sensible values', () => {
    const parsed = WahaConfigSchema.parse({
      url: 'https://waha.example.com/',
      token: 'k',
      chatwoot_account_id: '1',
      chatwoot_account_token: 't',
      chatwoot_inbox_id: '2',
      chatwoot_inbox_identifier: 'inbox',
    });
    expect(parsed.url).toBe('https://waha.example.com');
    expect(parsed.session).toBe('default');
    expect(parsed.conversation_behavior).toBe('reuse_open');
    expect(parsed.templates_with_agent_name).toBe(true);
    expect(parsed.language).toBe('pt-BR');
  });
});

describe('wahaConfig — readWahaConfig tolerance', () => {
  it('merges partial metadata with defaults without throwing', () => {
    const cfg = readWahaConfig({ url: 'https://x', token: 'k' });
    expect(cfg.session).toBe('default');
    expect(cfg.chatwoot_url).toBe('https://app.chatwoot.com');
  });
});

describe('wahaConfig — buildWahaWebhookUrl', () => {
  it('appends waha-inbound path and encodes connection id', () => {
    const url = buildWahaWebhookUrl('https://x.functions.supabase.co/', 'abc 123');
    expect(url).toBe('https://x.functions.supabase.co/waha-inbound?connection=abc%20123');
  });
});

describe('wahaConfig — renderWahaTemplate', () => {
  it('renders content-only when sender.name is missing', () => {
    const out = renderWahaTemplate(DEFAULT_WAHA_TEXT_TEMPLATE, {
      content: 'olá',
      chatwoot: { sender: {} },
    });
    expect(out).toBe('olá');
  });

  it('prepends *Name*: when sender.name is present', () => {
    const out = renderWahaTemplate(DEFAULT_WAHA_TEXT_TEMPLATE, {
      content: 'olá',
      chatwoot: { sender: { name: 'Ana' } },
    });
    expect(out).toBe('*Ana*:\nolá');
  });
});
