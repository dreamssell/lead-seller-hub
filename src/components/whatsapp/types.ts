import { MessageSquare, Phone, ShieldCheck, LucideIcon } from 'lucide-react';

export type WhatsAppProvider = 'uaz' | 'meta' | 'wavoip';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

export interface WhatsAppConnection {
  id: string;
  provider: WhatsAppProvider;
  display_name: string;
  status: ConnectionStatus;
  metadata: any;
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
};
