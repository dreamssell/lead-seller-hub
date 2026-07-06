/**
 * Snapshots do cabeçalho do painel do dono (CEO Home).
 *
 * Garantem que:
 *  - o breadcrumb NUNCA contém "Dashboard CEO";
 *  - os textos novos ("Performance da Empresa", "Painel executivo completo")
 *    permanecem presentes em desktop e mobile;
 *  - o fallback "Minha empresa" aparece quando o contexto vem vazio;
 *  - nomes longos são truncados via classes CSS (o valor completo fica no title).
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CeoBreadcrumb } from './CeoBreadcrumb';

describe('CeoBreadcrumb · snapshots', () => {
  it('snapshot: com sub-empresa "Mult Seguros e Consórcios"', () => {
    const { container } = render(
      <CeoBreadcrumb contextName="Mult Seguros e Consórcios" />,
    );
    expect(container.firstChild).toMatchSnapshot();
    expect(container.innerHTML).not.toMatch(/Dashboard CEO/);
    expect(container.innerHTML).toContain('Performance da Empresa');
    expect(container.innerHTML).toContain('Painel executivo completo');
    expect(container.innerHTML).toContain('Painel executivo'); // versão mobile
  });

  it('snapshot: contextName vazio → fallback "Minha empresa"', () => {
    const { container, getByTestId } = render(<CeoBreadcrumb contextName="" />);
    expect(getByTestId('ceo-breadcrumb-context')).toHaveTextContent('Minha empresa');
    expect(container.firstChild).toMatchSnapshot();
  });

  it('snapshot: contextName null → fallback "Minha empresa"', () => {
    const { getByTestId } = render(<CeoBreadcrumb contextName={null} />);
    expect(getByTestId('ceo-breadcrumb-context')).toHaveTextContent('Minha empresa');
  });

  it('snapshot: nome longo é truncado (classe truncate + title com valor completo)', () => {
    const longName = 'Consórcios & Seguros Reunidos do Brasil Central S/A - Filial 42';
    const { getByTestId } = render(<CeoBreadcrumb contextName={longName} />);
    const el = getByTestId('ceo-breadcrumb-context');
    expect(el.className).toMatch(/truncate/);
    expect(el.className).toMatch(/max-w-\[45vw\]/);
    expect(el).toHaveAttribute('title', longName);
    expect(el).toHaveTextContent(longName);
  });
});
