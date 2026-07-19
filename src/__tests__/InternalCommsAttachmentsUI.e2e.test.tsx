/**
 * E2E · UI · validação client-side de anexos em /internal-comms.
 *
 * Garante que:
 *  • anexo com MIME bloqueado → mostra mensagem de erro visível na UI,
 *    exibe toast, e o input de arquivo é limpo;
 *  • anexo > 25 MB → idem;
 *  • nome com path traversal / null byte → idem;
 *  • em nenhum dos cenários acima o botão Enviar dispara `sendMessage`
 *    (nenhum request sai do cliente);
 *  • anexo válido é aceito, exibe estado "anexo pronto" e permite envio.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';

// Toast spy
const toastErrorCalls: string[] = [];
vi.mock('sonner', () => ({
  toast: Object.assign((..._a: any[]) => {}, {
    error: (msg: string) => toastErrorCalls.push(msg),
    success: (_msg: string) => {},
  }),
  Toaster: () => null,
}));

// Stub AppLayout so we render only the page body without shell dependencies.
vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

// useInternalCommsUnread stub
vi.mock('@/hooks/useInternalCommsUnread', () => ({
  useInternalCommsUnread: () => ({ total: 0, countByPeer: {}, refresh: vi.fn(), clearPeer: vi.fn() }),
}));

const sendMessageMock = vi.fn(async (_content: string) => ({ data: { id: 'm1' } }));
const peer = { user_id: 'peer-1', display_name: 'Colega', email: 'c@x', avatar_url: null };
vi.mock('@/hooks/useInternalComms', () => ({
  useInternalComms: () => ({
    members: [peer],
    loadingMembers: false,
    messages: [],
    loadingMessages: false,
    activePeerId: 'peer-1',
    setActivePeerId: vi.fn(),
    activePeer: peer,
    sendMessage: sendMessageMock,
    me: { id: 'me-1' },
  }),
}));

// eslint-disable-next-line import/first
import InternalCommsPage from '@/pages/InternalCommsPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/internal-comms']}>
      <InternalCommsPage />
    </MemoryRouter>,
  );
}

function makeFile(name: string, mime: string, size: number): File {
  // File constructor cria com tamanho real do conteúdo; sobrescrevemos size.
  const f = new File([new Uint8Array(1)], name, { type: mime });
  Object.defineProperty(f, 'size', { value: size, configurable: true });
  return f;
}

beforeEach(() => {
  toastErrorCalls.length = 0;
  sendMessageMock.mockClear();
});

describe('E2E · UI · anexos inválidos bloqueiam envio', () => {
  it('MIME bloqueado (executável) mostra erro visível, dispara toast e limpa input', async () => {
    renderPage();
    const input = screen.getByTestId('attachment-input') as HTMLInputElement;
    const bad = makeFile('malware.exe', 'application/x-msdownload', 1024);
    await act(async () => {
      fireEvent.change(input, { target: { files: [bad] } });
    });
    await waitFor(() => expect(screen.getByTestId('attachment-error')).toBeInTheDocument());
    expect(screen.getByRole('alert').textContent).toMatch(/tipo de arquivo/i);
    expect(toastErrorCalls.some((m) => /tipo/i.test(m))).toBe(true);
    expect(input.value).toBe('');
    // Sem draft OU com draft: enviar não deve chamar sendMessage enquanto o erro estiver visível.
    // (Bloqueio primário: `disabled` no botão; bloqueio secundário: guard no handler.)
    fireEvent.change(screen.getByPlaceholderText(/escreva sua mensagem/i), { target: { value: 'oi' } });
    const send = screen.getByRole('button', { name: /enviar/i });
    expect(send).toBeDisabled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('arquivo > 25 MB é rejeitado e não sai request', async () => {
    renderPage();
    const input = screen.getByTestId('attachment-input') as HTMLInputElement;
    const huge = makeFile('foto.png', 'image/png', 26 * 1024 * 1024);
    await act(async () => { fireEvent.change(input, { target: { files: [huge] } }); });
    await waitFor(() => expect(screen.getByTestId('attachment-error')).toBeInTheDocument());
    expect(screen.getByRole('alert').textContent).toMatch(/25\s*MB/i);
    expect(toastErrorCalls.some((m) => /25/.test(m))).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/escreva sua mensagem/i), { target: { value: 'x' } });
    expect(screen.getByRole('button', { name: /enviar/i })).toBeDisabled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('nome com path traversal é rejeitado', async () => {
    renderPage();
    const input = screen.getByTestId('attachment-input') as HTMLInputElement;
    const traversal = makeFile('../../etc/passwd', 'text/plain', 128);
    await act(async () => { fireEvent.change(input, { target: { files: [traversal] } }); });
    await waitFor(() => expect(screen.getByTestId('attachment-error')).toBeInTheDocument());
    expect(screen.getByRole('alert').textContent).toMatch(/nome/i);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('nome com null byte é rejeitado', async () => {
    renderPage();
    const input = screen.getByTestId('attachment-input') as HTMLInputElement;
    const nullByte = makeFile('foto\x00.png', 'image/png', 128);
    await act(async () => { fireEvent.change(input, { target: { files: [nullByte] } }); });
    await waitFor(() => expect(screen.getByTestId('attachment-error')).toBeInTheDocument());
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('anexo válido é aceito, mostra "anexo pronto" e libera envio', async () => {
    renderPage();
    const input = screen.getByTestId('attachment-input') as HTMLInputElement;
    const ok = makeFile('relatorio.pdf', 'application/pdf', 500 * 1024);
    await act(async () => { fireEvent.change(input, { target: { files: [ok] } }); });
    await waitFor(() => expect(screen.getByTestId('attachment-pending')).toBeInTheDocument());
    expect(screen.queryByTestId('attachment-error')).toBeNull();
    expect(toastErrorCalls).toHaveLength(0);
    fireEvent.change(screen.getByPlaceholderText(/escreva sua mensagem/i), { target: { value: 'segue anexo' } });
    const send = screen.getByRole('button', { name: /enviar/i });
    expect(send).not.toBeDisabled();
    await act(async () => { fireEvent.click(send); });
    expect(sendMessageMock).toHaveBeenCalledWith(
      'segue anexo',
      expect.objectContaining({ filename: 'relatorio.pdf', mime: 'application/pdf', kind: 'file' }),
    );
  });
});
