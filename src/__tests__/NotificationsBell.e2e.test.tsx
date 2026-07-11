/**
 * E2E · Sino de notificações (NotificationsBell)
 *
 * Cobre:
 *  1. Filtros (Todas / Plataforma / Internas) — contadores e listagem.
 *  2. Paginação por scroll infinito (PAGE_SIZE=20) — incremento ao rolar.
 *  3. Silenciar por tipo — mute suprime toasts mas mantém itens no sino.
 *  4. Sincronização cross-tab — UPDATE realtime marca como lido em outra aba.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// ── Estado in-memory do mock ─────────────────────────────────────────────────
type Notif = {
  id: string; user_id: string; type: string; title: string; body: string | null;
  lead_id: string | null; channel: string | null; source: string | null;
  read_at: string | null; created_at: string;
};
type Msg = {
  id: string; sender_id: string; recipient_id: string; content: string;
  created_at: string; read_at: string | null;
};

let notifications: Notif[] = [];
let messages: Msg[] = [];
const rtHandlers: Array<{ table: string; event: string; filter?: string; cb: (p: any) => void }> = [];
vi.mock('sonner', () => {
  const fn = vi.fn();
  return { toast: Object.assign(fn, { success: vi.fn(), error: vi.fn(), info: vi.fn() }) };
});
// eslint-disable-next-line import/first
import { toast as toastFn } from 'sonner';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me' } }),
}));

vi.mock('@/integrations/supabase/client', () => {
  const selectHandler = (table: string) => {
    if (table === 'notifications') {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: notifications.filter(n => n.user_id === 'me'), error: null }),
            }),
          }),
        }),
        update: (patch: any) => ({
          eq: (_col: string, id: string) => {
            const target = notifications.find(n => n.id === id);
            if (target) Object.assign(target, patch);
            return {
              // update-all variant used por markAllRead
              is: async () => {
                notifications.forEach(n => { if (n.user_id === 'me' && !n.read_at) n.read_at = patch.read_at; });
                return { error: null };
              },
              then: (r: any) => r({ error: null }),
            };
          },
        }),
      };
    }
    if (table === 'internal_messages') {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: messages.filter(m => m.recipient_id === 'me'), error: null }),
            }),
          }),
        }),
        update: (patch: any) => ({
          eq: (_col: string, id: string) => {
            const target = messages.find(m => m.id === id);
            if (target) Object.assign(target, patch);
            return {
              is: async () => {
                messages.forEach(m => { if (m.recipient_id === 'me' && !m.read_at) m.read_at = patch.read_at; });
                return { error: null };
              },
              then: (r: any) => r({ error: null }),
            };
          },
        }),
      };
    }
    if (table === 'profiles') {
      const chain = {
        select: () => chain,
        in: async () => ({ data: [{ user_id: 'peer', display_name: 'Colega X', email: null }], error: null }),
        eq: () => ({ maybeSingle: async () => ({ data: { display_name: 'Colega X', email: null }, error: null }) }),
      };
      return chain;
    }
    return { select: () => ({}) };
  };
  return {
    supabase: {
      from: (t: string) => selectHandler(t),
      channel: (_name: string) => {
        const obj: any = {
          on(_type: string, cfg: any, cb: any) {
            rtHandlers.push({ table: cfg.table, event: cfg.event, filter: cfg.filter, cb });
            return obj;
          },
          subscribe() { return obj; },
        };
        return obj;
      },
      removeChannel: vi.fn(),
    },
  };
});

// eslint-disable-next-line import/first
import { NotificationsBell } from '@/components/notifications/NotificationsBell';

function emit(table: string, event: string, row: any) {
  rtHandlers
    .filter(h => h.table === table && h.event === event)
    .forEach(h => h.cb({ new: row }));
}

function makeNotif(i: number, overrides: Partial<Notif> = {}): Notif {
  return {
    id: `n${i}`, user_id: 'me', type: 'lead_created',
    title: `Notificação #${i}`, body: `corpo ${i}`,
    lead_id: null, channel: null, source: null, read_at: null,
    created_at: new Date(Date.parse('2025-01-01T00:00:00Z') + i * 1000).toISOString(),
    ...overrides,
  };
}
function makeMsg(i: number, overrides: Partial<Msg> = {}): Msg {
  return {
    id: `m${i}`, sender_id: 'peer', recipient_id: 'me',
    content: `mensagem #${i}`,
    created_at: new Date(Date.parse('2025-02-01T00:00:00Z') + i * 1000).toISOString(),
    read_at: null,
    ...overrides,
  };
}

function renderBell() {
  return render(
    <MemoryRouter>
      <NotificationsBell />
    </MemoryRouter>
  );
}

async function openBell() {
  const trigger = document.querySelector('button[aria-haspopup="menu"]') as HTMLElement;
  // Radix DropdownMenu abre em pointerdown; fireEvent evita as animações lentas do userEvent.
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.click(trigger);
  await waitFor(() => {
    expect(document.querySelector('[role="menu"]')).toBeTruthy();
  });
}

beforeEach(() => {
  notifications = [];
  messages = [];
  rtHandlers.length = 0;
  (toastFn as unknown as ReturnType<typeof vi.fn>).mockClear();
  localStorage.clear();
});

describe('NotificationsBell · filtros, paginação, mute e cross-tab', () => {
  it('filtra entre Todas / Plataforma / Internas com contadores corretos', async () => {
    notifications = [makeNotif(1), makeNotif(2), makeNotif(3)];
    messages = [makeMsg(1), makeMsg(2)];

    renderBell();
    const user = await openBell();

    await waitFor(() => {
      expect(screen.getByText(/Todas \(5\)/)).toBeInTheDocument();
      expect(screen.getByText(/Plataforma \(3\)/)).toBeInTheDocument();
      expect(screen.getByText(/Internas \(2\)/)).toBeInTheDocument();
    });

    // Todas: mistura plataforma + internas
    expect(screen.getByText('Notificação #3')).toBeInTheDocument();
    expect(screen.getByText(/Nova mensagem interna/)).toBeInTheDocument();

    // Plataforma: só notificações padrão
    await user.click(screen.getByText(/Plataforma \(3\)/));
    await waitFor(() => {
      expect(screen.queryByText(/Nova mensagem interna/)).not.toBeInTheDocument();
      expect(screen.getByText('Notificação #1')).toBeInTheDocument();
    });

    // Internas: só mensagens
    await user.click(screen.getByText(/Internas \(2\)/));
    await waitFor(() => {
      expect(screen.queryByText('Notificação #1')).not.toBeInTheDocument();
      expect(screen.getAllByText(/Nova mensagem interna/).length).toBeGreaterThan(0);
    });
  });

  it('paginação por scroll infinito carrega em blocos de 20', async () => {
    notifications = Array.from({ length: 55 }, (_, i) => makeNotif(i));
    renderBell();
    await openBell();

    await waitFor(() => expect(screen.getByText(/Notificação #54/)).toBeInTheDocument());
    // Inicialmente 20 visíveis (PAGE_SIZE).
    expect(screen.queryByText('Notificação #34')).toBeInTheDocument(); // 55 - 20 → começa em #54..#35
    expect(screen.queryByText('Notificação #30')).not.toBeInTheDocument();
    expect(screen.getByText(/Mostrando 20 de 55/)).toBeInTheDocument();

    // Rola até o fim para disparar o próximo bloco.
    const scroller = screen.getByText(/Mostrando 20 de 55/).parentElement as HTMLElement;
    Object.defineProperty(scroller, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scroller, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(scroller, 'scrollTop', { value: 600, configurable: true, writable: true });
    fireEvent.scroll(scroller);

    await waitFor(() => expect(screen.getByText(/Mostrando 40 de 55/)).toBeInTheDocument());
    expect(screen.getByText('Notificação #15')).toBeInTheDocument();
  });

  it('silenciar por tipo suprime o toast mas mantém o item no sino', async () => {
    renderBell();
    const user = await openBell();

    // Abre popover de preferências e ativa mute para "internas".
    const prefBtn = screen.getByTitle('Preferências');
    await user.click(prefBtn);
    const muteInternal = await screen.findByLabelText('Mensagens internas');
    await user.click(muteInternal);

    // Emite INSERT de mensagem interna via realtime.
    await act(async () => {
      emit('internal_messages', 'INSERT', {
        id: 'live-1', sender_id: 'peer', recipient_id: 'me',
        content: 'mensagem silenciada', read_at: null,
        created_at: new Date().toISOString(),
      });
      await new Promise(r => setTimeout(r, 20));
    });

    // Toast NÃO deve ter sido chamado por conta do mute.
    expect(toastFn).not.toHaveBeenCalled();

    // Emite INSERT de notificação de plataforma — não silenciada.
    await act(async () => {
      emit('notifications', 'INSERT', makeNotif(999, { title: 'Plataforma viva' }));
      await new Promise(r => setTimeout(r, 20));
    });
    expect(toastFn).toHaveBeenCalledWith('Plataforma viva', expect.any(Object));

    // Preferência persistida em localStorage.
    expect(JSON.parse(localStorage.getItem('ls.bell.mute')!)).toMatchObject({ internal: true });
  });

  it('sincroniza contador de não-lidas quando outra aba marca como lida (UPDATE realtime)', async () => {
    notifications = [makeNotif(1), makeNotif(2)];
    messages = [makeMsg(1)];
    renderBell();
    await openBell();

    // Contador inicial: 3 não lidas.
    await waitFor(() => {
      const badge = document.querySelector('span.bg-primary.text-primary-foreground');
      expect(badge?.textContent).toBe('3');
    });

    // Outra aba marca as duas notificações e a mensagem como lidas → chega via UPDATE.
    const now = new Date().toISOString();
    await act(async () => {
      emit('notifications', 'UPDATE', { ...notifications[0], read_at: now });
      emit('notifications', 'UPDATE', { ...notifications[1], read_at: now });
      emit('internal_messages', 'UPDATE', { ...messages[0], read_at: now });
      await new Promise(r => setTimeout(r, 20));
    });

    await waitFor(() => {
      const badge = document.querySelector('span.bg-primary.text-primary-foreground');
      expect(badge).toBeNull(); // sumiu porque unread=0
    });
  });
});
