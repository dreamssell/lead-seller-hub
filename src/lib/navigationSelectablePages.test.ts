/**
 * Regras de visibilidade do seletor de páginas em Cadastros/Usuários,
 * Empresas e Sub-empresas.
 *  - White Label: SOMENTE no escopo de Sub-empresa.
 *  - Status do Backend (ownerOnly): SOMENTE para o dono da plataforma.
 */
import { describe, it, expect } from 'vitest';
import { getSelectablePages, BLOCKABLE_PAGES } from './navigation';

describe('getSelectablePages · escopo de permissões', () => {
  it('Empresa (não-dono): esconde white-label e status', () => {
    const pages = getSelectablePages({ isPlatformOwner: false, isSubCompanyScope: false });
    const keys = pages.map(p => p.key);
    expect(keys).not.toContain('white-label');
    expect(keys).not.toContain('status');
  });

  it('Sub-empresa (não-dono): mostra white-label, esconde status', () => {
    const pages = getSelectablePages({ isPlatformOwner: false, isSubCompanyScope: true });
    const keys = pages.map(p => p.key);
    expect(keys).toContain('white-label');
    expect(keys).not.toContain('status');
  });

  it('Dono da plataforma (Empresa): mostra status, esconde white-label', () => {
    const pages = getSelectablePages({ isPlatformOwner: true, isSubCompanyScope: false });
    const keys = pages.map(p => p.key);
    expect(keys).toContain('status');
    expect(keys).not.toContain('white-label');
  });

  it('Dono da plataforma (Sub-empresa): mostra ambos', () => {
    const pages = getSelectablePages({ isPlatformOwner: true, isSubCompanyScope: true });
    const keys = pages.map(p => p.key);
    expect(keys).toContain('status');
    expect(keys).toContain('white-label');
  });

  it('BLOCKABLE_PAGES ainda contém todas as chaves (fonte da verdade)', () => {
    const keys = BLOCKABLE_PAGES.map(p => p.key);
    expect(keys).toContain('white-label');
    expect(keys).toContain('status');
    expect(keys).toContain('signatures');
    expect(keys).toContain('developer');
  });
});
