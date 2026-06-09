import { MessageSquare, Phone, ShieldCheck, LucideIcon, Globe, ThumbsUp } from 'lucide-react';

export type WhatsAppProvider = 'uaz' | 'meta' | 'wavoip' | 'evolution' | 'instagram' | 'telegram' | 'linkedin' | 'tiktok' | 'youtube' | 'facebook' | 'widget';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

export interface WhatsAppConnection {
  id: string;
  provider: WhatsAppProvider;
  display_name: string;
  status: ConnectionStatus;
  metadata: any;
  authorized_domains?: string[];
  log_retention_days?: number;
  last_cleanup_at?: string;
  next_cleanup_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ProviderConfig {
  name: string;
  description: string;
  icon: LucideIcon;
  color: string;
  url: string;
  tokenLabel: string;
  extraLabel?: string;
  placeholder?: string;
}

export const PROVIDER_CONFIGS: Record<WhatsAppProvider, ProviderConfig> = {
  uaz: {
    name: 'UAZ API',
    description: 'Conexão via QR Code com API multi-dispositivo.',
    icon: MessageSquare,
    color: 'text-emerald-500',
    url: 'https://api.uazapi.dev',
    tokenLabel: 'API Token / Key',
  },
  wavoip: {
    name: 'Wavoip',
    description: 'WhatsApp com foco em VoIP e chamadas de voz.',
    icon: Phone,
    color: 'text-sky-500',
    url: 'https://api.wavoip.com/v1',
    tokenLabel: 'API Key',
  },
  meta: {
    name: 'API Oficial (Meta)',
    description: 'WhatsApp Cloud API oficial hospedada pela Meta.',
    icon: ShieldCheck,
    color: 'text-blue-500',
    url: 'https://graph.facebook.com/v17.0',
    tokenLabel: 'System User Access Token',
    extraLabel: 'Phone Number ID',
  },
  instagram: {
    name: 'Instagram Business',
    description: 'Integração para Direct Messages e comentários.',
    icon: MessageSquare,
    color: 'text-pink-500',
    url: 'https://graph.facebook.com/v17.0',
    tokenLabel: 'Instagram Access Token',
    extraLabel: 'IG Business Account ID',
  },
  facebook: {
    name: 'Facebook Messenger',
    description: 'Conecte sua Página para responder no Messenger.',
    icon: ThumbsUp,
    color: 'text-blue-600',
    url: 'https://graph.facebook.com/v17.0',
    tokenLabel: 'Page Access Token',
    extraLabel: 'Page ID',
  },
  telegram: {
    name: 'Telegram Bot',
    description: 'Gerencie conversas via Bot API do Telegram.',
    icon: MessageSquare,
    color: 'text-sky-500',
    url: 'https://api.telegram.org',
    tokenLabel: 'Bot Token',
  },
  linkedin: {
    name: 'LinkedIn Business',
    description: 'Integração para mensagens de Página e Perfil.',
    icon: MessageSquare,
    color: 'text-blue-700',
    url: 'https://api.linkedin.com/v2',
    tokenLabel: 'OAuth Access Token',
  },
  tiktok: {
    name: 'TikTok Business',
    description: 'Gestão de comentários e mensagens no TikTok.',
    icon: MessageSquare,
    color: 'text-zinc-900',
    url: 'https://open.tiktokapis.com/v2',
    tokenLabel: 'TikTok Access Token',
  },
  youtube: {
    name: 'YouTube Business',
    description: 'Gerencie comentários de vídeos e chats de live.',
    icon: MessageSquare,
    color: 'text-red-600',
    url: 'https://www.googleapis.com/youtube/v3',
    tokenLabel: 'Google API Key / OAuth Token',
  },
  widget: {
    name: 'Widget de Site',
    description: 'Chat ao vivo integrado diretamente no seu site.',
    icon: Globe,
    color: 'text-violet-500',
    url: 'https://widget.example.com',
    tokenLabel: 'Widget API Key',
  },
};
