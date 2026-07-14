// WAHA config schema + helpers.
// Isolated module — nothing here imports from UAZ/Evolution/Wavoip code paths.
// Owns:
//   * The typed shape of what we persist under `whatsapp_connections.metadata`
//     for a WAHA connection (fields mirror the WAHA/Chatwoot App UI).
//   * The webhook URL builder pointing at our own `waha-inbound` edge function.
//   * A tiny Mustache-flavoured template renderer used by `wahaAdapter` to
//     prepend the agent name to outbound messages (mirrors WAHA's default
//     `chatwoot.to.whatsapp.message.text` override).

import { z } from 'zod';

export const WahaConversationBehavior = z.enum(['create_new', 'reuse_open', 'reuse_last']);

export const WahaConfigSchema = z.object({
  // Core WAHA
  url: z.string().min(1, 'URL WAHA obrigatória').transform((v) => v.trim().replace(/\/$/, '')),
  token: z.string().min(1, 'API Key (X-Api-Key) obrigatória'),
  session: z.string().min(1).default('default'),
  app_id: z.string().optional().default(''),

  // Chatwoot-compat block — OPTIONAL. Só é usado se o cliente também rodar o
  // bridge Chatwoot; a maioria dos setups (backfill/simulação/mensageria pura)
  // não precisa desses campos, portanto não bloqueamos o "Salvar".
  chatwoot_url: z.string().optional().default('https://app.chatwoot.com'),
  chatwoot_account_id: z.string().optional().default(''),
  chatwoot_account_token: z.string().optional().default(''),
  chatwoot_inbox_id: z.string().optional().default(''),
  chatwoot_inbox_identifier: z.string().optional().default(''),

  // Conversation behaviour
  conversation_behavior: WahaConversationBehavior.default('reuse_open'),
  mark_read_on_ack: z.boolean().default(true),
  message_link_preview: z.boolean().default(true),
  templates_with_agent_name: z.boolean().default(true),

  // Language
  language: z.string().default('pt-BR'),
  language_overrides: z.string().optional().default(''),
});

export type WahaConfig = z.infer<typeof WahaConfigSchema>;

/** Default values used when opening the config dialog for a fresh connection. */
export const wahaDefaults: Partial<WahaConfig> = {
  url: '',
  token: '',
  session: 'default',
  app_id: '',
  chatwoot_url: 'https://app.chatwoot.com',
  chatwoot_account_id: '',
  chatwoot_account_token: '',
  chatwoot_inbox_id: '',
  chatwoot_inbox_identifier: '',
  conversation_behavior: 'reuse_open',
  mark_read_on_ack: true,
  message_link_preview: true,
  templates_with_agent_name: true,
  language: 'pt-BR',
  language_overrides: '',
};

/** Merge existing metadata with defaults so partially-filled records still open. */
export function readWahaConfig(metadata: any): WahaConfig {
  const merged = { ...wahaDefaults, ...(metadata ?? {}) };
  // Best-effort parse — dialog validates on save; here we tolerate empties.
  try {
    return WahaConfigSchema.parse(merged);
  } catch {
    return merged as WahaConfig;
  }
}

/** Build the inbound webhook URL the user pastes on the WAHA panel. */
export function buildWahaWebhookUrl(functionsBase: string, connectionId: string): string {
  const base = String(functionsBase || '').replace(/\/$/, '');
  return `${base}/waha-inbound?connection=${encodeURIComponent(connectionId)}`;
}

/**
 * Minimal Mustache-ish renderer supporting `{{var}}`, `{{{var}}}` (unescaped)
 * and `{{#var}}...{{/var}}` sections. Enough to honour WAHA's default
 * `chatwoot.to.whatsapp.message.text` template — no dependency required.
 */
export function renderWahaTemplate(tpl: string, vars: Record<string, any>): string {
  if (!tpl) return '';
  const lookup = (path: string) =>
    path.split('.').reduce((acc: any, key) => (acc == null ? acc : acc[key]), vars);

  // Sections: {{#name}}...{{/name}} — rendered only when value is truthy.
  let out = tpl.replace(/\{\{#([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, body) => {
    const v = lookup(key);
    return v ? body : '';
  });

  // Variables: {{{var}}} (raw) and {{var}} (escaped-ish; we treat both the same
  // because the target is WhatsApp text, not HTML).
  out = out.replace(/\{\{\{?\s*([\w.]+)\s*\}?\}\}/g, (_, key) => {
    const v = lookup(key);
    return v == null ? '' : String(v);
  });

  return out.replace(/\n{3,}/g, '\n\n').trim();
}

/** Default WAHA template (verbatim from the WAHA VPS panel). */
export const DEFAULT_WAHA_TEXT_TEMPLATE =
  '{{#chatwoot.sender.name}}*{{{chatwoot.sender.name}}}*:\n{{/chatwoot.sender.name}}{{{ content }}}';
