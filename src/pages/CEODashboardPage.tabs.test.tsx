/**
 * Snapshots adicionais e checks de "não-regressão de labels" para o
 * CEODashboardPage — cobre estados mobile, loading e todas as 4 abas
 * (Financeiro, Comercial, Operacional, Qualitativo).
 *
 * Rationale: montar o CEODashboardPage completo em jsdom exige mockar
 * recharts, html2canvas, jsPDF, AppLayout etc. Para os requisitos do
 * usuário (garantir textos + ausência de "Dashboard CEO" em toda aba e
 * estado de carregamento), a checagem estática do fonte + snapshot do
 * cabeçalho responsivo é o formato mais estável e barato.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CeoBreadcrumb } from '@/components/dashboard/CeoBreadcrumb';

const ceoSrc = readFileSync(resolve(__dirname, '../pages/CEODashboardPage.tsx'), 'utf8');

// Extrai apenas o corpo de cada TabsContent para inspecionar aba por aba.
function extractTab(name: string): string {
  const re = new RegExp(`<TabsContent value="${name}"[\\s\\S]*?</TabsContent>`);
  const m = ceoSrc.match(re);
  if (!m) throw new Error(`Aba não encontrada: ${name}`);
  return m[0];
}

describe('CEODashboardPage · abas', () => {
  const TABS = ['financeiro', 'comercial', 'operacional', 'qualitativo'] as const;

  it.each(TABS)('aba "%s" NÃO contém o rótulo legado "Dashboard CEO"', (tab) => {
    expect(extractTab(tab)).not.toMatch(/Dashboard CEO/);
  });

  it('as 4 abas obrigatórias existem: Financeiro, Comercial, Operacional, Qualitativo', () => {
    for (const t of TABS) {
      expect(ceoSrc).toMatch(new RegExp(`TabsTrigger value="${t}"`));
    }
  });

  it('estado de carregamento e estados vazios não mencionam "Dashboard CEO"', () => {
    // Captura blocos loading / empty comuns.
    const loadingBlocks = ceoSrc.match(/loading[\s\S]{0,400}/gi) || [];
    for (const block of loadingBlocks) {
      expect(block).not.toMatch(/Dashboard CEO/);
    }
    // Skeleton/animate-pulse também não deve carregar o rótulo.
    const skeletonBlocks = ceoSrc.match(/animate-pulse[\s\S]{0,400}/g) || [];
    for (const block of skeletonBlocks) {
      expect(block).not.toMatch(/Dashboard CEO/);
    }
  });

  it('exportação PDF usa "Relatório Executivo — Lead Seller" (não "Dashboard CEO")', () => {
    expect(ceoSrc).toMatch(/Relatório Executivo/);
    expect(ceoSrc).not.toMatch(/pdf\.text\([^)]*Dashboard CEO/);
  });
});

describe('CeoBreadcrumb · snapshots mobile-first e truncamento', () => {
  it('classe truncate + max-w mobile presentes no elemento de contexto', () => {
    const { getByTestId, container } = render(
      <CeoBreadcrumb contextName="Consórcios & Seguros Reunidos do Brasil Central S/A - Filial 42" />,
    );
    const ctx = getByTestId('ceo-breadcrumb-context');
    expect(ctx.className).toMatch(/truncate/);
    expect(ctx.className).toMatch(/max-w-\[45vw\]/);   // mobile-first
    expect(ctx.className).toMatch(/sm:max-w-\[240px\]/); // sm breakpoint
    expect(ctx.className).toMatch(/md:max-w-\[360px\]/); // md breakpoint
    // Selo tem versão mobile ("Painel executivo") escondida em sm
    expect(container.innerHTML).toContain('Painel executivo');
    expect(container.innerHTML).toContain('Painel executivo completo');
    // Root empilha em mobile.
    expect((container.firstChild as HTMLElement).className).toMatch(/flex-col\s+gap-2\s+sm:flex-row/);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('snapshot mobile: contextName vazio (fallback + selo curto)', () => {
    const { container } = render(<CeoBreadcrumb contextName={undefined} />);
    expect(container.innerHTML).toContain('Minha empresa');
    expect(container.innerHTML).toContain('Painel executivo');
    expect(container.innerHTML).not.toMatch(/Dashboard CEO/);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('snapshot mobile: nome muito longo permanece com title acessível', () => {
    const longName = 'A'.repeat(200);
    const { getByTestId, container } = render(<CeoBreadcrumb contextName={longName} />);
    const ctx = getByTestId('ceo-breadcrumb-context');
    expect(ctx.getAttribute('title')).toBe(longName);
    expect(container.firstChild).toMatchSnapshot();
  });
});
