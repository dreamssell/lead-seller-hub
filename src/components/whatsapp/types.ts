
import { CheckCircle2, Loader2, Plug, XCircle, ShieldCheck, Phone } from 'lucide-react';

export type WhatsAppProvider = 'uaz' | 'meta' | 'wavoip';
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface WhatsAppConnection {
  id: string;
  provider: WhatsAppProvider;
  display_name: string;
  phone_number: string | null;
  status: ConnectionStatus;
  last_checked_at: string | null;
  last_error: string | null;
  metadata: Record<string, any>;
}

export interface ProviderConfig {
  id: WhatsAppProvider;
  name: string;
  url: string;
  tokenLabel: string;
  extraLabel?: string;
  description: string;
  docs: string;
  icon: any;
  color: string;
}

export const PROVIDER_CONFIGS: Record<WhatsAppProvider, ProviderConfig> = {
  uaz: {
    id: 'uaz',
    name: 'UAZ API',
    url: 'https://api.uazapi.dev',
    tokenLabel: 'Token da Instância',
    description: 'Conexão via UAZ API — ideal para WhatsApp não oficial com QR Code.',
    docs: 'https://docs.uazapi.com',
    icon: Plug,
    color: 'text-primary',
  },
  meta: {
    id: 'meta',
    name: 'Meta API',
    url: 'https://graph.facebook.com/v21.0',
    tokenLabel: 'Access Token',
    extraLabel: 'Phone Number ID',
    description: 'Integração oficial via Meta Cloud API (WhatsApp Business Platform).',
    docs: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
    icon: ShieldCheck,
    color: 'text-primary',
  },
  wavoip: {
    id: 'wavoip',
    name: 'Wavoip',
    url: 'https://api.wavoip.com/v1',
    tokenLabel: 'API Key',
    description: 'Integração avançada para chamadas de voz e mensagens integradas.',
    docs: 'https://docs.wavoip.com',
    icon: Phone,
    color: 'text-emerald-500',
  },
};
