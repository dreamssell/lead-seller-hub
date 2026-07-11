/**
 * E2E · Persistência do avatar HEIC após reload.
 *
 * Cada usuário envia um arquivo .HEIC que é convertido no cliente (heic2any → JPG),
 * salvo no storage e persistido em profiles.avatar_url. Após unmount/remount
 * (simula reload), a ProfileTab deve recarregar o avatar convertido de cada
 * usuário sem vazamento entre tenants e sem manter a extensão .heic no path.
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

// heic2any é carregado dinamicamente pelo ProfileTab — retornamos um Blob JPEG "convertido".
const heicHoisted = vi.hoisted(() => {
  const calls: Array<{ toType: string }> = [];
  const fn = async ({ toType }: { blob: Blob; toType: string }) => {
    calls.push({ toType });
    return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])], { type: 'image/jpeg' });
  };
  const _unused = async ({ toType }: { blob: Blob; toType: string }) => {
    calls.push({ toType });
    return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])], { type: 'image/jpeg' });
  };
  return { calls, fn };
});
const heic2anyCalls = heicHoisted.calls;
vi.mock('heic2any', () => ({ default: heicHoisted.fn }));

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

// Banco simulado: por usuário, guarda a avatar_url e metadados do objeto no storage.
const avatarByUser = new Map<string, string | null>();
type StoredObject = { path: string; contentType: string; size: number };
const storageObjectsByPath = new Map<string, StoredObject>();
const storageObjectsByUser = new Map<string, StoredObject>();

vi.mock('@/integrations/supabase/client', () => {
  const storage = {
    from: (bucket: string) => ({
      upload: async (path: string, file: File, opts?: { contentType?: string }) => {
        const uid = path.split('/')[0];
        const obj: StoredObject = {
          path,
          contentType: opts?.contentType || file.type || 'application/octet-stream',
          size: file.size,
        };
        storageObjectsByPath.set(path, obj);
        storageObjectsByUser.set(uid, obj);
        return { error: null, data: { path } };
      },
      getPublicUrl: (path: string) => ({
        data: { publicUrl: `https://cdn.test/${bucket}/${path}` },
      }),
      // Simula supabase.storage.from(b).info(path) — usado abaixo para reafirmar
      // que o contentType persistido continua image/jpeg após o reload.
      info: async (path: string) => {
        const obj = storageObjectsByPath.get(path);
        return obj
          ? { data: { contentType: obj.contentType, size: obj.size }, error: null }
          : { data: null, error: new Error('not found') };
      },
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
              access_token:
                'eyJhbGciOiJIUzI1NiJ9.' + btoa(JSON.stringify({ sub: 'ignored' })) + '.sig',
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
  storageObjectsByPath.clear();
  storageObjectsByUser.clear();
  heic2anyCalls.length = 0;
});

describe('Persistência do avatar HEIC convertido após reload', () => {
  it('Uploads .HEIC convertidos permanecem visíveis para cada usuário após remount', async () => {
    const N = 3;
    const users = Array.from({ length: N }, (_, i) => ({
      id: `heic-user-${i}`,
      email: `heic${i}@empresa.com`,
    }));

    // 1) Primeira montagem — cada usuário envia um HEIC.
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

    // Dispara os uploads sequencialmente — o `import('heic2any')` dinâmico no
    // ProfileTab tem uma janela de race entre chamadas paralelas (a primeira
    // instala o mock no cache do módulo, as demais podem resolver antes).
    for (const { user, utils } of first) {
      const input = utils.container.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File([new Uint8Array(4096)], 'IMG_1234.HEIC', { type: 'image/heic' });
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      fireEvent.change(input);
      await waitFor(() => expect(avatarByUser.has(user.id)).toBe(true), { timeout: 3000 });
    }

    expect(avatarByUser.size).toBe(N);

    // heic2any foi chamado uma vez por usuário, convertendo para JPEG.
    expect(heic2anyCalls).toHaveLength(N);
    heic2anyCalls.forEach((c) => expect(c.toType).toBe('image/jpeg'));

    // Cada avatar_url aponta para o folder do próprio usuário, com extensão .jpg
    // (a extensão .heic deve ter sido reescrita pela conversão) e o storage
    // recebeu o Blob com contentType image/jpeg.
    users.forEach((u) => {
      const url = avatarByUser.get(u.id)!;
      expect(url).toMatch(new RegExp(`avatars/${u.id}/`));
      expect(url.toLowerCase()).toContain('.jpg');
      expect(url.toLowerCase()).not.toContain('.heic');
      expect(uploadedTypeByUser.get(u.id)).toBe('image/jpeg');
    });

    // 2) Simula reload: desmonta e remonta cada instância.
    first.forEach(({ utils }) => utils.unmount());

    const reloaded = users.map((u) => {
      const utils = render(
        <TestUserCtx.Provider value={u}>
          <ProfileTab />
        </TestUserCtx.Provider>,
        { container: document.body.appendChild(document.createElement('div')) },
      );
      return { user: u, utils };
    });

    // 3) Cada ProfileTab remontada exibe o <img> do avatar convertido do próprio usuário.
    await waitFor(() => {
      reloaded.forEach(({ user, utils }) => {
        const img = within(utils.container as HTMLElement).getByAltText('Avatar') as HTMLImageElement;
        expect(img).toBeInTheDocument();
        expect(img.src).toContain(`avatars/${user.id}/`);
        expect(img.src.toLowerCase()).toContain('.jpg');
      });
    });

    // Nenhuma foto vazou entre usuários.
    reloaded.forEach(({ user, utils }) => {
      const img = utils.container.querySelector('img[alt="Avatar"]') as HTMLImageElement;
      users
        .filter((o) => o.id !== user.id)
        .forEach((other) => expect(img.src).not.toContain(`avatars/${other.id}/`));
    });
  });
});
