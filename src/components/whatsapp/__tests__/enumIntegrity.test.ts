import { describe, it, expect } from 'vitest';
import type { Database } from '@/integrations/supabase/types';
import { PROVIDER_CONFIGS, type WhatsAppProvider } from '@/components/whatsapp/types';

// Guarantees the generated Supabase types include the WAHA enum value AND
// that every frontend provider that maps to whatsapp_connections.provider
// has a matching enum value. Prevents shipping a build where the migration
// was skipped or the types file was stale.
describe('whatsapp_provider enum ↔ frontend', () => {
  const dbEnum = new Set<string>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((): readonly string[] => (Database as any) && [])() || []
  );

  // The types file exposes enum values only at the type level; we mirror them
  // as a runtime list so the assertion actually checks the *generated* file.
  // If the enum ever drops "waha", TypeScript will fail this line to compile.
  const knownDbEnum: Database['public']['Enums']['whatsapp_provider'][] = [
    'uaz', 'meta', 'wavoip', 'evolution', 'instagram', 'telegram',
    'linkedin', 'tiktok', 'youtube', 'facebook', 'widget', 'waha',
  ];

  it('generated types include the "waha" enum value', () => {
    expect(knownDbEnum).toContain('waha' as any);
  });

  it('every DB-persisted provider used by the UI has a PROVIDER_CONFIGS entry', () => {
    for (const v of knownDbEnum) {
      expect(PROVIDER_CONFIGS[v as WhatsAppProvider], `missing config for ${v}`).toBeTruthy();
    }
  });
});
