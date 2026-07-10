/**
 * E2E · Sidebar / navegação lateral NÃO expõe o módulo Meeting (`/video`).
 *
 * Requisitos:
 *  1. O item de menu "Meeting" (ou qualquer rota `/video`) NUNCA aparece na
 *     sidebar — nem para donos, nem para não-donos, em nenhum estado
 *     (colapsada, expandida, com/sem admin de conta, com sub-empresa).
 *  2. Se um item malicioso/plugado tentar navegar por `/video`, a rota
 *     protegida `ownerOnly` bloqueia não-donos e exibe a mensagem literal.
 *  3. Nenhum rótulo/aria-label da sidebar contém "Meeting" ou "Video".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { navSections } from '@/lib/navigation';

const ownerState = { isOwner: false, loading: false };
vi.mock('@/hooks/usePlatformOwner', () => ({
  usePlatformOwner: () => ownerState,
}));

const authState: any = {
  session: { user: { id: 'u1' } },
  loading: false, accessLoading: false,
  sessionValidated: true, tenantResolved: true,
  access: { blocked_pages: [], allowed_pages: [], is_account_admin: false, status: 'active', sub_company_id: null, feature_landing_builder: false },
};
vi.mock('@/contexts/AuthContext', () => ({
  EXTERNAL_LOGIN_URL: '',
  useAuth: () => ({
    ...authState,
    canAccessPage: () => true, // libera tudo que a sidebar oferece — o filtro real é `ownerOnly`
    signOut: vi.fn(),
  }),
}));

// eslint-disable-next-line import/first
import { Sidebar } from '@/components/layout/Sidebar';

beforeEach(() => {
  ownerState.isOwner = false;
  ownerState.loading = false;
  authState.access = { blocked_pages: [], allowed_pages: [], is_account_admin: false, status: 'active', sub_company_id: null, feature_landing_builder: false };
});

function renderSidebar(props: { expanded?: boolean; collapsible?: boolean } = {}) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Sidebar expanded={props.expanded ?? true} collapsible={props.collapsible ?? false} />
    </MemoryRouter>,
  );
}

describe('E2E · Sidebar nunca expõe Meeting/`/video`', () => {
  it('navigation.ts NÃO define nenhum item apontando para /video', () => {
    for (const section of navSections) {
      for (const item of section.items) {
        expect(item.path).not.toMatch(/^\/video(\/|$)/);
        expect(item.label.toLowerCase()).not.toContain('meeting');
        expect(item.label.toLowerCase()).not.toContain('videochamada');
      }
    }
  });

  const matrix = [
    { name: 'não-dono, expandida', owner: false, expanded: true, collapsible: false },
    { name: 'não-dono, colapsada (rail)', owner: false, expanded: false, collapsible: true },
    { name: 'não-dono admin de conta + sub-empresa', owner: false, expanded: true, collapsible: false,
      access: { is_account_admin: true, sub_company_id: 'sub-1' } },
    { name: 'dono, expandida', owner: true, expanded: true, collapsible: false },
    { name: 'dono, colapsada', owner: true, expanded: false, collapsible: true },
  ] as const;

  for (const scenario of matrix) {
    it(`sidebar (${scenario.name}) não renderiza item Meeting/Video`, () => {
      ownerState.isOwner = scenario.owner;
      if ('access' in scenario && scenario.access) {
        authState.access = { ...authState.access, ...scenario.access };
      }
      renderSidebar({ expanded: scenario.expanded, collapsible: scenario.collapsible });

      // Nenhum botão com rótulo Meeting/Video/Videochamada
      expect(screen.queryByRole('button', { name: /meeting/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /video(chamada|conferência)?/i })).not.toBeInTheDocument();
      // Nenhum texto solto na aside
      expect(screen.queryByText(/^meeting$/i)).not.toBeInTheDocument();
    });
  }
});
