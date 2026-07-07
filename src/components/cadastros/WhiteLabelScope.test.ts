/**
 * Integração de UI: White Label aparece SOMENTE no formulário de Sub-empresas.
 * A regra canônica está em `getSelectablePages` (src/lib/navigation.ts).
 * Este teste garante que os formulários consumidores usam o helper e não
 * regridem para uma listagem crua de BLOCKABLE_PAGES.
 */
import { describe, it, expect } from 'vitest';
import { BLOCKABLE_PAGES, getSelectablePages } from '@/lib/navigation';
import fs from 'node:fs';
import path from 'node:path';

const companiesTab = fs.readFileSync(
  path.resolve(__dirname, 'CompaniesTab.tsx'),
  'utf8',
);
const whiteLabelTab = fs.readFileSync(
  path.resolve(__dirname, 'WhiteLabelTab.tsx'),
  'utf8',
);
const cadastrosPage = fs.readFileSync(
  path.resolve(__dirname, '../../pages/CadastrosPage.tsx'),
  'utf8',
);

describe('White Label visibilidade em Cadastros', () => {
  it("BLOCKABLE_PAGES ainda expõe 'white-label' (fonte de verdade)", () => {
    expect(BLOCKABLE_PAGES.some((p) => p.key === 'white-label')).toBe(true);
  });

  it('getSelectablePages esconde white-label no escopo Empresa', () => {
    const keys = getSelectablePages({ isPlatformOwner: false, isSubCompanyScope: false }).map(p => p.key);
    expect(keys).not.toContain('white-label');
  });

  it('CompaniesTab usa selectablePages (não lista BLOCKABLE_PAGES cru)', () => {
    expect(companiesTab).toMatch(/getSelectablePages\(/);
    expect(companiesTab).toMatch(/selectablePages\.map/);
    expect(companiesTab).not.toMatch(/BLOCKABLE_PAGES\.map/);
  });

  it('WhiteLabelTab (Sub-empresas) também usa selectablePages com isSubCompanyScope: true', () => {
    expect(whiteLabelTab).toMatch(/getSelectablePages\(\{\s*isPlatformOwner:[^,]+,\s*isSubCompanyScope:\s*true/);
    expect(whiteLabelTab).toMatch(/selectablePages\.map/);
  });

  it('CadastrosPage (Usuários) usa selectablePages para as permissões por página', () => {
    expect(cadastrosPage).toMatch(/getSelectablePages\(/);
    expect(cadastrosPage).toMatch(/selectablePages\.map/);
  });
});
