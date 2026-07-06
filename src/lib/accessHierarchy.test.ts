import { describe, it, expect } from 'vitest';
import { mergeBlockedPages, isPageBlocked } from './accessHierarchy';

describe('accessHierarchy · blocked_pages (empresa + sub-empresa)', () => {
  it('une chaves da empresa-mãe com a sub-empresa sem duplicar', () => {
    expect(mergeBlockedPages(['reports', 'ai-agents'], ['ai-agents', 'signatures']))
      .toEqual(expect.arrayContaining(['reports', 'ai-agents', 'signatures']));
    expect(mergeBlockedPages(['reports'], ['reports'])).toEqual(['reports']);
  });

  it('quando a empresa bloqueia, a sub-empresa NUNCA pode acessar', () => {
    // Mult Seguros bloqueou "reports"; a sub-empresa não tem nada bloqueado.
    expect(isPageBlocked('reports', ['reports'], [])).toBe(true);
    // Mesmo se a sub-empresa não listar, a herança prevalece.
    expect(isPageBlocked('reports', ['reports'], ['ai-agents'])).toBe(true);
  });

  it('sub-empresa pode adicionar bloqueios além da empresa-mãe', () => {
    expect(isPageBlocked('ai-agents', ['reports'], ['ai-agents'])).toBe(true);
    // Página não listada em nenhum: liberada.
    expect(isPageBlocked('chat', ['reports'], ['ai-agents'])).toBe(false);
  });

  it('tolera null/undefined em qualquer lado', () => {
    expect(mergeBlockedPages(null, null)).toEqual([]);
    expect(mergeBlockedPages(undefined, ['x'])).toEqual(['x']);
    expect(isPageBlocked('reports', null, ['reports'])).toBe(true);
  });
});
