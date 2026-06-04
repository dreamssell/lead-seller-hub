import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DocumentationPage from '../pages/DocumentationPage';
import { AuthProvider } from '../contexts/AuthContext';
import { GlobalStateProvider } from '../contexts/GlobalStateContext';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock do supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: { config: { doc_retry_alert_limit: 3 } }, error: null })),
              single: vi.fn(() => Promise.resolve({ data: {}, error: null })),
            })),
          })),
        })),
        limit: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: { config: {} }, error: null })),
        })),
      })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
    }
  }
}));

// Mock do hook de autenticação
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'test-user' } },
    user: { id: 'test-user', email: 'test@example.com' },
    loading: false,
    access: { allowed_pages: ['documentation'], sub_company_id: null },
    canAccessPage: () => true,
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: any) => <div>{children}</div>
}));

const queryClient = new QueryClient();

describe('Documentation Structure Validation', () => {
  it('deve renderizar as abas REST API, MCP Server e Webhooks corretamente', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <GlobalStateProvider>
          <MemoryRouter>
            <DocumentationPage />
          </MemoryRouter>
        </GlobalStateProvider>
      </QueryClientProvider>
    );

    // Verifica se os botões das abas estão presentes
    expect(screen.getByRole('tab', { name: /REST API/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /MCP Server/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Webhooks/i })).toBeDefined();
  });
});
