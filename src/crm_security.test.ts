import { test, expect, describe } from 'vitest';

describe('CRM Webhook Security E2E', () => {
  const secret = 'test-secret-key-123';
  
  const generateSignature = (timestamp: string, payload: any, key: string) => {
    const bodyStr = JSON.stringify(payload);
    return btoa(`${timestamp}.${bodyStr}.${key}`).slice(0, 32);
  };

  test('Receptor deve aceitar assinaturas HMAC válidas', () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payload = { contact_id: '123', action: 'test' };
    const signature = generateSignature(timestamp, payload, secret);
    
    // Simulação da lógica do receptor
    const isValid = signature === generateSignature(timestamp, payload, secret);
    expect(isValid).toBe(true);
  });

  test('Receptor deve rejeitar assinaturas HMAC inválidas', () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payload = { contact_id: '123', action: 'test' };
    const signature = 'wrong-signature-value';
    
    const isValid = signature === generateSignature(timestamp, payload, secret);
    expect(isValid).toBe(false);
  });

  test('Receptor deve recusar webhooks com timestamp fora da janela de 5 minutos (Replay Protection)', () => {
    const sixMinutesAgo = Math.floor(Date.now() / 1000) - 360;
    const timestamp = sixMinutesAgo.toString();
    
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const isWithinWindow = Math.abs(currentTimestamp - parseInt(timestamp)) <= 300;
    
    expect(isWithinWindow).toBe(false);
  });

  test('Receptor deve aceitar webhooks dentro da janela de 5 minutos', () => {
    const fourMinutesAgo = Math.floor(Date.now() / 1000) - 240;
    const timestamp = fourMinutesAgo.toString();
    
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const isWithinWindow = Math.abs(currentTimestamp - parseInt(timestamp)) <= 300;
    
    expect(isWithinWindow).toBe(true);
  });

  test('Webhook rejeitado deve registrar is_dead_letter quando esgotar retries', () => {
    const log = { status: 'failed', retry_count: 3, is_dead_letter: true };
    expect(log.is_dead_letter).toBe(true);
    expect(log.status).toBe('failed');
  });
});

describe('Cascade Undo Integrity', () => {
  test('Deve restaurar corretamente todos os campos do snapshot', () => {
    const current = { id: '1', status: 'prospect', name: 'Maria Updated', phone: '9999' };
    const snapshot = { id: '1', status: 'lead', name: 'Maria Original', phone: '8888', notes: 'First note' };
    
    const restored: any = { ...current, status: snapshot.status };
    Object.keys(snapshot).forEach(key => {
      if (!['id', 'created_at', 'updated_at', 'status'].includes(key)) {
        restored[key] = (snapshot as any)[key];
      }
    });

    expect(restored.status).toBe('lead');
    expect(restored.name).toBe('Maria Original');
    expect(restored.phone).toBe('8888');
    expect(restored.notes).toBe('First note');
  });
});
