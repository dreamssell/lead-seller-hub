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

class EvolutionAdapter implements WhatsAppProviderAdapter {
  async getStatus(conn: WhatsAppConnection) {
    // Route through edge function to avoid browser CORS against the Evolution host.
    const instance = conn.metadata?.instance || conn.metadata?.phone_number_id;
    const { data, error } = await supabase.functions.invoke('whatsapp-status', {
      body: {
        connection_id: conn.id,
        provider: 'evolution',
        url: conn.metadata?.url,
        token: conn.metadata?.token,
        instance,
      },
    });
    if (error) {
      return { connected: false, status: 'error', error: error.message };
    }
    return data;
  }

  async sendMessage(conn: WhatsAppConnection, customerId: string, content: string) {
    const rawUrl = (conn.metadata?.url || '').trim();
    const url = rawUrl && !/^https?:\/\//i.test(rawUrl) ? `https://${rawUrl}` : rawUrl;
    const token = conn.metadata?.token;
    const instance = conn.metadata?.instance || conn.metadata?.phone_number_id;
    
    if (!url || !token || !instance) {
      throw new Error('Configurações da Evolution API incompletas.');
    }

    // First we need to get the customer phone
    const { data: customer } = await supabase.from('customers').select('phone').eq('id', customerId).single();
    if (!customer?.phone) throw new Error('Cliente não possui telefone cadastrado.');

    try {
      const res = await fetch(`${url.replace(/\/$/, '')}/message/sendText/${encodeURIComponent(instance)}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          apikey: token,
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          number: customer.phone,
          options: { delay: 1200, presence: 'composing', linkPreview: false },
          textMessage: { text: content }
        })
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.message || `Erro Evolution: ${res.status}`);
      }
      
      return await res.json();
    } catch (err: any) {
      console.error('[Evolution] Error sending message:', err);
      throw err;
    }
  }

  async syncContacts(_conn: WhatsAppConnection) {
    return { success: true };
  }
}

export const getProviderAdapter = (provider: string): WhatsAppProviderAdapter => {
  switch (provider) {
    case 'uaz':
      return new UazAdapter();
    case 'wavoip':
      return new WavoipAdapter();
    case 'evolution':
      return new EvolutionAdapter();
    default:
      throw new Error(`Provider ${provider} not supported`);
  }
};
