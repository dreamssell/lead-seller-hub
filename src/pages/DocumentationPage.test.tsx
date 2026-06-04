import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DocumentationPage from './DocumentationPage';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';


// Mock do supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
        limit: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
  },
}));

// Mock do useAuth para evitar problemas de contexto e permissão
vi.mock('@/contexts/AuthContext', async () => {
  const actual = await vi.importActual('@/contexts/AuthContext');
  return {
    ...actual,
    useAuth: () => ({
      session: { user: { id: 'test-user' } },
      user: { id: 'test-user' },
      loading: false,
      access: null,
      accessLoading: false,
      canAccessPage: () => true, // Permitir acesso para os testes
      signOut: vi.fn(),
    }),
  };
});

describe('DocumentationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render all documentation tabs and contents correctly', async () => {
    render(
      <MemoryRouter>
        <DocumentationPage />
      </MemoryRouter>
    );

    // 1. Verificar se REST API está visível por padrão
    expect(screen.getByText('Endpoints REST')).toBeInTheDocument();
    expect(screen.getByText('/v1/authenticate')).toBeInTheDocument();

    // 2. Alternar para MCP Server
    const mcpTab = screen.getByRole('tab', { name: /MCP Server/i });
    fireEvent.click(mcpTab);
    expect(screen.getByText('Model Context Protocol (MCP)')).toBeInTheDocument();
    expect(screen.getByText('get_leads')).toBeInTheDocument();

    // 3. Alternar para Webhooks
    const webhooksTab = screen.getByRole('tab', { name: /Webhooks/i });
    fireEvent.click(webhooksTab);
    expect(screen.getByText('Webhooks de Saída')).toBeInTheDocument();
    expect(screen.getByText('lead.created')).toBeInTheDocument();

    // 4. Alternar para Console
    const consoleTab = screen.getByRole('tab', { name: /Console/i });
    fireEvent.click(consoleTab);
    expect(screen.getByPlaceholderText(/Digite um comando/i)).toBeInTheDocument();
  });
});
