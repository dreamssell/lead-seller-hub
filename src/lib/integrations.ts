import { Sparkles, Calendar, Linkedin, Facebook, Instagram, MessageSquare, Mic, MessagesSquare, Zap, Briefcase, Target, Webhook, Phone } from 'lucide-react';
const Slack = MessagesSquare;
import type { LucideIcon } from 'lucide-react';

export type IntegrationField = {
  key: string;
  label: string;
  type?: 'text' | 'password' | 'url';
  placeholder?: string;
  helper?: string;
  secret?: boolean;
};

export type IntegrationProvider = {
  id: string;
  name: string;
  category: 'IA' | 'Agenda' | 'Social' | 'Mensageria' | 'CRM' | 'Automação' | 'Voz';
  description: string;
  icon: LucideIcon;
  color: string;
  fields: IntegrationField[];
  docsUrl?: string;
};

export const INTEGRATION_PROVIDERS: IntegrationProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    category: 'IA',
    description: 'Use sua própria chave da OpenAI (GPT-4, GPT-5, embeddings).',
    icon: Sparkles,
    color: 'from-emerald-500/20 to-teal-500/20',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'sk-...', secret: true, helper: 'Gere em platform.openai.com/api-keys' },
      { key: 'organization', label: 'Organization ID (opcional)', placeholder: 'org-...' },
    ],
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'google_calendar',
    name: 'Google Calendar',
    category: 'Agenda',
    description: 'Crie e leia eventos diretamente da agenda do Google.',
    icon: Calendar,
    color: 'from-blue-500/20 to-sky-500/20',
    fields: [
      { key: 'access_token', label: 'Access Token', type: 'password', secret: true, helper: 'OAuth token com escopo calendar' },
      { key: 'calendar_id', label: 'Calendar ID', placeholder: 'primary' },
    ],
    docsUrl: 'https://developers.google.com/calendar/api/guides/auth',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    category: 'Social',
    description: 'Publique posts, leia perfil e envie mensagens via LinkedIn API.',
    icon: Linkedin,
    color: 'from-sky-600/20 to-blue-700/20',
    fields: [
      { key: 'access_token', label: 'Access Token', type: 'password', secret: true },
      { key: 'organization_urn', label: 'Organization URN (opcional)', placeholder: 'urn:li:organization:123' },
    ],
    docsUrl: 'https://learn.microsoft.com/linkedin/',
  },
  {
    id: 'meta',
    name: 'Meta (Facebook)',
    category: 'Social',
    description: 'Páginas e Messenger via Graph API.',
    icon: Facebook,
    color: 'from-blue-600/20 to-indigo-600/20',
    fields: [
      { key: 'access_token', label: 'Page Access Token', type: 'password', secret: true },
      { key: 'page_id', label: 'Page ID' },
    ],
  },
  {
    id: 'instagram',
    name: 'Instagram',
    category: 'Social',
    description: 'Instagram Business via Graph API (DMs e mídia).',
    icon: Instagram,
    color: 'from-pink-500/20 to-fuchsia-500/20',
    fields: [
      { key: 'access_token', label: 'Access Token', type: 'password', secret: true },
      { key: 'ig_user_id', label: 'IG Business User ID' },
    ],
  },
  {
    id: 'whatsapp_business',
    name: 'WhatsApp Business',
    category: 'Mensageria',
    description: 'WhatsApp Cloud API oficial via Meta.',
    icon: MessageSquare,
    color: 'from-green-500/20 to-emerald-500/20',
    fields: [
      { key: 'access_token', label: 'Access Token', type: 'password', secret: true },
      { key: 'phone_number_id', label: 'Phone Number ID' },
      { key: 'business_account_id', label: 'WABA ID' },
    ],
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    category: 'Voz',
    description: 'Síntese de voz natural para respostas em áudio.',
    icon: Mic,
    color: 'from-violet-500/20 to-purple-500/20',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', secret: true },
      { key: 'voice_id', label: 'Voice ID padrão (opcional)' },
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    category: 'Mensageria',
    description: 'Notifique canais e converse via bot.',
    icon: Slack,
    color: 'from-amber-500/20 to-orange-500/20',
    fields: [
      { key: 'bot_token', label: 'Bot Token (xoxb-)', type: 'password', secret: true },
      { key: 'channel_id', label: 'Canal padrão (opcional)' },
    ],
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    category: 'CRM',
    description: 'Sincronize leads e contatos no HubSpot.',
    icon: Briefcase,
    color: 'from-orange-500/20 to-red-500/20',
    fields: [{ key: 'access_token', label: 'Private App Token', type: 'password', secret: true }],
  },
  {
    id: 'rd_station',
    name: 'RD Station',
    category: 'CRM',
    description: 'Marketing e CRM brasileiro.',
    icon: Target,
    color: 'from-cyan-500/20 to-blue-500/20',
    fields: [{ key: 'access_token', label: 'Access Token', type: 'password', secret: true }],
  },
  {
    id: 'zapier',
    name: 'Zapier',
    category: 'Automação',
    description: 'Dispare zaps via Webhook URL.',
    icon: Zap,
    color: 'from-orange-500/20 to-amber-500/20',
    fields: [{ key: 'webhook_url', label: 'Webhook URL', type: 'url', placeholder: 'https://hooks.zapier.com/...' }],
  },
  {
    id: 'webhook',
    name: 'Webhook Genérico',
    category: 'Automação',
    description: 'Envie eventos do agente para qualquer URL.',
    icon: Webhook,
    color: 'from-slate-500/20 to-zinc-500/20',
    fields: [
      { key: 'webhook_url', label: 'URL', type: 'url', placeholder: 'https://...' },
      { key: 'secret', label: 'Secret (opcional)', type: 'password', secret: true },
    ],
  },
  {
    id: 'twilio',
    name: 'Twilio',
    category: 'Mensageria',
    description: 'SMS e voz globais.',
    icon: Phone,
    color: 'from-red-500/20 to-rose-500/20',
    fields: [
      { key: 'account_sid', label: 'Account SID' },
      { key: 'auth_token', label: 'Auth Token', type: 'password', secret: true },
      { key: 'from_number', label: 'Número remetente' },
    ],
  },
];

export const PROVIDER_BY_ID = Object.fromEntries(INTEGRATION_PROVIDERS.map((p) => [p.id, p]));
