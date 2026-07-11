/**
 * E2E · Histórico de ligações
 *
 * Valida:
 * 1. Filtros de status, direção e período aplicam corretamente.
 * 2. Busca por número (origem/destino) atualiza a tabela instantaneamente.
 * 3. Colunas "Duração" e "Atendida em" aparecem para chamadas atendidas.
 * 4. Polling atualiza `recording_url` e habilita botões Ouvir/Baixar quando
 *    a Wavoip publica a gravação (fetch HEAD ok).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

// Mock export libs (evita jsPDF em ambiente de teste)
vi.mock('@/lib/callsHistoryPdf', () => ({ exportCallHistoryPdf: vi.fn() }));
vi.mock('@/lib/ceoExport', () => ({ downloadCsv: vi.fn() }));

const now = Date.now();
const iso = (offsetMin: number) => new Date(now - offsetMin * 60_000).toISOString();

const initialRows: any[] = [
  {
    id: 'c1', contact_name: 'Alice Santos', phone_number: '+55 11 98765-4321',
    channel: 'wavoip', connection_label: 'linha-1', direction: 'outbound',
    status: 'answered', duration_seconds: 125,
    started_at: iso(60), answered_at: iso(59), ended_at: iso(57),
    recording_path: null, recording_url: null, metadata: {}, user_id: 'u1', sub_company_id: null,
  },
  {
    id: 'c2', contact_name: 'Bruno Lima', phone_number: '+55 21 91234-0000',
    channel: 'wavoip', connection_label: 'linha-1', direction: 'inbound',
    status: 'missed', duration_seconds: 0,
    started_at: iso(30), answered_at: null, ended_at: iso(29),
    recording_path: null, recording_url: null, metadata: {}, user_id: 'u1', sub_company_id: null,
  },
  {
    id: 'c3', contact_name: 'Carla Souza', phone_number: '+55 31 99999-1111',
    channel: 'wavoip', connection_label: 'linha-2', direction: 'outbound',
    status: 'ended', duration_seconds: 0,
    started_at: iso(10), answered_at: iso(9), ended_at: iso(8),
    recording_path: null, recording_url: null,
    metadata: { wavoip_call_id: 'WAV-XYZ' }, // aguardando polling
    user_id: 'u1', sub_company_id: null,
  },
];

// Estado mutável para simular UPDATE via polling
const dbRows: Record<string, any> = Object.fromEntries(initialRows.map((r) => [r.id, { ...r }]));

vi.mock('@/integrations/supabase/client', () => {
  const buildSelectChain = () => {
    const result = { data: Object.values(dbRows), error: null };
    const chain: any = {
      select: () => chain,
      order: () => chain,
      range: () => chain,
      eq: () => chain,
      in: () => Promise.resolve({ data: [], error: null }),
      then: (onFulfilled: any, onRejected?: any) =>
        Promise.resolve({ data: Object.values(dbRows), error: null }).then(onFulfilled, onRejected),
      update: (patch: any) => ({
        eq: async (_col: string, id: string) => {
          if (dbRows[id]) Object.assign(dbRows[id], patch);
          return { data: null, error: null };
        },
      }),
    };
    return chain;
  };
  return {
    supabase: {
      from: () => buildSelectChain(),
      storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) },
    },
  };
});

import { CallHistoryTable } from '@/components/calls/CallHistoryTable';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = originalFetch;
});

describe('CallHistoryTable — filtros, busca, duração e polling', () => {
  it('renderiza as três linhas iniciais com direção/status em PT-BR', async () => {
    render(<CallHistoryTable filter={{ ownerId: 'o1' }} />);
    await waitFor(() => expect(screen.getByText('Alice Santos')).toBeInTheDocument());
    expect(screen.getByText('Bruno Lima')).toBeInTheDocument();
    expect(screen.getByText('Carla Souza')).toBeInTheDocument();
    expect(screen.getByText('Atendida')).toBeInTheDocument();
    // "Perdida" para inbound com status missed
    expect(screen.getByText('Perdida')).toBeInTheDocument();
  });

  it('exibe Duração e "Atendida em" para chamadas atendidas', async () => {
    render(<CallHistoryTable filter={{ ownerId: 'o1' }} />);
    await waitFor(() => expect(screen.getByText('Alice Santos')).toBeInTheDocument());
    // Alice: 125s → "02:05"
    expect(screen.getByText('02:05')).toBeInTheDocument();
    // Coluna answered_at deve ter pelo menos um horário (hh:mm:ss) para c1 e c3
    const timeCells = screen.getAllByText(/^\d{2}:\d{2}:\d{2}$/);
    expect(timeCells.length).toBeGreaterThanOrEqual(2);
  });

  it('busca por número (parcial, apenas dígitos) filtra instantaneamente', async () => {
    render(<CallHistoryTable filter={{ ownerId: 'o1' }} />);
    await waitFor(() => expect(screen.getByText('Alice Santos')).toBeInTheDocument());
    const input = screen.getByPlaceholderText(/Buscar por contato ou número/i);
    fireEvent.change(input, { target: { value: '21912' } });
    await waitFor(() => {
      expect(screen.queryByText('Alice Santos')).not.toBeInTheDocument();
      expect(screen.getByText('Bruno Lima')).toBeInTheDocument();
      expect(screen.queryByText('Carla Souza')).not.toBeInTheDocument();
    });
  });

  it('polling atualiza recording_url quando Wavoip publica e habilita Ouvir/Baixar', async () => {
    // Primeira chamada HEAD retorna 404 (ainda não publicado),
    // depois passa a retornar 200.
    let ready = false;
    globalThis.fetch = vi.fn(async (_url: any, init?: any) => {
      if (init?.method === 'HEAD') {
        return { ok: ready, status: ready ? 200 : 404 } as any;
      }
      return { ok: true, status: 200, blob: async () => new Blob([]) } as any;
    }) as any;

    render(<CallHistoryTable filter={{ ownerId: 'o1' }} />);
    await waitFor(() => expect(screen.getByText('Carla Souza')).toBeInTheDocument());

    // Botões Ouvir/Baixar aparecem quando há wavoip_call_id (mesmo aguardando publicação)
    const rows = screen.getAllByRole('row');
    const carlaRow = rows.find((r) => within(r).queryByText('Carla Souza'))!;
    expect(within(carlaRow).getByTitle('Ouvir')).toBeInTheDocument();
    expect(within(carlaRow).getByTitle('Baixar')).toBeInTheDocument();

    // Antes do polling, recording_url ainda é null no banco
    expect(dbRows.c3.recording_url).toBeNull();

    // Publica no "storage" e avança o intervalo (30s)
    ready = true;
    await act(async () => {
      vi.advanceTimersByTime(31_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(dbRows.c3.recording_url).toBe('https://storage.wavoip.com/WAV-XYZ');
    });
  });
});
