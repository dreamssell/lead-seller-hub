import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthCallbackPage from '@/pages/AuthCallbackPage';

const setSessionMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      setSession: (...args: unknown[]) => setSessionMock(...args),
    },
  },
}));

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/" element={<div>Hub Home</div>} />
        <Route path="/dashboard" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    setSessionMock.mockReset();
    sessionStorage.clear();
  });

  it('define a sessão com tokens da query e redireciona para o Hub (/)', async () => {
    setSessionMock.mockResolvedValue({
      data: { session: { user: { id: 'user-1' }, expires_at: 9999999999 } },
      error: null,
    });

    renderAt('/auth/callback?access_token=AT123&refresh_token=RT456');

    await waitFor(() => {
      expect(setSessionMock).toHaveBeenCalledWith({
        access_token: 'AT123',
        refresh_token: 'RT456',
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Hub Home')).toBeInTheDocument();
    });
  });

  it('redireciona para o "next" quando fornecido e válido', async () => {
    setSessionMock.mockResolvedValue({
      data: { session: { user: { id: 'user-2' }, expires_at: 9999999999 } },
      error: null,
    });

    renderAt('/auth/callback?access_token=AT&refresh_token=RT&next=%2Fdashboard');

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
  });

  it('mostra erro quando tokens estão ausentes', async () => {
    renderAt('/auth/callback');

    await waitFor(() => {
      expect(
        screen.getByText(/Tokens de autenticação não encontrados/i)
      ).toBeInTheDocument();
    });
    expect(setSessionMock).not.toHaveBeenCalled();
  });

  it('mostra erro quando setSession falha', async () => {
    setSessionMock.mockResolvedValue({
      data: { session: null },
      error: { name: 'AuthApiError', status: 401, message: 'invalid token' },
    });

    renderAt('/auth/callback?access_token=bad&refresh_token=bad');

    await waitFor(() => {
      expect(screen.getByText(/Falha ao autenticar: invalid token/i)).toBeInTheDocument();
    });
  });

  it('ignora "next" externo/protocolo-relativo e cai no Hub (/)', async () => {
    setSessionMock.mockResolvedValue({
      data: { session: { user: { id: 'u' }, expires_at: 1 } },
      error: null,
    });

    renderAt('/auth/callback?access_token=AT&refresh_token=RT&next=//evil.com');

    await waitFor(() => {
      expect(screen.getByText('Hub Home')).toBeInTheDocument();
    });
  });
});
