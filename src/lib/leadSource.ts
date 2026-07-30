// Mapeamento de origem de leads — espelha as funções do backend
// public.canonical_lead_source() / public.lead_source_label().
// Mantenha as duas implementações em sincronia.

const RULES: Array<[RegExp, string]> = [
  [/holmes/, 'holmes'],
  [/dealer[\s_\-.]*space|\bds[\s_-]?space\b/, 'dealerspace'],
  [/n8n/, 'n8n'],
  [/zapier/, 'zapier'],
  [/make\.com|\bmake\b|integromat/, 'make'],
  [/typebot/, 'typebot'],
  [/rd[\s_-]?station|\brdstation\b/, 'rdstation'],
  [/hubspot/, 'hubspot'],
  [/pipedrive/, 'pipedrive'],
  [/google[\s_-]?ads|adwords|\bgoogle\b/, 'google_ads'],
  [/(meta|facebook|fb)[\s_-]?(ads|lead)|\bfacebook\b|\bmeta\b/, 'meta_ads'],
  [/instagram|\big\b/, 'instagram'],
  [/tiktok/, 'tiktok'],
  [/linkedin/, 'linkedin'],
  [/whats|\bwaha\b|\buaz\b|evolution/, 'whatsapp'],
  [/telegram/, 'telegram'],
  [/landing|\bsite\b|website|formul(a|á)rio|\bform\b/, 'site'],
  [/indica|referr?al/, 'indicacao'],
  [/telefone|\bcall\b|yeastar|3cx|wavoip/, 'telefone'],
];

const LABELS: Record<string, string> = {
  holmes: 'Holmes',
  dealerspace: 'DealerSpace',
  n8n: 'n8n',
  zapier: 'Zapier',
  make: 'Make',
  typebot: 'Typebot',
  rdstation: 'RD Station',
  hubspot: 'HubSpot',
  pipedrive: 'Pipedrive',
  google_ads: 'Google Ads',
  meta_ads: 'Meta Ads',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  site: 'Site / Landing',
  indicacao: 'Indicação',
  telefone: 'Telefone',
};

/** Retorna o slug canônico da origem (ou null quando vazia). */
export function canonicalLeadSource(raw?: string | null): string | null {
  let s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  s = s
    .replace(/^(webhook|inbound|integra(c|ç)(a|ã)o|integration|api|crm)[:_\-\s/]+/g, '')
    .replace(/[:_\-\s/]+(webhook|inbound|api|crm|integration)$/g, '');

  for (const [re, slug] of RULES) if (re.test(s)) return slug;

  // fallback: slug estável (variações de caixa/pontuação caem na mesma categoria)
  const slug = s.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return slug || null;
}

/** Rótulo amigável exibido nos KPIs/abas de Captura de Leads. */
export function leadSourceLabel(raw?: string | null): string {
  const canonical = canonicalLeadSource(raw);
  if (!canonical) return 'Sem origem';
  return LABELS[canonical] ?? canonical;
}
