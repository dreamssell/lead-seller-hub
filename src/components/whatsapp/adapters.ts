import { WhatsAppConnection, ConnectionStatus } from './types';
import { supabase } from '@/integrations/supabase/client';

export interface WhatsAppProviderAdapter {
  getStatus(conn: WhatsAppConnection): Promise<{ connected: boolean; status: string; phone?: string; error?: string; raw?: any }>;
  sendMessage(conn: WhatsAppConnection, customerId: string, content: string): Promise<any>;
  syncContacts(conn: WhatsAppConnection): Promise<any>;
}

class UazAdapter implements WhatsAppProviderAdapter {
  async getStatus(conn: WhatsAppConnection) {
    const { data, error } = await supabase.functions.invoke('whatsapp-status', {
      body: {
        connection_id: conn.id,
        provider: 'uaz',
        url: conn.metadata?.url,
        token: conn.metadata?.token,
      },
    });
    if (error) throw error;
    return data;
  }

  async sendMessage(conn: WhatsAppConnection, customerId: string, content: string) {
    const { data, error } = await supabase.functions.invoke('uaz-send-message', {
      body: {
        customer_id: customerId,
        content: content,
        connection_id: conn.id
      }
    });
    if (error) throw error;
    return data;
  }

  async syncContacts(conn: WhatsAppConnection) {
    // Implement UAZ contact sync logic here
    return { success: true };
  }
}

class WavoipAdapter implements WhatsAppProviderAdapter {
  async getStatus(conn: WhatsAppConnection) {
    const { data, error } = await supabase.functions.invoke('whatsapp-status', {
      body: {
        connection_id: conn.id,
        provider: 'wavoip',
        url: conn.metadata?.url,
        token: conn.metadata?.token,
      },
    });
    if (error) throw error;
    return data;
  }

  async sendMessage(conn: WhatsAppConnection, customerId: string, content: string) {
    // Placeholder for Wavoip messaging
    console.log('Sending via Wavoip', { customerId, content });
    return { success: true };
  }

  async syncContacts(conn: WhatsAppConnection) {
    return { success: true };
  }
}

export const getProviderAdapter = (provider: string): WhatsAppProviderAdapter => {
  switch (provider) {
    case 'uaz':
      return new UazAdapter();
    case 'wavoip':
      return new WavoipAdapter();
    default:
      throw new Error(`Provider ${provider} not supported`);
  }
};
