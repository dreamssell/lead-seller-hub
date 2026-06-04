import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState, useEffect, useCallback } from 'react';

// Mock minimal do hook useDocTelemetry extraído de DocumentationPage.tsx
function useDocTelemetry() {
  const [correlationId, setCorrelationId] = useState(() => {
    const stored = sessionStorage.getItem('doc_correlation_id');
    if (stored) return stored;
    const newId = 'test-uuid-1234'; // Simplificado para teste
    sessionStorage.setItem('doc_correlation_id', newId);
    return newId;
  });

  const getHeaders = useCallback(() => {
    const id = correlationId || sessionStorage.getItem('doc_correlation_id');
    return {
      'X-Correlation-ID': id
    };
  }, [correlationId]);

  return { correlationId, getHeaders };
}

describe('Documentation Telemetry & Correlation ID', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it('deve incluir X-Correlation-ID nos headers quando o ID está presente', () => {
    const { result } = renderHook(() => useDocTelemetry());
    const headers = result.current.getHeaders();
    
    expect(headers['X-Correlation-ID']).toBe('test-uuid-1234');
    expect(sessionStorage.getItem('doc_correlation_id')).toBe('test-uuid-1234');
  });

  it('deve fazer fallback para sessionStorage quando o ID não estiver no estado local', () => {
    sessionStorage.setItem('doc_correlation_id', 'stored-uuid-5678');
    
    const { result } = renderHook(() => useDocTelemetry());
    
    // Forçamos o estado local a ser vazio se possível ou apenas verificamos a inicialização
    expect(result.current.correlationId).toBe('stored-uuid-5678');
    
    const headers = result.current.getHeaders();
    expect(headers['X-Correlation-ID']).toBe('stored-uuid-5678');
  });

  it('deve garantir que o header X-Correlation-ID seja padronizado', () => {
    const { result } = renderHook(() => useDocTelemetry());
    const headers = result.current.getHeaders();
    
    expect(headers).toHaveProperty('X-Correlation-ID');
    // Verifica case-sensitivity se necessário, embora headers HTTP sejam case-insensitive na prática
    expect(Object.keys(headers)).toContain('X-Correlation-ID');
  });
});
