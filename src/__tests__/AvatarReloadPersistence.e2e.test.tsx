/**
 * E2E · Persistência do avatar após reload da página.
 *
 * Para N usuários simultâneos: cada um faz upload, "recarrega" a página
 * (unmount + remount do ProfileTab) e o avatar recém-enviado deve continuar
 * visível — comprovando que a URL foi persistida em `profiles.avatar_url`
 * e é recuperada corretamente pelo `useEffect` inicial de cada instância.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { createContext } from 'react';

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => (props: any) => <div {...props} /> }),
}));

const TestUserCtx = createContext<{ id: string; email: string } | null>(null);
const userCache = new WeakMap<object, any>();
vi.mock('@/contexts/AuthContext', async () => {
  const React = await import('react');
  return {
    useAuth: () => {
      const u = React.useContext(TestUserCtx);
      if (!u) return { user: null, signOut: () => {} };
      let cached = userCache.get(u);
      if (!cached) {
        cached = {
          user: { ...u, user_metadata: { display_name: u.email.split('@')[0] } },
          signOut: () => {},
        };
        userCache.set(u, cached);
      }
      return cached;
    },
  };
});

// Banco em memória de avatares (simula a coluna profiles.avatar_url por user).
const avatarByUser = new Map<string, string | null>();

vi.mock('@/integrations/supabase/client', () => {
  const storage = {
    from: (bucket: string) => ({
      upload: async (path: string, _file: File) => ({ error: null, data: { path } }),
      getPublicUrl: (path: string) => ({
        data: { publicUrl: `https://cdn.test/${bucket}/${path}` },
      }),
    }),
  };
  const from = (_table: string) => {
    let filterUser: string | null = null;
    const chain: any = {
      select: () => chain,
      eq: (col: string, val: string) => {
        if (col === 'user_id') filterUser = val;
        return chain;
      },
      maybeSingle: async () => ({
        data: {
          display_name: '',
          phone: '',
          role_label: 'Atendente',
          avatar_url: filterUser ? avatarByUser.get(filterUser) ?? null : null,
        },
        error: null,
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
      upsert: async (row: any) => {
        avatarByUser.set(row.user_id, row.avatar_url);
        return { error: null };
      },
    };
    return chain;
  };
  return {
    supabase: {
      from,
      storage,
      auth: {
        getSession: async () => ({
          data: {
            session: {
              // JWT com sub=user-x é substituído dinamicamente pelo teste
              access_token: 'eyJhbGciOiJIUzI1NiJ9.' + btoa(JSON.stringify({ sub: 'ignored' })) + '.sig',
              user: { id: 'ignored' },
            },
          },
          error: null,
        }),
        refreshSession: async () => ({ data: { session: null }, error: null }),
      },
    },
  };
});

import ProfileTab from '@/components/settings/ProfileTab';

beforeEach(() => {
  avatarByUser.clear();
});

describe('Persistência do avatar após reload', () => {
  it('Cada usuário mantém sua própria foto após remount da ProfileTab', async () => {
    const N = 3;
    const users = Array.from({ length: N }, (_, i) => ({
      id: `user-${i}`,
      email: `user${i}@empresa.com`,
    }));

    // 1) Primeira montagem: cada usuário faz upload.
    const first = users.map((u) => {
      const utils = render(
        <TestUserCtx.Provider value={u}>
          <ProfileTab />
        </TestUserCtx.Provider>,
        { container: document.body.appendChild(document.createElement('div')) },
      );
      return { user: u, utils };
    });

    await new Promise((r) => setTimeout(r, 200));

    first.forEach(({ utils }) => {
      const input = utils.container.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File([new Uint8Array(2048)], 'me.jpg', { type: 'image/jpeg' });
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      fireEvent.change(input);
    });

    // Aguarda todos os uploads terem sido persistidos.
    await waitFor(() => expect(avatarByUser.size).toBe(N));
    users.forEach((u) => {
      expect(avatarByUser.get(u.id)).toMatch(new RegExp(`avatars/${u.id}/`));
    });

    // Desmonta tudo (simula reload / navegação fora do perfil).
    first.forEach(({ utils }) => utils.unmount());

    // 2) Remonta as instâncias — cada uma deve carregar seu avatar do "banco".
    const reloaded = users.map((u) => {
      const utils = render(
        <TestUserCtx.Provider value={u}>
          <ProfileTab />
        </TestUserCtx.Provider>,
        { container: document.body.appendChild(document.createElement('div')) },
      );
      return { user: u, utils };
    });

    // 3) Cada instância exibe o <img> do avatar do seu próprio usuário.
    await waitFor(() => {
      reloaded.forEach(({ user, utils }) => {
        const img = within(utils.container as HTMLElement).getByAltText('Avatar') as HTMLImageElement;
        expect(img).toBeInTheDocument();
        expect(img.src).toContain(`avatars/${user.id}/`);
      });
    });

    // Nenhum avatar vazou entre instâncias.
    reloaded.forEach(({ user, utils }) => {
      const img = utils.container.querySelector('img[alt="Avatar"]') as HTMLImageElement;
      users
        .filter((o) => o.id !== user.id)
        .forEach((other) => expect(img.src).not.toContain(`avatars/${other.id}/`));
    });
  });
});
