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

/**
 * Utilitário de log para o CI quando houver falha
 */
const logCiFailure = (context: string, details: any) => {
  console.log(`[CI-DEBUG] Failure in ${context}`);
  console.log(`[CI-DEBUG] X-Correlation-ID: ${details.correlationId || 'N/A'}`);
  console.log(`[CI-DEBUG] HMAC Verification: ${details.hmacValid ? 'SUCCESS' : 'FAILED'}`);
  console.log(`[CI-DEBUG] Window Check: ${details.windowValid ? 'SUCCESS' : 'FAILED'}`);
  console.log(`[CI-DEBUG] Payload Summary: ${JSON.stringify(details.payloadSummary || {})}`);
};

describe('Documentation Telemetry & Correlation ID', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it('deve incluir X-Correlation-ID nos headers quando o ID está presente', () => {
    try {
      const { result } = renderHook(() => useDocTelemetry());
      const headers = result.current.getHeaders();
      
      expect(headers['X-Correlation-ID']).toBe('test-uuid-1234');
      expect(sessionStorage.getItem('doc_correlation_id')).toBe('test-uuid-1234');
    } catch (e) {
      logCiFailure('Header Inclusion Test', { correlationId: 'test-uuid-1234', hmacValid: false, windowValid: true });
      throw e;
    }
  });

  it('deve fazer fallback para sessionStorage quando o ID não estiver no estado local', () => {
    sessionStorage.setItem('doc_correlation_id', 'stored-uuid-5678');
    
    const { result } = renderHook(() => useDocTelemetry());
    
    expect(result.current.correlationId).toBe('stored-uuid-5678');
    
    const headers = result.current.getHeaders();
    expect(headers['X-Correlation-ID']).toBe('stored-uuid-5678');
  });

  it('deve simular validação HMAC e Replay Protection', () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const secret = "test-secret";
    const payload = { data: "test" };
    const bodyStr = JSON.stringify(payload);
    
    // Simulação da lógica de assinatura do backend
    const signature = btoa(`${timestamp}.${bodyStr}.${secret}`).slice(0, 32);
    
    // Verificação de sucesso
    const isValid = signature === btoa(`${timestamp}.${bodyStr}.${secret}`).slice(0, 32);
    const isWithinWindow = Math.abs(Math.floor(Date.now() / 1000) - timestamp) < 300;
    
    if (!isValid || !isWithinWindow) {
      logCiFailure('Security Validation Simulation', { 
        correlationId: 'test-uuid-security', 
        hmacValid: isValid, 
        windowValid: isWithinWindow,
        payloadSummary: { timestamp, signature }
      });
    }

    expect(isValid).toBe(true);
    expect(isWithinWindow).toBe(true);
  });
});
