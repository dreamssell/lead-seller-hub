/**
 * E2E · Biometria só aparece no mobile.
 *
 * Garante que o card `BiometricCredentialsCard` só é renderizado em `ProfilePage`
 * quando o viewport é mobile (<768px). Em desktop, o card não deve existir no DOM
 * e nenhum botão/link de "Cadastrar biometria" pode ser acionado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';

const isMobileRef = { current: false };

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => isMobileRef.current,
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/settings/ProfileTab', () => ({
  default: () => <div data-testid="profile-tab" />,
}));

vi.mock('@/components/settings/RoleAuditCard', () => ({
  default: () => <div data-testid="role-audit" />,
}));

vi.mock('@/components/settings/BiometricCredentialsCard', () => ({
  default: () => (
    <div data-testid="biometric-card">
      <button>Cadastrar biometria</button>
    </div>
  ),
}));

import ProfilePage from '@/pages/ProfilePage';

describe('BiometricCredentialsCard visibility', () => {
  beforeEach(() => {
    isMobileRef.current = false;
  });

  it('não renderiza no desktop (>=768px)', () => {
    isMobileRef.current = false;
    const { queryByTestId, queryByText } = render(<ProfilePage />);
    expect(queryByTestId('biometric-card')).toBeNull();
    expect(queryByText(/cadastrar biometria/i)).toBeNull();
  });

  it('renderiza no mobile (<768px)', () => {
    isMobileRef.current = true;
    const { getByTestId, getByText } = render(<ProfilePage />);
    expect(getByTestId('biometric-card')).toBeInTheDocument();
    expect(getByText(/cadastrar biometria/i)).toBeInTheDocument();
  });
});
