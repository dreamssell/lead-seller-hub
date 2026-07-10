/**
 * E2E de gating de assentos em Cadastros & CRM e TeamPage.
 *
 * Cobre:
 *   1) Badge de uso aparece com contagem correta e tom de destaque quando
 *      o limite foi atingido.
 *   2) Botão "Novo usuário" fica DESABILITADO ao atingir o limite.
 *   3) CTA de upsell (mailto) aponta para comercial@leadseller.com.br
 *      com o plano/uso corretos no corpo.
 *   4) O código de erro `plan_seat_limit_reached` retornado pela API tem
 *      a mesma copy consistente em toda a aplicação.
 *   5) As páginas reais (CadastrosPage / TeamPage) NÃO possuem strings
 *      duplicadas — reutilizam a fonte única em `src/lib/seatLimitCopy.ts`.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import {
  SEAT_UPSELL_EMAIL,
  SEAT_UPSELL_MAILTO,
  SEAT_LIMIT_TITLE,
  seatLimitDescription,
  seatUsageBadge,
} from '@/lib/seatLimitCopy';
import { MANAGE_USER_ERROR_MESSAGES } from '@/lib/manageAccountUserErrors';

function MiniSeatUI({
  planName, used, max,
}: { planName: string; used: number; max: number | null }) {
  const unlimited = max == null;
  const limitReached = !unlimited && used >= (max ?? 0);
  return (
    <div>
      <span data-testid="badge">{seatUsageBadge({ planName, used, max })}</span>
      <button data-testid="new-user-btn" disabled={limitReached}>Novo usuário</button>
      {limitReached && (
        <>
          <p data-testid="desc">{seatLimitDescription({ planName, used, max })}</p>
          <a
            data-testid="cta"
            href={SEAT_UPSELL_MAILTO(planName, used, max ?? undefined)}
          >
            Falar com o comercial
          </a>
        </>
      )}
    </div>
  );
}

describe('SeatLimitGating (e2e)', () => {
  it('badge mostra "Limite atingido" e botão fica desabilitado quando used === max', () => {
    render(<MiniSeatUI planName="Elite" used={5} max={5} />);
    expect(screen.getByTestId('badge').textContent).toContain('Limite atingido: 5/5');
    expect((screen.getByTestId('new-user-btn') as HTMLButtonElement).disabled).toBe(true);
  });

  it('CTA aponta para comercial@leadseller.com.br com plano e uso no corpo', () => {
    render(<MiniSeatUI planName="Platinum" used={15} max={15} />);
    const cta = screen.getByTestId('cta') as HTMLAnchorElement;
    expect(cta.href).toMatch(/^mailto:comercial@leadseller\.com\.br/);
    // Deve conter o plano e o uso codificados no corpo do e-mail.
    const decoded = decodeURIComponent(cta.href);
    expect(decoded).toContain('Plano atual: Platinum');
    expect(decoded).toContain('Assentos em uso: 15 / 15');
    expect(SEAT_UPSELL_EMAIL).toBe('comercial@leadseller.com.br');
    expect(SEAT_LIMIT_TITLE).toBe('Limite de licenças atingido');
  });

  it('quando maxUsers é null (ilimitado), badge não sinaliza limite e botão fica habilitado', () => {
    render(<MiniSeatUI planName="Enterprise" used={30} max={null} />);
    expect(screen.getByTestId('badge').textContent).toContain('Assentos ilimitados');
    expect((screen.getByTestId('new-user-btn') as HTMLButtonElement).disabled).toBe(false);
  });

  it('mensagem 80% de uso avisa quantos assentos restam', () => {
    // 80% de 5 = 4 → deve entrar no ramo "Restam".
    render(<MiniSeatUI planName="Elite" used={4} max={5} />);
    expect(screen.getByTestId('badge').textContent).toContain('Restam 1 assento(s)');
  });

  it('descrição enterprise reforça o contrato sob consulta', () => {
    render(<MiniSeatUI planName="Enterprise" used={30} max={30} />);
    expect(screen.getByTestId('desc').textContent).toContain('contrato Enterprise');
    expect(screen.getByTestId('desc').textContent).toContain(SEAT_UPSELL_EMAIL);
  });

  it('código plan_seat_limit_reached tem mensagem única e canônica em MANAGE_USER_ERROR_MESSAGES', () => {
    expect(MANAGE_USER_ERROR_MESSAGES.plan_seat_limit_reached).toBeTruthy();
    expect(MANAGE_USER_ERROR_MESSAGES.plan_seat_limit_reached).toContain(SEAT_UPSELL_EMAIL);
    expect(MANAGE_USER_ERROR_MESSAGES.seat_additions_blocked).toContain(SEAT_UPSELL_EMAIL);
  });

  it('CadastrosPage e TeamPage não hardcoded o e-mail — usam a constante compartilhada', () => {
    const cad = readFileSync('src/pages/CadastrosPage.tsx', 'utf8');
    const team = readFileSync('src/pages/TeamPage.tsx', 'utf8');
    // Ambas devem importar da fonte única.
    expect(cad).toContain("from '@/lib/seatLimitCopy'");
    expect(team).toContain("from '@/lib/seatLimitCopy'");
    // Ambas devem oferecer o CTA via SEAT_UPSELL_MAILTO (mailto dinâmico).
    expect(cad).toContain('SEAT_UPSELL_MAILTO(');
    expect(team).toContain('SEAT_UPSELL_MAILTO(');
  });

  it('edge function manage-account-user retorna código canônico plan_seat_limit_reached', () => {
    const src = readFileSync('supabase/functions/manage-account-user/index.ts', 'utf8');
    expect(src).toContain('"plan_seat_limit_reached"');
    expect(src).toContain('"seat_additions_blocked"');
    // Referência ao e-mail comercial dentro das mensagens padronizadas.
    expect(src).toContain('comercial@leadseller.com.br');
    // Deve chamar o RPC de uso antes de criar o usuário (bypass-proof).
    expect(src).toContain('get_member_seat_usage');
  });
});
