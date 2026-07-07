/**
 * Integração de UI: White Label aparece SOMENTE no formulário de Sub-empresas.
 * No formulário de Empresas (CompaniesTab), a chave 'white-label' deve estar
 * ausente da lista de Páginas bloqueadas.
 */
import { describe, it, expect } from 'vitest';
import { BLOCKABLE_PAGES } from '@/lib/navigation';
import fs from 'node:fs';
import path from 'node:path';

const companiesTab = fs.readFileSync(
  path.resolve(__dirname, '../../src/components/cadastros/CompaniesTab.tsx'),
  'utf8',
);
const whiteLabelTab = fs.readFileSync(
  path.resolve(__dirname, '../../src/components/cadastros/WhiteLabelTab.tsx'),
  'utf8',
);

describe('White Label visibilidade em Cadastros', () => {
  it("BLOCKABLE_PAGES ainda expõe 'white-label' (usado em Sub-empresas)", () => {
    expect(BLOCKABLE_PAGES.some((p) => p.key === 'white-label')).toBe(true);
  });

  it("CompaniesTab filtra 'white-label' da lista de Páginas bloqueadas", () => {
    expect(companiesTab).toMatch(/BLOCKABLE_PAGES\.filter\([^)]*white-label[^)]*\)/);
  });

  it('WhiteLabelTab (Sub-empresas) NÃO filtra e mantém white-label na lista', () => {
    expect(whiteLabelTab).toMatch(/BLOCKABLE_PAGES\.map/);
    expect(whiteLabelTab).not.toMatch(/BLOCKABLE_PAGES\.filter[^)]*white-label/);
  });
});
