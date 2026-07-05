import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ single: vi.fn().mockResolvedValue({ data: null }) }) }) }),
    functions: { invoke: vi.fn() },
  },
}));

import { PROVIDER_CONFIGS, WhatsAppProvider } from '../types';
import { getProviderAdapter, WhatsAppProviderAdapter } from '../adapters';
import { WahaAdapter } from '../wahaAdapter';

// These are the providers the WhatsAppPage <Select> currently exposes for
// creating a connection. If someone adds/removes a provider in the UI they
// must ALSO extend the type + provider config + adapter factory — this
// contract test guards against silent drift.
const UI_PROVIDERS: WhatsAppProvider[] = [
  'uaz', 'waha', 'evolution', 'wavoip', 'meta',
  'instagram', 'facebook', 'telegram', 'linkedin', 'tiktok', 'youtube', 'widget',
];

// Adapter-backed providers: only these must resolve through getProviderAdapter.
// Other channels (instagram/telegram/etc.) are configured via other codepaths.
const ADAPTER_PROVIDERS: WhatsAppProvider[] = ['uaz', 'waha', 'evolution', 'wavoip'];

describe('WhatsAppPage provider contract', () => {
  it('every provider exposed by the UI has a PROVIDER_CONFIGS entry with the required fields', () => {
    for (const p of UI_PROVIDERS) {
      const cfg = PROVIDER_CONFIGS[p];
      expect(cfg, `missing PROVIDER_CONFIGS entry for '${p}'`).toBeTruthy();
      expect(typeof cfg.name).toBe('string');
      expect(typeof cfg.description).toBe('string');
      expect(typeof cfg.url).toBe('string');
      expect(typeof cfg.tokenLabel).toBe('string');
      expect(cfg.icon).toBeTruthy();
    }
  });

  it('WAHA config is present and marks itself as WAHA (not UAZ / Evolution / Wavoip)', () => {
    const cfg = PROVIDER_CONFIGS.waha;
    expect(cfg.name).toMatch(/waha/i);
    // Isolation: token label / description must NOT mix providers.
    expect(cfg.description.toLowerCase()).not.toMatch(/uaz|evolution|wavoip/);
  });

  it('getProviderAdapter dispatches each provider to its OWN adapter class', () => {
    const adapters = ADAPTER_PROVIDERS.map((p) => ({ p, a: getProviderAdapter(p) }));
    const ctors = adapters.map(({ a }) => a.constructor.name);
    // Every provider must resolve to a distinct adapter class — no cross-wiring.
    expect(new Set(ctors).size).toBe(ctors.length);
    const waha = adapters.find((x) => x.p === 'waha')!.a;
    expect(waha).toBeInstanceOf(WahaAdapter);
  });

  it('all adapter-backed providers implement the WhatsAppProviderAdapter contract', () => {
    for (const p of ADAPTER_PROVIDERS) {
      const a: WhatsAppProviderAdapter = getProviderAdapter(p);
      expect(typeof a.getStatus).toBe('function');
      expect(typeof a.sendMessage).toBe('function');
      expect(typeof a.syncContacts).toBe('function');
    }
  });

  it('unknown providers throw — prevents silent fallthrough onto another provider', () => {
    expect(() => getProviderAdapter('does-not-exist')).toThrow(/not supported/i);
  });
});
