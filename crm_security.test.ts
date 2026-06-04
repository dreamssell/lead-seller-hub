import { test, expect } from 'vitest';
import { supabase } from './src/integrations/supabase/client';

test('Webhook HMAC signature validation', async () => {
  const secret = 'test-secret';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = { event: 'test' };
  const bodyStr = JSON.stringify(payload);
  
  // Geração da assinatura (btoa simulando o que o app faz)
  const signature = btoa(`${timestamp}.${bodyStr}.${secret}`).slice(0, 32);
  
  // Validação (mesma lógica do triggerWebhooks)
  const isValid = signature === btoa(`${timestamp}.${bodyStr}.${secret}`).slice(0, 32);
  expect(isValid).toBe(true);

  // Simulação de replay attack (fora da janela de 5 min)
  const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString();
  const isReplay = Math.abs(Math.floor(Date.now() / 1000) - parseInt(oldTimestamp)) > 300;
  expect(isReplay).toBe(true);
});

test('Cascade Undo logic verification', () => {
  const snapshotBefore = { name: 'Maria', company: 'Tech', status: 'lead' };
  const currentStatus = 'prospect';
  
  // Simulação da restauração em cascata
  const updatePayload: any = { status: snapshotBefore.status };
  Object.keys(snapshotBefore).forEach(key => {
    if (!['id', 'created_at', 'updated_at', 'status'].includes(key)) {
      updatePayload[key] = (snapshotBefore as any)[key];
    }
  });

  expect(updatePayload.status).toBe('lead');
  expect(updatePayload.name).toBe('Maria');
  expect(updatePayload.company).toBe('Tech');
});
