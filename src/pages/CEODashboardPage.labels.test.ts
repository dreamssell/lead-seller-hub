/**
 * Testes de textos/labels do painel do dono (CEO Home).
 *
 * Rendering completo da página exigiria mockar Recharts, jsPDF, html2canvas,
 * Supabase, AppLayout etc. Como o objetivo aqui é apenas garantir que a
 * página do dono NÃO regrida os textos combinados com o usuário, fazemos
 * uma verificação estática no fonte — barata e resistente a refactors de UI.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, '../pages/CEODashboardPage.tsx'), 'utf8');
const breadcrumbSrc = readFileSync(resolve(__dirname, '../components/dashboard/CeoBreadcrumb.tsx'), 'utf8');
const navSrc = readFileSync(resolve(__dirname, '../lib/navigation.ts'), 'utf8');
const dashSrc = readFileSync(resolve(__dirname, '../pages/Dashboard.tsx'), 'utf8');

describe('CEO Home · textos do dono', () => {
  it('usa o título "Performance da Empresa"', () => {
    expect(src).toMatch(/title="Performance da Empresa"/);
  });

  it('mostra o indicador "Painel executivo completo" (via CeoBreadcrumb)', () => {
    expect(breadcrumbSrc).toMatch(/Painel executivo completo/);
  });

  it('inclui a seção "Acompanhar leads por estágio"', () => {
    expect(src).toMatch(/Acompanhar leads por estágio/);
  });

  it('não expõe rótulos legados "Dashboard CEO" ou "Dashboard Executivo" visíveis ao usuário', () => {
    // Comentários internos podem conter "CEO" — checamos apenas literais de UI.
    expect(src).not.toMatch(/"Dashboard CEO"/);
    expect(src).not.toMatch(/>Dashboard CEO</);
    expect(src).not.toMatch(/title="Dashboard Executivo"/);
  });

  it('exporta relatório com nome "performance-empresa-*.pdf"', () => {
    expect(src).toMatch(/performance-empresa-/);
    expect(src).not.toMatch(/dashboard-ceo-/);
  });
});

describe('Navegação · menu "Dashboard CEO" removido', () => {
  it('não existe um item de menu com label "Dashboard CEO"', () => {
    expect(navSrc).not.toMatch(/label:\s*'Dashboard CEO'/);
  });
});

describe('Dashboard · dono renderiza a CEO Home', () => {
  it('delega para CEODashboardPage quando isOwner=true', () => {
    expect(dashSrc).toMatch(/if\s*\(isOwner\)\s*\{[\s\S]*CEODashboardPage/);
  });
});
