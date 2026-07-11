/**
 * E2E · Upload concorrente de avatar por múltiplos usuários.
 *
 * Renderiza N instâncias do ProfileTab, cada uma autenticada como um
 * usuário distinto, e dispara o upload simultaneamente. Valida:
 *   • todos os uploads completam sem erro (nenhum bloqueia o outro);
 *   • cada usuário recebe seu próprio path no bucket (sem colisão);
 *   • o profile.upsert é chamado com o avatar_url correspondente;
 *   • a UI mostra progresso "Enviando/Salvando" durante a operação
 *     e chega a 100% ("Concluído") ao final — feedback visual que
 *     evita cliques repetidos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// ---- Toast stub ----
vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

// ---- Framer motion passthrough ----
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => (props: any) => <div {...props} /> }),
}));

// ---- Auth mock: contexto de teste para injetar user por instância ----
import { createContext, useContext } from 'react';
const TestUserCtx = createContext<{ id: string; email: string } | null>(null);
vi.mock('@/contexts/AuthContext', async () => {
  const React = await import('react');
  return {
    useAuth: () => {
      const u = React.useContext(TestUserCtx);
      return {
        user: u ? { ...u, user_metadata: { display_name: u.email.split('@')[0] } } : null,
        signOut: vi.fn(),
      };
    },
  };
});

// ---- Supabase mock ----
type UploadCall = { bucket: string; path: string; size: number };
const uploadCalls: UploadCall[] = [];
const upsertCalls: Array<{ user_id: string; avatar_url: string }> = [];
let uploadResolvers: Array<() => void> = [];

vi.mock('@/integrations/supabase/client', () => {
  const storage = {
    from: (bucket: string) => ({
      upload: (path: string, file: File) =>
        new Promise<{ error: null }>((resolve) => {
          uploadCalls.push({ bucket, path, size: file.size });
          uploadResolvers.push(() => resolve({ error: null }));
        }),
      getPublicUrl: (path: string) => ({
        data: { publicUrl: `https://cdn.test/${bucket}/${path}` },
      }),
    }),
  };
  const from = (_table: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: { display_name: '', phone: '', role_label: 'Atendente', avatar_url: null },
          error: null,
        }),
      }),
    }),
    update: () => ({ eq: async () => ({ error: null }) }),
    upsert: async (row: any) => {
      upsertCalls.push({ user_id: row.user_id, avatar_url: row.avatar_url });
      return { error: null };
    },
  });
  return {
    supabase: {
      from,
      storage,
      auth: {
        getSession: async () => ({
          data: { session: { access_token: 'tok' } },
          error: null,
        }),
      },
    },
  };
});

import ProfileTab from '@/components/settings/ProfileTab';

beforeEach(() => {
  uploadCalls.length = 0;
  upsertCalls.length = 0;
  uploadResolvers = [];
});

describe('Upload concorrente de avatar', () => {
  it('N usuários fazem upload em paralelo — cada um com seu próprio path e UI de progresso', async () => {
    console.log('DEBUG start');
    const N = 5;
    const users = Array.from({ length: N }, (_, i) => ({
      id: `user-${i}`,
      email: `user${i}@empresa.com`,
    }));

    console.log('DEBUG before render');
    const instances = users.map((u, i) => {
      console.log('DEBUG rendering', i);
      const { container } = render(
        <TestUserCtx.Provider value={u}>
          <ProfileTab />
        </TestUserCtx.Provider>,
        { container: document.body.appendChild(document.createElement('div')) },
      );
      console.log('DEBUG rendered', i);
      return { user: u, container };
    });
    console.log('DEBUG all rendered');

    // Aguarda o load inicial de cada instância.
    await new Promise((r) => setTimeout(r, 200));
    console.log('DEBUG has file input:', !!(instances[0].container as HTMLElement).querySelector('input[type="file"]'));

    // Dispara upload em todas simultaneamente.
    instances.forEach(({ container }, idx) => {
      const input = (container as HTMLElement).querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File([new Uint8Array(1024)], 'avatar.jpg', { type: 'image/jpeg' });
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      fireEvent.change(input);
      console.log('DEBUG dispatched change', idx, 'files.length=', input.files?.length);
    });
    console.log('DEBUG after fireEvent, uploadCalls:', uploadCalls.length);

    // Aguarda todos os uploads chegarem à camada de storage.
    await waitFor(() => expect(uploadCalls.length).toBe(N));
    console.log('DEBUG all uploads pending:', uploadCalls.length);

    // UI de progresso visível em cada instância — mostra "Enviando foto…".
    instances.forEach(({ container }) => {
      expect(within(container as HTMLElement).getByText(/Enviando foto/i)).toBeInTheDocument();
    });

    // Paths são únicos e prefixados por user.id → sem colisão entre usuários.
    const paths = uploadCalls.map((c) => c.path);
    expect(new Set(paths).size).toBe(N);
    users.forEach((u) => {
      expect(paths.some((p) => p.startsWith(`${u.id}/`))).toBe(true);
    });

    // Libera todos os uploads simultaneamente.
    await act(async () => {
      uploadResolvers.forEach((r) => r());
    });

    // Cada usuário grava seu próprio avatar_url no profile.
    await waitFor(() => expect(upsertCalls.length).toBe(N));
    users.forEach((u) => {
      const row = upsertCalls.find((r) => r.user_id === u.id);
      expect(row).toBeTruthy();
      expect(row!.avatar_url).toContain(`avatars/${u.id}/`);
    });

    // UI final: "Concluído" com 100% em cada instância.
    await waitFor(() => {
      instances.forEach(({ container }) => {
        expect(within(container as HTMLElement).getByText('Concluído')).toBeInTheDocument();
        expect(within(container as HTMLElement).getByText('100%')).toBeInTheDocument();
      });
    });
  });
});
