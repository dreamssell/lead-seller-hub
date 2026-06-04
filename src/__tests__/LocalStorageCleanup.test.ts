import { describe, it, expect, beforeEach, vi } from 'vitest';

const TTL = 30 * 60 * 1000; // 30 minutes in ms

// Simulação da lógica de limpeza do localStorage baseada em TTL
function cleanupLocalStorage(now: number) {
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.startsWith('correlation_ttl_')) {
      const stored = localStorage.getItem(key);
      if (stored) {
        const { expiry } = JSON.parse(stored);
        if (now > expiry) {
          const correlationId = key.replace('correlation_ttl_', '');
          localStorage.removeItem(key);
          localStorage.removeItem(`correlation_data_${correlationId}`);
        }
      }
    }
  });
}

function storeWithTTL(id: string, data: any, ttlMs: number, now: number) {
  localStorage.setItem(`correlation_ttl_${id}`, JSON.stringify({ expiry: now + ttlMs }));
  localStorage.setItem(`correlation_data_${id}`, JSON.stringify(data));
}

describe('LocalStorage TTL & Highlight Cleanup', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  it('deve limpar automaticamente dados de X-Correlation-ID quando o TTL expira', () => {
    const id = 'test-corr-1';
    const now = Date.now();
    storeWithTTL(id, { status: 'sent' }, TTL, now);
    
    expect(localStorage.getItem(`correlation_data_${id}`)).toBeDefined();
    
    // Passa 31 minutos
    cleanupLocalStorage(now + TTL + 1000);
    
    expect(localStorage.getItem(`correlation_data_${id}`)).toBeNull();
    expect(localStorage.getItem(`correlation_ttl_${id}`)).toBeNull();
  });

  it('deve lidar com múltiplos IDs e limpar apenas os expirados', () => {
    const now = Date.now();
    storeWithTTL('id-1', { msg: 'old' }, TTL, now - 1000); // Já quase expirando
    storeWithTTL('id-2', { msg: 'new' }, TTL, now + 100000); // Novo
    
    // Simula tempo passando apenas para o primeiro expirar
    cleanupLocalStorage(now + TTL);
    
    expect(localStorage.getItem('correlation_data_id-1')).toBeNull();
    expect(localStorage.getItem('correlation_data_id-2')).not.toBeNull();
  });

  it('deve validar a expiração de 30 minutos do highlight_card', () => {
    const cardId = 'card-123';
    const startTime = Date.now();
    
    localStorage.setItem('kanban_highlighted_card', cardId);
    localStorage.setItem('kanban_highlighted_time', startTime.toString());
    
    // Lógica de verificação (similar ao que está no Context)
    const checkHighlight = (currentTime: number) => {
      const savedTime = localStorage.getItem('kanban_highlighted_time');
      if (savedTime && (currentTime - parseInt(savedTime) > TTL)) {
        localStorage.removeItem('kanban_highlighted_card');
        localStorage.removeItem('kanban_highlighted_time');
        return true;
      }
      return false;
    };

    // 29 minutos depois - ainda deve existir
    expect(checkHighlight(startTime + 29 * 60 * 1000)).toBe(false);
    expect(localStorage.getItem('kanban_highlighted_card')).toBe(cardId);
    
    // 31 minutos depois - deve ser limpo
    expect(checkHighlight(startTime + 31 * 60 * 1000)).toBe(true);
    expect(localStorage.getItem('kanban_highlighted_card')).toBeNull();
  });

  it('deve validar que dados inexistentes no Kanban removem o destaque (hidratação)', () => {
    // Simulação do comportamento do useEffect no CadastrosPage
    const cardId = 'missing-card';
    localStorage.setItem('kanban_highlighted_card', cardId);
    
    const rows = [{ id: 'existing-card' }];
    
    const validateExistence = (id: string, data: any[]) => {
      if (!data.some(r => r.id === id)) {
        localStorage.removeItem('kanban_highlighted_card');
        return false;
      }
      return true;
    };

    const isValid = validateExistence(cardId, rows);
    expect(isValid).toBe(false);
    expect(localStorage.getItem('kanban_highlighted_card')).toBeNull();
  });
});
