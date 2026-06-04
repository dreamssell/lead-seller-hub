import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DocumentationPage from './DocumentationPage';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

// Mock do supabase client
vi.mock('@/integrations/supabase/client', () => {
  const mockFrom = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: [], error: null })),
        maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
      limit: vi.fn(() => ({
        maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    })),
    insert: vi.fn(() => Promise.resolve({ error: null })),
  }));

  return {
    supabase: {
      auth: {
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
        getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      },
      from: mockFrom,
      channel: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn(),
      })),
      removeChannel: vi.fn(),
    },
  };
});

// Mock do useAuth para evitar problemas de contexto e permissão
vi.mock('@/contexts/AuthContext', async () => {
  return {
    useAuth: () => ({
      session: { user: { id: 'test-user' } },
      user: { id: 'test-user' },
      loading: false,
      access: null,
      accessLoading: false,
      canAccessPage: () => true,
      signOut: vi.fn(),
    }),
  };
});

describe('DocumentationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render and allow tab switching', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <TooltipProvider>
              <DocumentationPage />
            </TooltipProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );

    // REST API is default
    expect(screen.getByText('REST API')).toBeInTheDocument();
    expect(screen.getByText('Endpoints REST')).toBeInTheDocument();
    
    // Switch to MCP Server
    const mcpTab = screen.getByRole('tab', { name: /MCP Server/i });
    fireEvent.click(mcpTab);
    expect(await screen.findByText(/Model Context Protocol/i)).toBeInTheDocument();
    
    // Switch to Webhooks
    const webhooksTab = screen.getByRole('tab', { name: /Webhooks/i });
    fireEvent.click(webhooksTab);
    expect(screen.getByText(/Webhooks de Saída/i)).toBeInTheDocument();

    // Switch to Console
    const consoleTab = screen.getByRole('tab', { name: /Console/i });
    fireEvent.click(consoleTab);
    expect(screen.getByText(/Console de Teste MCP/i)).toBeInTheDocument();

  });
});
